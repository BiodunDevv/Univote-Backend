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

      const student = await Student.findById(studentId).lean();
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
        .populate("candidates", "name position photo_url bio manifesto")
        .sort({ start_time: -1 })
        .lean();

      // Filter eligible sessions (with department ID to name conversion)
      const eligibleSessions = [];

      for (const session of sessions) {
        // Update session status (calculate based on dates)
        const now = new Date();
        if (now < session.start_time) {
          session.status = "upcoming";
        } else if (now >= session.start_time && now <= session.end_time) {
          session.status = "active";
        } else {
          session.status = "ended";
        }

        // Check college eligibility
        if (
          session.eligible_college &&
          session.eligible_college !== student.college
        ) {
          continue; // Skip this session
        }

        // Check department eligibility (convert IDs to names)
        if (
          session.eligible_departments &&
          session.eligible_departments.length > 0
        ) {
          const College = require("../models/College");
          const colleges = await College.find({}).select("departments").lean();
          const departmentNames = [];

          colleges.forEach((college) => {
            college.departments.forEach((dept) => {
              if (session.eligible_departments.includes(dept._id.toString())) {
                departmentNames.push(dept.name);
              }
            });
          });

          // Check if student's department is in the eligible list
          if (!departmentNames.includes(student.department)) {
            continue; // Skip this session
          }
        }

        // Check level eligibility
        if (session.eligible_levels && session.eligible_levels.length > 0) {
          if (!session.eligible_levels.includes(student.level)) {
            continue; // Skip this session
          }
        }

        // Session is eligible - add has_voted flag
        eligibleSessions.push({
          ...session,
          has_voted: student.has_voted_sessions.some(
            (votedId) => votedId.toString() === session._id.toString()
          ),
          candidate_count: session.candidates.length,
        });
      }

      res.json({
        sessions: eligibleSessions,
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

      const session = await VotingSession.findById(id)
        .populate("candidates", "name position photo_url bio manifesto")
        .lean();

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Update status calculation
      const now = new Date();
      if (now < session.start_time) {
        session.status = "upcoming";
      } else if (now >= session.start_time && now <= session.end_time) {
        session.status = "active";
      } else {
        session.status = "ended";
      }

      const student = await Student.findById(studentId).lean();

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

      // Check department eligibility (convert IDs to names)
      if (
        session.eligible_departments &&
        session.eligible_departments.length > 0
      ) {
        const College = require("../models/College");
        const colleges = await College.find({}).select("departments").lean();
        const departmentNames = [];

        colleges.forEach((college) => {
          college.departments.forEach((dept) => {
            if (session.eligible_departments.includes(dept._id.toString())) {
              departmentNames.push(dept.name);
            }
          });
        });

        if (!departmentNames.includes(student.department)) {
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
          has_voted: student.has_voted_sessions.some(
            (votedId) => votedId.toString() === session._id.toString()
          ),
          candidates_by_position: candidatesByPosition,
        },
      });
    } catch (error) {
      console.error("Get session error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  }

  /**
   * Get session by ID (alias for getSession)
   * GET /api/sessions/:id
   */
  async getSessionById(req, res) {
    try {
      const { id } = req.params;
      const studentId = req.studentId;

      const session = await VotingSession.findById(id)
        .populate("candidates", "name position photo_url bio manifesto")
        .lean();

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Update status calculation
      const now = new Date();
      if (now < session.start_time) {
        session.status = "upcoming";
      } else if (now >= session.start_time && now <= session.end_time) {
        session.status = "active";
      } else {
        session.status = "ended";
      }

      const student = await Student.findById(studentId).lean();

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

      // Check department eligibility (convert IDs to names)
      if (
        session.eligible_departments &&
        session.eligible_departments.length > 0
      ) {
        const College = require("../models/College");
        const colleges = await College.find({}).select("departments").lean();
        const departmentNames = [];

        colleges.forEach((college) => {
          college.departments.forEach((dept) => {
            if (session.eligible_departments.includes(dept._id.toString())) {
              departmentNames.push(dept.name);
            }
          });
        });

        if (!departmentNames.includes(student.department)) {
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
          has_voted: student.has_voted_sessions.some(
            (votedId) => votedId.toString() === session._id.toString()
          ),
          candidates_by_position: candidatesByPosition,
        },
      });
    } catch (error) {
      console.error("Get session by ID error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  }
}

module.exports = new SessionController();
