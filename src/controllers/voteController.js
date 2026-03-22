const mongoose = require("mongoose");
const Student = require("../models/Student");
const VotingSession = require("../models/VotingSession");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const College = require("../models/College");
const VerificationLog = require("../models/VerificationLog");
const faceProviderService = require("../services/faceProviderService");
const emailService = require("../services/emailService");
const { createVerificationLog } = require("../services/biometricAnalyticsService");
const { isWithinGeofence, isValidCoordinates } = require("../utils/geofence");
const cacheService = require("../services/cacheService");
const {
  getTenantScopedFilter,
  getTenantCacheNamespace,
  assignTenantId,
} = require("../utils/tenantScope");
const { getTenantEligibilityPolicy, getTenantSettings } = require("../utils/tenantSettings");

function mapVerificationFailureReason(result = {}) {
  const code = String(result.code || "").trim().toUpperCase();
  const message = String(result.error || result.message || "")
    .trim()
    .toUpperCase();

  if (code === "NO_FACE_DETECTED" || message.includes("NO FACE DETECTED")) {
    return "NO_FACE_DETECTED";
  }
  if (code === "MULTIPLE_FACES" || message.includes("MULTIPLE FACES")) {
    return "MULTIPLE_FACES";
  }
  if (code === "FACE_API_TIMEOUT" || message.includes("TIMED OUT")) {
    return "FACE_API_TIMEOUT";
  }
  if (
    code === "RATE_LIMIT_EXCEEDED" ||
    code === "CONCURRENCY_LIMIT_EXCEEDED"
  ) {
    return "RATE_LIMIT_TRIGGERED";
  }
  if (message.includes("CLEARER PHOTO") || message.includes("IMAGE QUALITY")) {
    return "LOW_QUALITY_IMAGE";
  }
  if (code === "BIOMETRIC_PROVIDER_NOT_CONFIGURED" || code === "FACE_API_ERROR") {
    return "FACE_API_ERROR";
  }
  return "FACE_VERIFICATION_FAILED";
}

async function logVerificationAttempt(req, payload = {}) {
  if (!req.tenantId && !req.tenant?._id) {
    return null;
  }

  try {
    return await createVerificationLog(req, payload);
  } catch (error) {
    console.error("Verification log write failed:", error);
    return null;
  }
}

class VoteController {
  /**
   * Submit a vote
   * POST /api/vote
   */
  async submitVote(req, res) {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();
    let voteLockKey = null;
    let voteLockAcquired = false;

    try {
      const { session_id, choices, image_url, lat, lng, device_id } = req.body;
      const studentId = req.studentId;
      const tenantNamespace = getTenantCacheNamespace(req);
      const tenantSettings = getTenantSettings(req.tenant);
      const biometricThreshold = Number(
        tenantSettings.voting?.face_match_threshold || 80,
      );

      // Validate required fields
      if (
        !session_id ||
        !choices ||
        !image_url ||
        lat === undefined ||
        lng === undefined
      ) {
        await mongoSession.abortTransaction();
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "MISSING_REQUIRED_FIELDS",
          device_id,
          ip_address: req.ip,
          image_url: image_url || null,
        });
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate coordinates
      if (!isValidCoordinates(lat, lng)) {
        await mongoSession.abortTransaction();
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "NO_LOCATION",
          device_id,
          ip_address: req.ip,
          image_url,
        });
        return res.status(400).json({ error: "Invalid coordinates" });
      }

      // ATOMIC VOTE LOCK - Prevent duplicate votes with Redis
      voteLockKey = `vote_lock:${tenantNamespace}:${session_id}:${studentId}`;
      voteLockAcquired = await cacheService.setNX(
        voteLockKey,
        Date.now(),
        3600, // 1 hour lock
      );

      if (!voteLockAcquired) {
        await mongoSession.abortTransaction();
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "CONCURRENT_REQUEST",
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
        });
        return res.status(409).json({
          error: "You have already voted in this session",
          code: "ALREADY_VOTED",
        });
      }

      // Get student
      const student = await Student.findOne(
        getTenantScopedFilter(req, { _id: studentId }),
      );
      if (!student) {
        await mongoSession.abortTransaction();
        // Release lock on error
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "USER_NOT_FOUND",
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
        });
        return res.status(404).json({ error: "Student not found" });
      }

      // Get session
      const session = await VotingSession.findOne(
        getTenantScopedFilter(req, { _id: session_id }),
      ).populate("candidates");
      if (!session) {
        await mongoSession.abortTransaction();
        // Release lock on error
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "SESSION_NOT_FOUND",
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
        });
        return res.status(404).json({ error: "Voting session not found" });
      }

      // Update session status
      await session.updateStatus();

      // Check if session is active
      if (session.status !== "active") {
        await mongoSession.abortTransaction();
        // Release lock on error
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "SESSION_INACTIVE",
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
          meta: { session_status: session.status },
        });
        return res.status(400).json({
          error: `Voting session is ${session.status}. You can only vote during active sessions.`,
        });
      }

      // Double-check database (belt and suspenders approach)
      if (student.has_voted_sessions.includes(session_id)) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "ALREADY_VOTED",
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
        });
        return res.status(409).json({
          error: "You have already voted in this session",
          code: "ALREADY_VOTED",
        });
      }

      // Check eligibility (college, department, level)
      const eligibilityPolicy = getTenantEligibilityPolicy(req.tenant);

      if (
        eligibilityPolicy.college &&
        session.eligible_college &&
        student.college !== session.eligible_college
      ) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "COLLEGE_MISMATCH",
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
        });
        return res.status(403).json({
          error:
            "You are not eligible for this voting session (college mismatch)",
        });
      }

      // Check department eligibility (convert IDs to names)
      if (
        eligibilityPolicy.department &&
        session.eligible_departments &&
        session.eligible_departments.length > 0
      ) {
        const colleges = await College.find(getTenantScopedFilter(req, {}))
          .select("departments")
          .lean();
        const departmentNames = [];

        colleges.forEach((college) => {
          college.departments.forEach((dept) => {
            if (session.eligible_departments.includes(dept._id.toString())) {
              departmentNames.push(dept.name);
            }
          });
        });

        if (!departmentNames.includes(student.department)) {
          await mongoSession.abortTransaction();
          await cacheService.del(voteLockKey);
          await logVerificationAttempt(req, {
            user_id: studentId,
            session_id,
            threshold_used: biometricThreshold,
            result: "rejected",
            failure_reason: "DEPARTMENT_MISMATCH",
            device_id,
            ip_address: req.ip,
            image_url,
            geo_location: { lat, lng },
          });
          return res.status(403).json({
            error:
              "You are not eligible for this voting session (department mismatch)",
          });
        }
      }

      if (
        eligibilityPolicy.level &&
        session.eligible_levels &&
        session.eligible_levels.length > 0
      ) {
        if (!session.eligible_levels.includes(student.level)) {
          await mongoSession.abortTransaction();
          await cacheService.del(voteLockKey);
          await logVerificationAttempt(req, {
            user_id: studentId,
            session_id,
            threshold_used: biometricThreshold,
            result: "rejected",
            failure_reason: "LEVEL_MISMATCH",
            device_id,
            ip_address: req.ip,
            image_url,
            geo_location: { lat, lng },
          });
          return res.status(403).json({
            error:
              "You are not eligible for this voting session (level mismatch)",
          });
        }
      }

      // Check geofence (skip if off-campus is allowed or geofencing is globally disabled)
      const geofenceDisabled = process.env.DISABLE_GEOFENCE === "true";
      if (!geofenceDisabled && !session.is_off_campus_allowed) {
        const withinGeofence = isWithinGeofence(
          lat,
          lng,
          session.location.lat,
          session.location.lng,
          session.location.radius_meters,
        );

        if (!withinGeofence) {
          await mongoSession.abortTransaction();
          await cacheService.del(voteLockKey);
          await logVerificationAttempt(req, {
            user_id: studentId,
            session_id,
            threshold_used: biometricThreshold,
            result: "rejected",
            failure_reason: "GEOFENCE_VIOLATION",
            device_id,
            ip_address: req.ip,
            image_url,
            geo_location: { lat, lng },
          });
          return res.status(403).json({
            error:
              "You are outside the voting geofence. Please ensure you are within the designated voting location.",
            code: "GEOFENCE_VIOLATION",
          });
        }
      }

      // Face++ Face Verification
      console.log("Starting face verification...");

      // Check if student has registered face token
      if (!student.face_token) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "NO_FACE_TOKEN",
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
        });
        return res.status(400).json({
          error:
            "No registered face found. Please contact administrator to register your face.",
          code: "NO_REGISTERED_FACE",
        });
      }

      // Verify face matches registered face
      const faceVerification = await faceProviderService.verifyFace(
        student.face_token,
        image_url,
        {
          threshold_override: biometricThreshold,
        },
      );

      if (!faceVerification.success) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          confidence_score:
            typeof faceVerification.confidence === "number"
              ? faceVerification.confidence
              : null,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: mapVerificationFailureReason(faceVerification),
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
          meta: {
            provider_code: faceVerification.code || null,
            provider_error: faceVerification.error || null,
          },
        });
        return res.status(400).json({
          error: faceVerification.error,
          code: "FACE_VERIFICATION_FAILED",
        });
      }

      // Check if confidence meets threshold
      if (!faceVerification.is_match) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          confidence_score: faceVerification.confidence,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "LOW_CONFIDENCE",
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
        });

        return res.status(403).json({
          error: faceVerification.message,
          code: "FACE_VERIFICATION_FAILED",
          confidence: faceVerification.confidence,
        });
      }

      const verifiedFaceToken = faceVerification.face_token2;
      const faceConfidence = faceVerification.confidence;

      // Validate choices
      if (!Array.isArray(choices) || choices.length === 0) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          confidence_score: faceConfidence,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "INVALID_CHOICES",
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
        });
        return res.status(400).json({ error: "Invalid choices format" });
      }

      // Verify all candidates exist and belong to this session
      const candidateIds = choices.map((c) => c.candidate_id);
      const candidates = await Candidate.find({
        ...getTenantScopedFilter(req, {}),
        _id: { $in: candidateIds },
        session_id: session_id,
      });

      if (candidates.length !== choices.length) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          confidence_score: faceConfidence,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "INVALID_CANDIDATE_SELECTION",
          device_id,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
        });
        return res.status(400).json({ error: "Invalid candidate selection" });
      }

      // Create vote records and increment candidate counts
      const voteRecords = [];
      const voteDetails = [];

      for (const choice of choices) {
        const candidate = candidates.find(
          (c) => c._id.toString() === choice.candidate_id,
        );

        if (!candidate) {
          await mongoSession.abortTransaction();
          await cacheService.del(voteLockKey);
          return res
            .status(400)
            .json({ error: `Invalid candidate: ${choice.candidate_id}` });
        }

        // Increment vote count atomically
        await Candidate.updateOne(
          getTenantScopedFilter(req, { _id: choice.candidate_id }),
          { $inc: { vote_count: 1 } },
          { session: mongoSession },
        );

        // Create vote record
        const voteRecord = assignTenantId(req, {
          student_id: studentId,
          session_id: session_id,
          candidate_id: choice.candidate_id,
          position: choice.category || candidate.position,
          geo_location: { lat, lng },
          face_match_score: faceConfidence,
          face_verification_passed: true,
          face_token: verifiedFaceToken,
          status: "valid",
          device_id: device_id || null,
          ip_address: req.ip,
        });

        voteRecords.push(voteRecord);
        voteDetails.push({
          position: choice.category || candidate.position,
          candidate_name: candidate.name,
        });
      }

      // Save all votes
      await Vote.insertMany(voteRecords, { session: mongoSession });

      // Face++ verification is complete - no post-vote face registration needed
      // The student's face_token is already stored and was verified during this vote

      // Add session to student's has_voted_sessions
      await Student.updateOne(
        getTenantScopedFilter(req, { _id: studentId }),
        { $push: { has_voted_sessions: session_id } },
        { session: mongoSession },
      );

      await mongoSession.commitTransaction();

      // Update Redis counters atomically (after successful commit)
      for (const choice of choices) {
        await cacheService.incr(
          `vote_count:${tenantNamespace}:${session_id}:${choice.candidate_id}`,
        );
      }
      await cacheService.incr(`total_votes:${tenantNamespace}:${session_id}`);

      // Invalidate cached results for this session
      await cacheService.del(`live_results:${tenantNamespace}:${session_id}`);

      // Invalidate student profile cache (has_voted_sessions changed)
      await cacheService.del(`student:profile:${studentId}`);
      await cacheService.delPattern(
        `eligible_sessions:${tenantNamespace}:${studentId}:*`,
      );

      // Send vote confirmation email
      await logVerificationAttempt(req, {
        user_id: studentId,
        session_id,
        confidence_score: faceConfidence,
        threshold_used: biometricThreshold,
        result: "accepted",
        failure_reason: null,
        device_id,
        ip_address: req.ip,
        image_url,
        geo_location: { lat, lng },
        meta: {
          verified_face_token: verifiedFaceToken,
          choice_count: choices.length,
        },
      });

      emailService
        .sendVoteConfirmation(student, session, voteDetails, req.tenant || null)
        .catch((err) => {
          console.error("Failed to send vote confirmation email:", err);
        });

      res.status(201).json({
        message: "Vote submitted successfully",
        votes: voteDetails,
        session: {
          title: session.title,
          id: session._id,
        },
      });
    } catch (error) {
      await mongoSession.abortTransaction();
      if (voteLockAcquired && voteLockKey) {
        await cacheService.del(voteLockKey);
      }
      console.error("Submit vote error:", error);
      await logVerificationAttempt(req, {
        user_id: req.studentId || null,
        session_id: req.body?.session_id || null,
        threshold_used: Number(
          getTenantSettings(req.tenant).voting?.face_match_threshold || 80,
        ),
        result: "rejected",
        failure_reason: "DB_WRITE_FAIL",
        device_id: req.body?.device_id || null,
        ip_address: req.ip,
        image_url: req.body?.image_url || null,
        geo_location:
          typeof req.body?.lat === "number" && typeof req.body?.lng === "number"
            ? { lat: req.body.lat, lng: req.body.lng }
            : undefined,
        meta: {
          error: error.message,
        },
      });
      res.status(500).json({ error: "Failed to submit vote" });
    } finally {
      mongoSession.endSession();
    }
  }

  /**
   * Get student's voting history
   * GET /api/vote/history
   */
  async getVotingHistory(req, res) {
    try {
      const studentId = req.studentId;

      const votes = await Vote.find(
        getTenantScopedFilter(req, { student_id: studentId, status: "valid" }),
      )
        .populate("session_id", "title description start_time end_time")
        .populate("candidate_id", "name position photo_url")
        .sort({ timestamp: -1 });

      // Group votes by session
      const votingHistory = votes.reduce((acc, vote) => {
        const sessionId = vote.session_id._id.toString();

        if (!acc[sessionId]) {
          acc[sessionId] = {
            session: {
              id: vote.session_id._id,
              title: vote.session_id.title,
              description: vote.session_id.description,
              start_time: vote.session_id.start_time,
              end_time: vote.session_id.end_time,
            },
            votes: [],
            voted_at: vote.timestamp,
          };
        }

        acc[sessionId].votes.push({
          position: vote.position,
          candidate: {
            id: vote.candidate_id._id,
            name: vote.candidate_id.name,
            photo_url: vote.candidate_id.photo_url,
          },
        });

        return acc;
      }, {});

      res.json({
        history: Object.values(votingHistory),
      });
    } catch (error) {
      console.error("Get voting history error:", error);
      res.status(500).json({ error: "Failed to get voting history" });
    }
  }

  /**
   * Get vote by ID
   * GET /api/vote/:id
   */
  async getVoteById(req, res) {
    try {
      const { id } = req.params;

      const vote = await Vote.findOne(getTenantScopedFilter(req, { _id: id }))
        .populate(
          "student_id",
          "matric_no full_name email college department level",
        )
        .populate("session_id", "title description start_time end_time status")
        .populate("candidate_id", "name position photo_url bio")
        .lean();

      if (!vote) {
        return res.status(404).json({ error: "Vote not found" });
      }

      res.json({
        vote: {
          id: vote._id,
          student: vote.student_id
            ? {
                id: vote.student_id._id,
                matric_no: vote.student_id.matric_no,
                full_name: vote.student_id.full_name,
                email: vote.student_id.email,
                college: vote.student_id.college,
                department: vote.student_id.department,
                level: vote.student_id.level,
              }
            : null,
          session: vote.session_id
            ? {
                id: vote.session_id._id,
                title: vote.session_id.title,
                description: vote.session_id.description,
                start_time: vote.session_id.start_time,
                end_time: vote.session_id.end_time,
                status: vote.session_id.status,
              }
            : null,
          candidate: vote.candidate_id
            ? {
                id: vote.candidate_id._id,
                name: vote.candidate_id.name,
                position: vote.candidate_id.position,
                photo_url: vote.candidate_id.photo_url,
                bio: vote.candidate_id.bio,
              }
            : null,
          position: vote.position,
          geo_location: vote.geo_location,
          face_match_score: vote.face_match_score,
          face_verification_passed: vote.face_verification_passed,
          status: vote.status,
          device_id: vote.device_id,
          ip_address: vote.ip_address,
          timestamp: vote.timestamp,
          created_at: vote.createdAt,
          updated_at: vote.updatedAt,
        },
      });
    } catch (error) {
      console.error("Get vote by ID error:", error);
      res.status(500).json({ error: "Failed to get vote details" });
    }
  }
}

module.exports = new VoteController();
