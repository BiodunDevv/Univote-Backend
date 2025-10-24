const mongoose = require("mongoose");
const Student = require("../models/Student");
const VotingSession = require("../models/VotingSession");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const azureService = require("../services/azureService");
const emailService = require("../services/emailService");
const { isWithinGeofence, isValidCoordinates } = require("../utils/geofence");

class VoteController {
  /**
   * Submit a vote
   * POST /api/vote
   */
  async submitVote(req, res) {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();

    try {
      const { session_id, choices, image_url, lat, lng, device_id } = req.body;
      const studentId = req.studentId;

      // Validate required fields
      if (
        !session_id ||
        !choices ||
        !image_url ||
        lat === undefined ||
        lng === undefined
      ) {
        await mongoSession.abortTransaction();
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate coordinates
      if (!isValidCoordinates(lat, lng)) {
        await mongoSession.abortTransaction();
        return res.status(400).json({ error: "Invalid coordinates" });
      }

      // Get student
      const student = await Student.findById(studentId);
      if (!student) {
        await mongoSession.abortTransaction();
        return res.status(404).json({ error: "Student not found" });
      }

      // Get session
      const session = await VotingSession.findById(session_id).populate(
        "candidates"
      );
      if (!session) {
        await mongoSession.abortTransaction();
        return res.status(404).json({ error: "Voting session not found" });
      }

      // Update session status
      await session.updateStatus();

      // Check if session is active
      if (session.status !== "active") {
        await mongoSession.abortTransaction();
        return res.status(400).json({
          error: `Voting session is ${session.status}. You can only vote during active sessions.`,
        });
      }

      // Check if student has already voted
      if (student.has_voted_sessions.includes(session_id)) {
        await mongoSession.abortTransaction();
        return res.status(409).json({
          error: "You have already voted in this session",
          code: "ALREADY_VOTED",
        });
      }

      // Check eligibility (college, department, level)
      if (
        session.eligible_college &&
        student.college !== session.eligible_college
      ) {
        await mongoSession.abortTransaction();
        return res
          .status(403)
          .json({
            error:
              "You are not eligible for this voting session (college mismatch)",
          });
      }

      if (
        session.eligible_departments &&
        session.eligible_departments.length > 0
      ) {
        if (!session.eligible_departments.includes(student.department)) {
          await mongoSession.abortTransaction();
          return res
            .status(403)
            .json({
              error:
                "You are not eligible for this voting session (department mismatch)",
            });
        }
      }

      if (session.eligible_levels && session.eligible_levels.length > 0) {
        if (!session.eligible_levels.includes(student.level)) {
          await mongoSession.abortTransaction();
          return res
            .status(403)
            .json({
              error:
                "You are not eligible for this voting session (level mismatch)",
            });
        }
      }

      // Check geofence (unless off-campus is allowed)
      if (!session.is_off_campus_allowed) {
        const withinGeofence = isWithinGeofence(
          lat,
          lng,
          session.location.lat,
          session.location.lng,
          session.location.radius_meters
        );

        if (!withinGeofence) {
          await mongoSession.abortTransaction();
          return res.status(403).json({
            error:
              "You are outside the voting geofence. Please ensure you are within the designated voting location.",
            code: "GEOFENCE_VIOLATION",
          });
        }
      }

      // Azure Face Detection
      console.log("Starting face detection...");
      const faceDetection = await azureService.detectFace(image_url);

      if (!faceDetection.success) {
        await mongoSession.abortTransaction();
        return res.status(400).json({
          error: faceDetection.error,
          code: "FACE_DETECTION_FAILED",
        });
      }

      const faceId = faceDetection.faceId;

      // Check for duplicate face in this session
      console.log("Checking for duplicate faces...");
      if (session.azure_persongroup_id) {
        const duplicateCheck = await azureService.checkDuplicateInSession(
          session.azure_persongroup_id,
          faceId
        );

        if (duplicateCheck.isDuplicate) {
          // Record rejected vote
          await Vote.create(
            [
              {
                student_id: studentId,
                session_id: session_id,
                candidate_id: null,
                position: "N/A",
                geo_location: { lat, lng },
                face_match_score: duplicateCheck.confidence,
                face_verification_passed: false,
                azure_face_id: faceId,
                status: "duplicate",
                device_id: device_id || null,
                ip_address: req.ip,
              },
            ],
            { session: mongoSession }
          );

          await mongoSession.commitTransaction();

          return res.status(409).json({
            error: duplicateCheck.message,
            code: "DUPLICATE_FACE",
            confidence: duplicateCheck.confidence,
          });
        }
      }

      // Validate choices
      if (!Array.isArray(choices) || choices.length === 0) {
        await mongoSession.abortTransaction();
        return res.status(400).json({ error: "Invalid choices format" });
      }

      // Verify all candidates exist and belong to this session
      const candidateIds = choices.map((c) => c.candidate_id);
      const candidates = await Candidate.find({
        _id: { $in: candidateIds },
        session_id: session_id,
      });

      if (candidates.length !== choices.length) {
        await mongoSession.abortTransaction();
        return res.status(400).json({ error: "Invalid candidate selection" });
      }

      // Create vote records and increment candidate counts
      const voteRecords = [];
      const voteDetails = [];

      for (const choice of choices) {
        const candidate = candidates.find(
          (c) => c._id.toString() === choice.candidate_id
        );

        if (!candidate) {
          await mongoSession.abortTransaction();
          return res
            .status(400)
            .json({ error: `Invalid candidate: ${choice.candidate_id}` });
        }

        // Increment vote count atomically
        await Candidate.findByIdAndUpdate(
          choice.candidate_id,
          { $inc: { vote_count: 1 } },
          { session: mongoSession }
        );

        // Create vote record
        const voteRecord = {
          student_id: studentId,
          session_id: session_id,
          candidate_id: choice.candidate_id,
          position: choice.category || candidate.position,
          geo_location: { lat, lng },
          face_match_score: 1.0,
          face_verification_passed: true,
          azure_face_id: faceId,
          status: "valid",
          device_id: device_id || null,
          ip_address: req.ip,
        };

        voteRecords.push(voteRecord);
        voteDetails.push({
          position: choice.category || candidate.position,
          candidate_name: candidate.name,
        });
      }

      // Save all votes
      await Vote.insertMany(voteRecords, { session: mongoSession });

      // Add face to session PersonGroup for future duplicate detection
      if (session.azure_persongroup_id) {
        console.log("Adding face to PersonGroup...");
        const addFaceResult = await azureService.addVoteFaceToSession(
          session.azure_persongroup_id,
          student.matric_no,
          image_url
        );

        if (addFaceResult.success) {
          // Update vote records with persisted face ID
          await Vote.updateMany(
            {
              student_id: studentId,
              session_id: session_id,
              azure_face_id: faceId,
            },
            {
              $set: { persisted_face_id: addFaceResult.persistedFaceId },
            },
            { session: mongoSession }
          );
        }
      }

      // Add session to student's has_voted_sessions
      await Student.findByIdAndUpdate(
        studentId,
        { $push: { has_voted_sessions: session_id } },
        { session: mongoSession }
      );

      await mongoSession.commitTransaction();

      // Send vote confirmation email
      emailService
        .sendVoteConfirmation(student, session, voteDetails)
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
      console.error("Submit vote error:", error);
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

      const votes = await Vote.find({ student_id: studentId, status: "valid" })
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
}

module.exports = new VoteController();
