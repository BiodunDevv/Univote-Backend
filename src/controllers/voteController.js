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

const BIOMETRIC_LOCKOUT_THRESHOLD = 3;
const BIOMETRIC_LOCKOUT_TTL_SECONDS = 5 * 60;

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
  if (code === "NO_REGISTERED_FACE" || message.includes("NO REGISTERED FACE")) {
    return "NO_REGISTERED_FACE";
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
  if (code === "LOW_QUALITY_IMAGE" || message.includes("QUALITY")) {
    return "LOW_QUALITY_IMAGE";
  }
  if (code === "AWS_BIOMETRIC_ERROR" || code === "BIOMETRIC_PROVIDER_NOT_CONFIGURED") {
    return "AWS_BIOMETRIC_ERROR";
  }
  return "FACE_VERIFICATION_FAILED";
}

function isLikelyMobileVotingDevice(value = "") {
  const normalized = String(value || "").toLowerCase();

  if (!normalized) return false;

  return (
    normalized.includes("iphone") ||
    normalized.includes("ipad") ||
    normalized.includes("ipod") ||
    normalized.includes("android") ||
    normalized.includes("mobile") ||
    normalized.includes("opera mini") ||
    normalized.includes("iemobile") ||
    normalized.includes("standalone")
  );
}

function getLivenessFailureReason(result = {}) {
  const code = String(result.code || "").trim().toUpperCase();
  const status = String(result.status || "").trim().toUpperCase();

  if (code === "LIVENESS_FAILED") return "LIVENESS_FAILED";
  if (status === "EXPIRED") return "LIVENESS_SESSION_EXPIRED";
  if (status === "FAILED") return "LIVENESS_FAILED";
  if (status === "IN_PROGRESS" || status === "CREATED") {
    return "LIVENESS_INCOMPLETE";
  }
  return "LIVENESS_FAILED";
}

function buildBiometricFailureKey(tenantNamespace, sessionId, studentId) {
  return `biometric_failures:${tenantNamespace}:${sessionId}:${studentId}`;
}

function buildBiometricLockoutKey(tenantNamespace, sessionId, studentId) {
  return `biometric_lockout:${tenantNamespace}:${sessionId}:${studentId}`;
}

function buildLockoutPayload(ttlSeconds) {
  return {
    locked_until: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    retry_after_seconds: ttlSeconds,
  };
}

function logBiometricEvent(event, payload = {}) {
  console.info(
    JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  );
}

async function getBiometricLockoutState(tenantNamespace, sessionId, studentId) {
  const lockoutKey = buildBiometricLockoutKey(tenantNamespace, sessionId, studentId);
  const streakKey = buildBiometricFailureKey(tenantNamespace, sessionId, studentId);

  const [lockoutPayload, ttl, failStreak] = await Promise.all([
    cacheService.get(lockoutKey),
    cacheService.ttl(lockoutKey),
    cacheService.get(streakKey),
  ]);

  return {
    locked: ttl > 0,
    retry_after_seconds: ttl > 0 ? ttl : 0,
    locked_until:
      ttl > 0
        ? lockoutPayload?.locked_until || new Date(Date.now() + ttl * 1000).toISOString()
        : null,
    fail_streak: Number(failStreak || 0),
  };
}

async function incrementBiometricFailure(tenantNamespace, sessionId, studentId) {
  const streakKey = buildBiometricFailureKey(tenantNamespace, sessionId, studentId);
  const lockoutKey = buildBiometricLockoutKey(tenantNamespace, sessionId, studentId);
  const failStreak = await cacheService.incr(
    streakKey,
    BIOMETRIC_LOCKOUT_TTL_SECONDS,
  );

  if (failStreak >= BIOMETRIC_LOCKOUT_THRESHOLD) {
    const lockoutPayload = buildLockoutPayload(BIOMETRIC_LOCKOUT_TTL_SECONDS);
    await cacheService.set(lockoutKey, lockoutPayload, BIOMETRIC_LOCKOUT_TTL_SECONDS);
    return {
      fail_streak: failStreak,
      lockout_triggered: true,
      ...lockoutPayload,
    };
  }

  return {
    fail_streak: failStreak,
    lockout_triggered: false,
    locked_until: null,
    retry_after_seconds: 0,
  };
}

async function clearBiometricFailureState(tenantNamespace, sessionId, studentId) {
  const streakKey = buildBiometricFailureKey(tenantNamespace, sessionId, studentId);
  const lockoutKey = buildBiometricLockoutKey(tenantNamespace, sessionId, studentId);
  await Promise.all([cacheService.del(streakKey), cacheService.del(lockoutKey)]);
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
  async createLivenessSession(req, res) {
    try {
      const status = await faceProviderService.getStatus();
      if (!status.configured) {
        return res.status(503).json({
          error: "AWS biometric verification is not configured.",
          code: "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
        });
      }

      const result = await faceProviderService.createLivenessSession();
      if (!result.success) {
        return res.status(503).json({
          error: result.error || "Failed to start liveness verification.",
          code: result.code || "LIVENESS_FAILED",
        });
      }

      logBiometricEvent("vote_liveness_session_created", {
        tenant_id: req.tenantId || req.tenant?._id || null,
        student_id: req.studentId || null,
        session_id: result.session_id,
        provider: result.provider || "aws_rekognition",
        region: status.region || null,
      });

      return res.status(201).json({
        session_id: result.session_id,
        provider: result.provider || "aws_rekognition",
        region: status.region,
        configured: true,
        required: status.liveness_required !== false,
      });
    } catch (error) {
      console.error("Create liveness session error:", error);
      return res.status(500).json({
        error: "Failed to start liveness verification.",
        code: "LIVENESS_FAILED",
      });
    }
  }

  async getLivenessSessionResult(req, res) {
    try {
      const { id } = req.params;
      const studentId = req.studentId || null;
      const result = await faceProviderService.getLivenessResult(id);
      logBiometricEvent("vote_liveness_result_resolved", {
        tenant_id: req.tenantId || req.tenant?._id || null,
        student_id: studentId,
        session_id: id,
        provider: result.provider || "aws_rekognition",
        status: result.status || null,
        passed: result.passed === true,
        confidence: result.confidence ?? null,
        threshold: result.threshold ?? null,
      });
      if (!result.success) {
        return res.status(400).json({
          error: result.error || "Failed to fetch liveness result.",
          code: result.code || "LIVENESS_FAILED",
          status: result.status || null,
        });
      }

      let ownership_verified = null;
      let compare_confidence = null;
      let compare_threshold = null;
      let matched_face_id = null;
      let code = null;
      let message = null;

      if (result.passed === true && studentId) {
        const biometricThreshold = Number(
          getTenantSettings(req.tenant).voting?.face_match_threshold || 70,
        );
        const student = await Student.findOne(
          getTenantScopedFilter(req, { _id: studentId }),
        ).select("aws_face_id aws_face_collection_id");

        if (!student?.aws_face_id || !student?.aws_face_collection_id) {
          ownership_verified = false;
          code = "NO_REGISTERED_FACE";
          message =
            "Your account does not have an enrolled biometric profile yet. Please contact your university administrator.";
        } else {
          const ownershipResult = await faceProviderService.verifyFaceBytes(
            student,
            result.reference_image,
            {
              threshold_override: biometricThreshold,
            },
          );

          compare_confidence =
            typeof ownershipResult.confidence === "number"
              ? ownershipResult.confidence
              : null;
          compare_threshold = ownershipResult.threshold ?? biometricThreshold;
          matched_face_id = ownershipResult.matched_face_id || null;
          ownership_verified =
            ownershipResult.success === true && ownershipResult.is_match === true;
          code = ownership_verified
            ? "ACCOUNT_OWNER_CONFIRMED"
            : ownershipResult.code || "ACCOUNT_OWNER_MISMATCH";
          message = ownership_verified
            ? "Live presence confirmed and the captured face matches the enrolled owner of this account."
            : "The person who completed this live check is not the owner of this account.";

          logBiometricEvent("vote_liveness_identity_check_resolved", {
            tenant_id: req.tenantId || req.tenant?._id || null,
            student_id: studentId,
            session_id: id,
            ownership_verified,
            compare_confidence,
            compare_threshold,
            matched_face_id,
            code,
          });
        }
      }

      return res.json({
        session_id: id,
        provider: result.provider || "aws_rekognition",
        passed: result.passed === true,
        confidence: result.confidence ?? null,
        threshold: result.threshold ?? null,
        status: result.status || null,
        ownership_verified,
        compare_confidence,
        compare_threshold,
        matched_face_id,
        code,
        message,
      });
    } catch (error) {
      console.error("Get liveness result error:", error);
      return res.status(500).json({
        error: "Failed to fetch liveness result.",
        code: "LIVENESS_FAILED",
      });
    }
  }

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
      const {
        session_id,
        choices,
        image_url,
        lat,
        lng,
        device_id,
        liveness_session_id,
      } = req.body;
      const studentId = req.studentId;
      const tenantNamespace = getTenantCacheNamespace(req);
      const tenantSettings = getTenantSettings(req.tenant);
      const biometricThreshold = Number(
        tenantSettings.voting?.face_match_threshold || 70,
      );
      const biometricStatus = await faceProviderService.getStatus();
      const livenessRequired = biometricStatus.liveness_required !== false;
      const deviceFingerprint =
        device_id || req.headers["user-agent"] || "unknown-device";
      const fallbackImageRequired = !livenessRequired;

      const rejectBiometricAttempt = async ({
        statusCode,
        error,
        code,
        failure_reason,
        confidence_score = null,
        compare_confidence = null,
        compare_threshold = biometricThreshold,
        liveness_status = null,
        liveness_confidence = null,
        liveness_threshold = null,
        matched_face_id = null,
        meta = {},
      }) => {
        const lockoutState = await incrementBiometricFailure(
          tenantNamespace,
          session_id,
          studentId,
        );

        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          confidence_score,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason,
          device_id: deviceFingerprint,
          ip_address: req.ip,
          image_url: image_url || null,
          geo_location: { lat, lng },
          liveness_session_id: liveness_session_id || null,
          liveness_status,
          liveness_confidence,
          liveness_threshold,
          compare_confidence,
          compare_threshold,
          matched_face_id,
          decision_source: livenessRequired ? "liveness_reference_image" : "uploaded_image",
          fail_streak: lockoutState.fail_streak,
          lockout_triggered: lockoutState.lockout_triggered,
          lockout_expires_at: lockoutState.locked_until
            ? new Date(lockoutState.locked_until)
            : null,
          meta,
        });

        logBiometricEvent(
          lockoutState.lockout_triggered
            ? "vote_biometric_lockout_triggered"
            : "vote_biometric_rejected",
          {
            tenant_id: req.tenantId || req.tenant?._id || null,
            student_id: studentId,
            voting_session_id: session_id,
            liveness_session_id: liveness_session_id || null,
            failure_reason,
            code,
            compare_confidence,
            compare_threshold,
            liveness_confidence,
            liveness_threshold,
            fail_streak: lockoutState.fail_streak,
            lockout_expires_at: lockoutState.locked_until,
          },
        );

        return res.status(
          lockoutState.lockout_triggered ? 429 : statusCode,
        ).json({
          error:
            lockoutState.lockout_triggered
              ? "Biometric verification has been locked after repeated failed attempts. Try again in 5 minutes."
              : error,
          code: lockoutState.lockout_triggered ? "BIOMETRIC_LOCKED" : code,
          retry_after_seconds: lockoutState.retry_after_seconds || undefined,
          locked_until: lockoutState.locked_until || undefined,
          fail_streak: lockoutState.fail_streak,
        });
      };

      // Validate required fields
      if (!session_id || !choices || lat === undefined || lng === undefined) {
        await mongoSession.abortTransaction();
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "MISSING_REQUIRED_FIELDS",
          device_id: deviceFingerprint,
          ip_address: req.ip,
          image_url: image_url || null,
        });
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (fallbackImageRequired && !image_url) {
        await mongoSession.abortTransaction();
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "MISSING_REQUIRED_FIELDS",
          device_id: deviceFingerprint,
          ip_address: req.ip,
          image_url: image_url || null,
        });
        return res.status(400).json({
          error: "Image URL is required when liveness verification is disabled.",
        });
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
          device_id: deviceFingerprint,
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
          device_id: deviceFingerprint,
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
          device_id: deviceFingerprint,
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
          device_id: deviceFingerprint,
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
          device_id: deviceFingerprint,
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
          device_id: deviceFingerprint,
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
          device_id: deviceFingerprint,
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
            device_id: deviceFingerprint,
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
            device_id: deviceFingerprint,
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
            device_id: deviceFingerprint,
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

      if (!isLikelyMobileVotingDevice(deviceFingerprint)) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "DEVICE_NOT_ALLOWED",
          device_id: deviceFingerprint,
          ip_address: req.ip,
          image_url,
          geo_location: { lat, lng },
        });
        return res.status(403).json({
          error:
            "Voting is only available on a mobile device for this ballot. Please open the student app on your phone and try again.",
          code: "MOBILE_DEVICE_REQUIRED",
        });
      }

      const biometricLockoutState = await getBiometricLockoutState(
        tenantNamespace,
        session_id,
        studentId,
      );

      if (biometricLockoutState.locked) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        await logVerificationAttempt(req, {
          user_id: studentId,
          session_id,
          threshold_used: biometricThreshold,
          result: "rejected",
          failure_reason: "BIOMETRIC_LOCKED",
          device_id: deviceFingerprint,
          ip_address: req.ip,
          image_url: image_url || null,
          geo_location: { lat, lng },
          liveness_session_id: liveness_session_id || null,
          decision_source: livenessRequired
            ? "liveness_reference_image"
            : "uploaded_image",
          fail_streak: biometricLockoutState.fail_streak,
          lockout_triggered: true,
          lockout_expires_at: biometricLockoutState.locked_until
            ? new Date(biometricLockoutState.locked_until)
            : null,
        });
        return res.status(429).json({
          error:
            "Biometric verification is temporarily locked. Please try again after the cooldown expires.",
          code: "BIOMETRIC_LOCKED",
          retry_after_seconds: biometricLockoutState.retry_after_seconds,
          locked_until: biometricLockoutState.locked_until,
          fail_streak: biometricLockoutState.fail_streak,
        });
      }

      if (!student.aws_face_id || !student.aws_face_collection_id) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        return rejectBiometricAttempt({
          statusCode: 400,
          error:
            "No enrolled face was found for this student. Please contact your administrator.",
          code: "NO_REGISTERED_FACE",
          failure_reason: "NO_REGISTERED_FACE",
        });
      }

      let faceVerification;
      let livenessResult = null;

      if (livenessRequired) {
        if (!liveness_session_id) {
          await mongoSession.abortTransaction();
          await cacheService.del(voteLockKey);
          return res.status(400).json({
            error:
              "Complete AWS liveness verification before submitting your vote.",
            code: "LIVENESS_REQUIRED",
          });
        }

        livenessResult = await faceProviderService.getLivenessResult(
          liveness_session_id,
        );
        logBiometricEvent("vote_liveness_result_resolved", {
          tenant_id: req.tenantId || req.tenant?._id || null,
          student_id: studentId,
          voting_session_id: session_id,
          liveness_session_id,
          status: livenessResult.status || null,
          passed: livenessResult.passed === true,
          confidence: livenessResult.confidence ?? null,
          threshold: livenessResult.threshold ?? null,
        });

        if (!livenessResult.success) {
          await mongoSession.abortTransaction();
          await cacheService.del(voteLockKey);
          return rejectBiometricAttempt({
            statusCode: 400,
            error:
              livenessResult.error ||
              "AWS liveness verification did not complete successfully.",
            code: getLivenessFailureReason(livenessResult),
            failure_reason: getLivenessFailureReason(livenessResult),
            liveness_status: livenessResult.status || null,
            liveness_confidence: livenessResult.confidence ?? null,
            liveness_threshold: livenessResult.threshold ?? null,
            meta: {
              provider_code: livenessResult.code || null,
              provider_error: livenessResult.error || null,
            },
          });
        }

        if (!livenessResult.passed) {
          await mongoSession.abortTransaction();
          await cacheService.del(voteLockKey);
          return rejectBiometricAttempt({
            statusCode: 403,
            error:
              "Live presence verification failed. Retry the liveness check and submit again.",
            code:
              livenessResult.status === "EXPIRED"
                ? "LIVENESS_SESSION_EXPIRED"
                : getLivenessFailureReason(livenessResult),
            failure_reason: getLivenessFailureReason(livenessResult),
            liveness_status: livenessResult.status || null,
            liveness_confidence: livenessResult.confidence ?? null,
            liveness_threshold: livenessResult.threshold ?? null,
          });
        }

        faceVerification = await faceProviderService.verifyFaceBytes(
          student,
          livenessResult.reference_image,
          {
            threshold_override: biometricThreshold,
          },
        );
      } else {
        faceVerification = await faceProviderService.verifyFace(student, image_url, {
          threshold_override: biometricThreshold,
        });
      }

      if (!faceVerification.success) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        return rejectBiometricAttempt({
          statusCode: 400,
          error: faceVerification.error,
          code:
            faceVerification.code === "NO_REGISTERED_FACE"
              ? "NO_REGISTERED_FACE"
              : faceVerification.code || "FACE_VERIFICATION_FAILED",
          failure_reason: mapVerificationFailureReason(faceVerification),
          confidence_score:
            typeof faceVerification.confidence === "number"
              ? faceVerification.confidence
              : null,
          compare_confidence:
            typeof faceVerification.confidence === "number"
              ? faceVerification.confidence
              : null,
          liveness_status: livenessResult?.status || null,
          liveness_confidence: livenessResult?.confidence ?? null,
          liveness_threshold: livenessResult?.threshold ?? null,
          meta: {
            provider_code: faceVerification.code || null,
            provider_error: faceVerification.error || null,
          },
        });
      }

      // Check if confidence meets threshold
      if (!faceVerification.is_match) {
        await mongoSession.abortTransaction();
        await cacheService.del(voteLockKey);
        return rejectBiometricAttempt({
          statusCode: 403,
          error: faceVerification.message,
          code: "LOW_CONFIDENCE",
          failure_reason: "LOW_CONFIDENCE",
          confidence_score: faceVerification.confidence,
          compare_confidence: faceVerification.confidence,
          compare_threshold: faceVerification.threshold ?? biometricThreshold,
          matched_face_id: faceVerification.matched_face_id || null,
          liveness_status: livenessResult?.status || null,
          liveness_confidence: livenessResult?.confidence ?? null,
          liveness_threshold: livenessResult?.threshold ?? null,
        });
      }

      const verifiedFaceId = faceVerification.matched_face_id;
      const faceConfidence = faceVerification.confidence;
      const compareThreshold = faceVerification.threshold ?? biometricThreshold;
      await clearBiometricFailureState(tenantNamespace, session_id, studentId);

      logBiometricEvent("vote_face_compare_executed", {
        tenant_id: req.tenantId || req.tenant?._id || null,
        student_id: studentId,
        voting_session_id: session_id,
        liveness_session_id: liveness_session_id || null,
        matched_face_id: verifiedFaceId || null,
        compare_confidence: faceConfidence ?? null,
        compare_threshold: compareThreshold,
        decision: "accepted",
      });

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
          device_id: deviceFingerprint,
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
          device_id: deviceFingerprint,
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
          aws_matched_face_id: verifiedFaceId,
          status: "valid",
          device_id: deviceFingerprint,
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
        liveness_session_id: liveness_session_id || null,
        liveness_status: livenessResult?.status || null,
        liveness_confidence: livenessResult?.confidence ?? null,
        liveness_threshold: livenessResult?.threshold ?? null,
        compare_confidence: faceConfidence,
        compare_threshold: compareThreshold,
        matched_face_id: verifiedFaceId,
        decision_source: livenessRequired
          ? "liveness_reference_image"
          : "uploaded_image",
        fail_streak: 0,
        lockout_triggered: false,
        lockout_expires_at: null,
        result: "accepted",
        failure_reason: null,
        device_id: deviceFingerprint,
        ip_address: req.ip,
        image_url,
        geo_location: { lat, lng },
        meta: {
          choice_count: choices.length,
        },
      });

      logBiometricEvent("vote_accepted", {
        tenant_id: req.tenantId || req.tenant?._id || null,
        student_id: studentId,
        voting_session_id: session_id,
        liveness_session_id: liveness_session_id || null,
        matched_face_id: verifiedFaceId || null,
        compare_confidence: faceConfidence ?? null,
        compare_threshold: compareThreshold,
        liveness_confidence: livenessResult?.confidence ?? null,
        liveness_threshold: livenessResult?.threshold ?? null,
        vote_count: choices.length,
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
          getTenantSettings(req.tenant).voting?.face_match_threshold || 70,
        ),
        result: "rejected",
        failure_reason: "DB_WRITE_FAIL",
        device_id:
          req.body?.device_id || req.headers["user-agent"] || "unknown-device",
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

  /**
   * Get authenticated student's submitted ballot for a session
   * GET /api/vote/session/:sessionId/submitted
   */
  async getSubmittedBallotBySession(req, res) {
    try {
      const { sessionId } = req.params;
      const studentId = req.studentId;

      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({ error: "Invalid session ID" });
      }

      const session = await VotingSession.findOne(
        getTenantScopedFilter(req, { _id: sessionId }),
      )
        .select("title description start_time end_time status")
        .lean();

      if (!session) {
        return res.status(404).json({ error: "Voting session not found" });
      }

      const submittedVotes = await Vote.find(
        getTenantScopedFilter(req, {
          student_id: studentId,
          session_id: sessionId,
          status: "valid",
        }),
      )
        .populate("candidate_id", "name position photo_url bio")
        .sort({ position: 1, timestamp: 1 })
        .lean();

      if (!submittedVotes.length) {
        return res
          .status(404)
          .json({ error: "No submitted ballot found for this session" });
      }

      const submittedAt =
        submittedVotes
          .map((vote) => vote.timestamp || vote.createdAt)
          .filter(Boolean)
          .sort((left, right) => new Date(left) - new Date(right))[0] || null;

      const choices = submittedVotes.reduce((acc, vote) => {
        if (!vote.candidate_id) return acc;

        acc.push({
          position: vote.position,
          candidate: {
            id: vote.candidate_id._id,
            name: vote.candidate_id.name,
            position: vote.candidate_id.position,
            photo_url: vote.candidate_id.photo_url,
            bio: vote.candidate_id.bio,
          },
        });

        return acc;
      }, []);

      return res.json({
        ballot: {
          session: {
            id: session._id,
            title: session.title,
            description: session.description,
            start_time: session.start_time,
            end_time: session.end_time,
            status: session.status,
          },
          submitted_at: submittedAt,
          status: "submitted",
          choices,
        },
      });
    } catch (error) {
      console.error("Get submitted ballot by session error:", error);
      return res
        .status(500)
        .json({ error: "Failed to get submitted ballot details" });
    }
  }
}

module.exports = new VoteController();
