const VotingSession = require("../models/VotingSession");
const Student = require("../models/Student");
const Candidate = require("../models/Candidate");

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

  /**
   * Get candidate details by ID
   * GET /api/candidates/:id
   */
  async getCandidateById(req, res) {
    try {
      const { id } = req.params;

      const candidate = await Candidate.findById(id)
        .populate("session_id", "title description start_time end_time status")
        .lean();

      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      // Get session details to check status
      const session = candidate.session_id;

      // Update session status calculation
      const now = new Date();
      let sessionStatus = session.status;
      if (now < session.start_time) {
        sessionStatus = "upcoming";
      } else if (now >= session.start_time && now <= session.end_time) {
        sessionStatus = "active";
      } else {
        sessionStatus = "ended";
      }

      // Return full candidate details
      res.json({
        candidate: {
          id: candidate._id,
          name: candidate.name,
          position: candidate.position,
          photo_url: candidate.photo_url,
          bio: candidate.bio,
          manifesto: candidate.manifesto,
          vote_count: candidate.vote_count,
          session: {
            id: session._id,
            title: session.title,
            description: session.description,
            start_time: session.start_time,
            end_time: session.end_time,
            status: sessionStatus,
          },
          created_at: candidate.createdAt,
          updated_at: candidate.updatedAt,
        },
      });
    } catch (error) {
      console.error("Get candidate by ID error:", error);
      res.status(500).json({ error: "Failed to get candidate details" });
    }
  }

  /**
   * Get live results for a session (Optimized for high traffic)
   * GET /api/sessions/:id/live-results
   */
  async getLiveResults(req, res) {
    try {
      const { id } = req.params;
      const Vote = require("../models/Vote");
      const mongoose = require("mongoose");

      // Parallel queries for maximum performance
      const [session, votesByCandidate, totalVotes] = await Promise.all([
        VotingSession.findById(id)
          .select("title description start_time end_time status results_public")
          .lean(),
        
        // Efficient aggregation for vote counts
        Vote.aggregate([
          {
            $match: {
              session_id: new mongoose.Types.ObjectId(id),
              status: "valid",
            },
          },
          {
            $group: {
              _id: "$candidate_id",
              count: { $sum: 1 },
            },
          },
        ]),
        
        // Count total valid votes
        Vote.countDocuments({
          session_id: id,
          status: "valid",
        }),
      ]);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Update session status
      const now = new Date();
      if (now < session.start_time) {
        session.status = "upcoming";
      } else if (now >= session.start_time && now <= session.end_time) {
        session.status = "active";
      } else {
        session.status = "ended";
      }

      // Get candidates with minimal data for performance
      const candidates = await Candidate.find({ session_id: id })
        .select("name position photo_url")
        .lean();

      // Add vote counts to candidates
      const candidatesWithVotes = candidates.map((candidate) => {
        const voteData = votesByCandidate.find(
          (v) => v._id.toString() === candidate._id.toString()
        );
        const voteCount = voteData ? voteData.count : 0;
        const percentage =
          totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(2) : 0;

        return {
          id: candidate._id,
          name: candidate.name,
          position: candidate.position,
          photo_url: candidate.photo_url,
          vote_count: voteCount,
          percentage: parseFloat(percentage),
        };
      });

      // Group by position
      const resultsByPosition = candidatesWithVotes.reduce((acc, candidate) => {
        if (!acc[candidate.position]) {
          acc[candidate.position] = {
            position: candidate.position,
            total_votes: 0,
            candidates: [],
          };
        }

        acc[candidate.position].candidates.push(candidate);
        acc[candidate.position].total_votes += candidate.vote_count;

        return acc;
      }, {});

      // Sort candidates by vote count within each position
      Object.values(resultsByPosition).forEach((position) => {
        const maxVotes = Math.max(
          ...position.candidates.map((c) => c.vote_count)
        );
        position.candidates.forEach((c) => {
          c.is_leading = c.vote_count === maxVotes && maxVotes > 0;
        });
        position.candidates.sort((a, b) => b.vote_count - a.vote_count);
      });

      // Cache control headers for performance
      res.set({
        'Cache-Control': 'public, max-age=30', // Cache for 30 seconds
        'ETag': `"${id}-${totalVotes}"`, // ETag based on session and vote count
      });

      res.json({
        session: {
          id: session._id,
          title: session.title,
          description: session.description,
          status: session.status,
          start_time: session.start_time,
          end_time: session.end_time,
          is_live: session.status === "active",
        },
        total_votes: totalVotes,
        last_updated: new Date().toISOString(),
        results: Object.values(resultsByPosition),
      });
    } catch (error) {
      console.error("Get live results error:", error);
      res.status(500).json({ error: "Failed to get live results" });
    }
  }
}

module.exports = new SessionController();
