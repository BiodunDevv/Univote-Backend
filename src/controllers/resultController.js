const VotingSession = require("../models/VotingSession");
const Vote = require("../models/Vote");
const Student = require("../models/Student");
const mongoose = require("mongoose");

class ResultController {
  /**
   * Get results for a voting session
   * GET /api/results/:session_id
   */
  async getResults(req, res) {
    try {
      const { session_id } = req.params;
      const studentId = req.studentId;

      const [session, student] = await Promise.all([
        VotingSession.findById(session_id)
          .populate("candidates", "name position photo_url bio manifesto")
          .lean(),
        Student.findById(studentId).select("college department level").lean(),
      ]);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // Check if results are available
      // Results available when session has ended (status automatically set by scheduler)
      const now = new Date();
      const sessionEnded = now > session.end_time;

      if (!sessionEnded && session.status !== "ended") {
        return res.status(403).json({
          error: "Results are not yet available",
          message:
            "Results will be automatically published when the voting session ends",
        });
      }

      // Check eligibility
      let isEligible = true;
      if (
        session.eligible_college &&
        session.eligible_college !== student.college
      ) {
        isEligible = false;
      }
      if (
        session.eligible_departments &&
        session.eligible_departments.length > 0
      ) {
        // Convert department IDs to names
        const College = require("../models/College");
        const colleges = await College.find({});
        const departmentNames = [];

        colleges.forEach((college) => {
          college.departments.forEach((dept) => {
            if (session.eligible_departments.includes(dept._id.toString())) {
              departmentNames.push(dept.name);
            }
          });
        });

        if (!departmentNames.includes(student.department)) {
          isEligible = false;
        }
      }
      if (session.eligible_levels && session.eligible_levels.length > 0) {
        if (!session.eligible_levels.includes(student.level)) {
          isEligible = false;
        }
      }

      // Check if student voted in this session
      const hasVoted = student.has_voted_sessions.includes(session_id);

      // Get vote breakdown by candidate using aggregation
      const votesByCandidate = await Vote.aggregate([
        {
          $match: {
            session_id: new mongoose.Types.ObjectId(session_id),
            status: "valid",
          },
        },
        { $unwind: "$votes" },
        {
          $group: {
            _id: "$votes.candidate_id",
            count: { $sum: 1 },
          },
        },
      ]);

      // Calculate total valid votes
      const totalVotes = await Vote.countDocuments({
        session_id,
        status: "valid",
      });

      // Add vote counts to candidates
      const candidatesWithVotes = session.candidates.map((candidate) => {
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
          bio: candidate.bio,
          vote_count: voteCount,
          percentage: parseFloat(percentage),
        };
      });

      // Group results by position
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

      // Determine winners (highest vote count per position)
      Object.values(resultsByPosition).forEach((position) => {
        const maxVotes = Math.max(
          ...position.candidates.map((c) => c.vote_count)
        );
        position.candidates.forEach((c) => {
          c.is_winner = c.vote_count === maxVotes && maxVotes > 0;
        });
        // Sort candidates by vote count descending
        position.candidates.sort((a, b) => b.vote_count - a.vote_count);
      });

      res.json({
        session: {
          id: session._id,
          title: session.title,
          description: session.description,
          status: session.status,
          start_time: session.start_time,
          end_time: session.end_time,
          results_public: session.results_public,
        },
        is_eligible: isEligible,
        has_voted: hasVoted,
        total_valid_votes: totalVotes,
        results: Object.values(resultsByPosition),
      });
    } catch (error) {
      console.error("Get results error:", error);
      res.status(500).json({ error: "Failed to get results" });
    }
  }

  /**
   * Get overall statistics (Admin only)
   * GET /api/admin/results/stats/overview
   */
  async getOverallStats(req, res) {
    try {
      const totalSessions = await VotingSession.countDocuments();
      const upcomingSessions = await VotingSession.countDocuments({
        status: "upcoming",
      });
      const activeSessions = await VotingSession.countDocuments({
        status: "active",
      });
      const endedSessions = await VotingSession.countDocuments({
        status: "ended",
      });
      const totalStudents = await Student.countDocuments({ is_active: true });
      const totalVotes = await Vote.countDocuments({ status: "valid" });
      const duplicateAttempts = await Vote.countDocuments({
        status: "duplicate",
      });
      const rejectedVotes = await Vote.countDocuments({ status: "rejected" });

      // Calculate average turnout
      const sessionsWithVotes = await VotingSession.find({
        status: "ended",
      });

      let totalTurnout = 0;
      let sessionsWithTurnout = 0;

      for (const session of sessionsWithVotes) {
        const eligibilityFilter = { is_active: true };

        if (session.eligible_college) {
          eligibilityFilter.college = session.eligible_college;
        }

        if (
          session.eligible_departments &&
          session.eligible_departments.length > 0
        ) {
          const College = require("../models/College");
          const colleges = await College.find({});
          const departmentNames = [];

          colleges.forEach((college) => {
            college.departments.forEach((dept) => {
              if (session.eligible_departments.includes(dept._id.toString())) {
                departmentNames.push(dept.name);
              }
            });
          });

          if (departmentNames.length > 0) {
            eligibilityFilter.department = { $in: departmentNames };
          }
        }

        if (session.eligible_levels && session.eligible_levels.length > 0) {
          eligibilityFilter.level = { $in: session.eligible_levels };
        }

        const eligibleStudents = await Student.countDocuments(
          eligibilityFilter
        );
        const sessionVotes = await Vote.countDocuments({
          session_id: session._id,
          status: "valid",
        });

        if (eligibleStudents > 0) {
          totalTurnout += (sessionVotes / eligibleStudents) * 100;
          sessionsWithTurnout++;
        }
      }

      const averageTurnout =
        sessionsWithTurnout > 0
          ? (totalTurnout / sessionsWithTurnout).toFixed(2)
          : 0;

      res.json({
        overview: {
          total_sessions: totalSessions,
          upcoming_sessions: upcomingSessions,
          active_sessions: activeSessions,
          ended_sessions: endedSessions,
          total_students: totalStudents,
          total_votes_cast: totalVotes,
          duplicate_attempts: duplicateAttempts,
          rejected_votes: rejectedVotes,
          average_turnout_percentage: parseFloat(averageTurnout),
        },
      });
    } catch (error) {
      console.error("Get overview stats error:", error);
      res.status(500).json({ error: "Failed to get statistics" });
    }
  }
}

module.exports = new ResultController();
