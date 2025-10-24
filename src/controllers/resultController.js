const VotingSession = require("../models/VotingSession");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const Student = require("../models/Student");
const emailService = require("../services/emailService");

class ResultController {
  /**
   * Get results for a voting session
   * GET /api/results/:session_id
   */
  async getResults(req, res) {
    try {
      const { session_id } = req.params;
      const studentId = req.studentId;

      const session = await VotingSession.findById(session_id);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Update session status
      await session.updateStatus();

      // Check if results are available
      // Results available if: session ended OR admin made results public
      if (session.status !== "ended" && !session.results_public) {
        return res.status(403).json({
          error: "Results are not yet available",
          message: "Results will be available after the voting session ends",
        });
      }

      // Check if student voted in this session
      const student = await Student.findById(studentId);
      const hasVoted = student.has_voted_sessions.includes(session_id);

      // Get all candidates with their vote counts
      const candidates = await Candidate.find({ session_id }).sort({
        position: 1,
        vote_count: -1,
      });

      // Calculate total valid votes
      const totalVotes = await Vote.countDocuments({
        session_id,
        status: "valid",
      });

      // Group results by position
      const resultsByPosition = candidates.reduce((acc, candidate) => {
        if (!acc[candidate.position]) {
          acc[candidate.position] = {
            position: candidate.position,
            total_votes: 0,
            candidates: [],
          };
        }

        const percentage =
          totalVotes > 0
            ? ((candidate.vote_count / totalVotes) * 100).toFixed(2)
            : 0;

        acc[candidate.position].candidates.push({
          id: candidate._id,
          name: candidate.name,
          photo_url: candidate.photo_url,
          vote_count: candidate.vote_count,
          percentage: parseFloat(percentage),
        });

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
      });

      res.json({
        session: {
          id: session._id,
          title: session.title,
          description: session.description,
          status: session.status,
          start_time: session.start_time,
          end_time: session.end_time,
        },
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
   * Publish results (Admin only)
   * POST /api/results/:session_id/publish
   */
  async publishResults(req, res) {
    try {
      const { session_id } = req.params;

      const session = await VotingSession.findById(session_id);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Make results public
      session.results_public = true;
      await session.save();

      // Get all students who voted in this session
      const studentsWhoVoted = await Student.find({
        has_voted_sessions: session_id,
      });

      // Send result announcement emails
      const resultsUrl = `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/results/${session_id}`;

      for (const student of studentsWhoVoted) {
        emailService
          .sendResultAnnouncement(student, session, resultsUrl)
          .catch((err) => {
            console.error(
              `Failed to send result announcement to ${student.email}:`,
              err
            );
          });
      }

      res.json({
        message: "Results published successfully",
        notification_sent_to: studentsWhoVoted.length,
      });
    } catch (error) {
      console.error("Publish results error:", error);
      res.status(500).json({ error: "Failed to publish results" });
    }
  }

  /**
   * Get overall statistics (Admin only)
   * GET /api/results/stats/overview
   */
  async getOverallStats(req, res) {
    try {
      const totalSessions = await VotingSession.countDocuments();
      const activeSessions = await VotingSession.countDocuments({
        status: "active",
      });
      const endedSessions = await VotingSession.countDocuments({
        status: "ended",
      });
      const totalStudents = await Student.countDocuments();
      const totalVotes = await Vote.countDocuments({ status: "valid" });

      res.json({
        overview: {
          total_sessions: totalSessions,
          active_sessions: activeSessions,
          ended_sessions: endedSessions,
          total_students: totalStudents,
          total_votes_cast: totalVotes,
        },
      });
    } catch (error) {
      console.error("Get overview stats error:", error);
      res.status(500).json({ error: "Failed to get statistics" });
    }
  }
}

module.exports = new ResultController();
