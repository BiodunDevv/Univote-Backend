const VotingSession = require("../models/VotingSession");
const Student = require("../models/Student");

class SessionController {
  /**
   * Get all eligible sessions for a student
   * GET /api/sessions
   */
  async listEligibleSessions(req, res) {
    try {
      const studentId = req.studentId;
      const { status } = req.query;

      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // Build filter
      const filter = {};

      // Filter by status if provided
      if (status) {
        filter.status = status;
      }

      // Get all sessions
      let sessions = await VotingSession.find(filter)
        .populate("candidates")
        .sort({ start_time: -1 });

      // Update status for each session
      for (const session of sessions) {
        await session.updateStatus();
      }

      // Filter eligible sessions
      const eligibleSessions = sessions.filter((session) => {
        // Check college eligibility
        if (
          session.eligible_college &&
          session.eligible_college !== student.college
        ) {
          return false;
        }

        // Check department eligibility
        if (
          session.eligible_departments &&
          session.eligible_departments.length > 0
        ) {
          if (!session.eligible_departments.includes(student.department)) {
            return false;
          }
        }

        // Check level eligibility
        if (session.eligible_levels && session.eligible_levels.length > 0) {
          if (!session.eligible_levels.includes(student.level)) {
            return false;
          }
        }

        return true;
      });

      // Add has_voted flag
      const sessionsWithVoteStatus = eligibleSessions.map((session) => ({
        ...session.toObject(),
        has_voted: student.has_voted_sessions.includes(session._id),
        candidate_count: session.candidates.length,
      }));

      res.json({
        sessions: sessionsWithVoteStatus,
      });
    } catch (error) {
      console.error("List sessions error:", error);
      res.status(500).json({ error: "Failed to list sessions" });
    }
  }

  /**
   * Get a specific session details
   * GET /api/sessions/:id
   */
  async getSession(req, res) {
    try {
      const { id } = req.params;
      const studentId = req.studentId;

      const session = await VotingSession.findById(id).populate("candidates");

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Update session status
      await session.updateStatus();

      const student = await Student.findById(studentId);

      // Check eligibility
      let eligible = true;
      let eligibilityReason = null;

      if (
        session.eligible_college &&
        session.eligible_college !== student.college
      ) {
        eligible = false;
        eligibilityReason = "College not eligible";
      }

      if (
        session.eligible_departments &&
        session.eligible_departments.length > 0
      ) {
        if (!session.eligible_departments.includes(student.department)) {
          eligible = false;
          eligibilityReason = "Department not eligible";
        }
      }

      if (session.eligible_levels && session.eligible_levels.length > 0) {
        if (!session.eligible_levels.includes(student.level)) {
          eligible = false;
          eligibilityReason = "Level not eligible";
        }
      }

      // Group candidates by position/category
      const candidatesByPosition = session.candidates.reduce(
        (acc, candidate) => {
          if (!acc[candidate.position]) {
            acc[candidate.position] = [];
          }
          acc[candidate.position].push({
            id: candidate._id,
            name: candidate.name,
            photo_url: candidate.photo_url,
            bio: candidate.bio,
            manifesto: candidate.manifesto,
            vote_count: candidate.vote_count,
          });
          return acc;
        },
        {}
      );

      res.json({
        session: {
          id: session._id,
          title: session.title,
          description: session.description,
          start_time: session.start_time,
          end_time: session.end_time,
          status: session.status,
          categories: session.categories,
          location: session.location,
          is_off_campus_allowed: session.is_off_campus_allowed,
          eligible,
          eligibility_reason: eligibilityReason,
          has_voted: student.has_voted_sessions.includes(session._id),
          candidates_by_position: candidatesByPosition,
        },
      });
    } catch (error) {
      console.error("Get session error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  }
}

module.exports = new SessionController();
