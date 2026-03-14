const mongoose = require("mongoose");
const VotingSession = require("../models/VotingSession");
const Vote = require("../models/Vote");
const Student = require("../models/Student");
const College = require("../models/College");
const {
  getTenantScopedFilter,
  prependTenantMatch,
} = require("../utils/tenantScope");

async function resolveEligibleDepartmentNames(req, departmentIds) {
  if (!departmentIds || departmentIds.length === 0) {
    return [];
  }

  const colleges = await College.find(getTenantScopedFilter(req, {}))
    .select("departments._id departments.name")
    .lean();

  const matchedNames = [];

  colleges.forEach((college) => {
    college.departments.forEach((department) => {
      if (departmentIds.includes(department._id.toString())) {
        matchedNames.push(department.name);
      }
    });
  });

  return matchedNames;
}

function buildEligibilityFilter(req, session, departmentNames) {
  const filter = getTenantScopedFilter(req, { is_active: true });

  if (session.eligible_college) {
    filter.college = session.eligible_college;
  }

  if (departmentNames.length > 0) {
    filter.department = { $in: departmentNames };
  }

  if (session.eligible_levels && session.eligible_levels.length > 0) {
    filter.level = { $in: session.eligible_levels };
  }

  return filter;
}

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
        VotingSession.findOne(getTenantScopedFilter(req, { _id: session_id }))
          .populate("candidates", "name position photo_url bio manifesto")
          .lean(),
        Student.findOne(getTenantScopedFilter(req, { _id: studentId }))
          .select("college department level has_voted_sessions")
          .lean(),
      ]);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      const now = new Date();
      const sessionEnded = now > session.end_time;
      const sessionStatus = sessionEnded
        ? "ended"
        : now >= session.start_time && now <= session.end_time
          ? "active"
          : "upcoming";

      if (!sessionEnded && sessionStatus !== "ended") {
        return res.status(403).json({
          error: "Results are not yet available",
          message:
            "Results will be automatically published when the voting session ends",
        });
      }

      const departmentNames =
        session.eligible_departments && session.eligible_departments.length > 0
          ? await resolveEligibleDepartmentNames(req, session.eligible_departments)
          : [];

      let isEligible = true;
      if (
        session.eligible_college &&
        session.eligible_college !== student.college
      ) {
        isEligible = false;
      }

      if (departmentNames.length > 0 && !departmentNames.includes(student.department)) {
        isEligible = false;
      }

      if (session.eligible_levels && session.eligible_levels.length > 0) {
        if (!session.eligible_levels.includes(student.level)) {
          isEligible = false;
        }
      }

      const hasVoted = (student.has_voted_sessions || []).some(
        (value) => value.toString() === session_id,
      );

      const sessionObjectId = new mongoose.Types.ObjectId(session_id);
      const [votesByCandidate, totalVotes, totalEligible] = await Promise.all([
        Vote.aggregate(
          prependTenantMatch(req, [
            {
              $match: {
                session_id: sessionObjectId,
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
        ),
        Vote.countDocuments(
          getTenantScopedFilter(req, {
            session_id,
            status: "valid",
          }),
        ),
        Student.countDocuments(
          buildEligibilityFilter(req, session, departmentNames),
        ),
      ]);

      const candidatesWithVotes = session.candidates.map((candidate) => {
        const voteData = votesByCandidate.find(
          (entry) => entry._id.toString() === candidate._id.toString(),
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

      Object.values(resultsByPosition).forEach((position) => {
        const maxVotes = Math.max(
          ...position.candidates.map((candidate) => candidate.vote_count),
        );
        position.candidates.forEach((candidate) => {
          candidate.is_winner = candidate.vote_count === maxVotes && maxVotes > 0;
        });
        position.candidates.sort((a, b) => b.vote_count - a.vote_count);
      });

      res.json({
        session: {
          id: session._id,
          title: session.title,
          description: session.description,
          status: sessionStatus,
          start_time: session.start_time,
          end_time: session.end_time,
          results_public: session.results_public,
        },
        is_eligible: isEligible,
        has_voted: hasVoted,
        total_valid_votes: totalVotes,
        total_eligible: totalEligible,
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
      const endedSessions = await VotingSession.find(
        getTenantScopedFilter(req, { status: "ended" }),
      ).lean();

      const [
        totalSessions,
        upcomingSessions,
        activeSessions,
        totalStudents,
        totalVotes,
        duplicateAttempts,
        rejectedVotes,
      ] = await Promise.all([
        VotingSession.countDocuments(getTenantScopedFilter(req, {})),
        VotingSession.countDocuments(
          getTenantScopedFilter(req, { status: "upcoming" }),
        ),
        VotingSession.countDocuments(
          getTenantScopedFilter(req, { status: "active" }),
        ),
        Student.countDocuments(getTenantScopedFilter(req, { is_active: true })),
        Vote.countDocuments(getTenantScopedFilter(req, { status: "valid" })),
        Vote.countDocuments(getTenantScopedFilter(req, { status: "duplicate" })),
        Vote.countDocuments(getTenantScopedFilter(req, { status: "rejected" })),
      ]);

      let totalTurnout = 0;
      let sessionsWithTurnout = 0;

      for (const session of endedSessions) {
        const departmentNames =
          session.eligible_departments && session.eligible_departments.length > 0
            ? await resolveEligibleDepartmentNames(req, session.eligible_departments)
            : [];

        const [eligibleStudents, sessionVotes] = await Promise.all([
          Student.countDocuments(
            buildEligibilityFilter(req, session, departmentNames),
          ),
          Vote.countDocuments(
            getTenantScopedFilter(req, {
              session_id: session._id,
              status: "valid",
            }),
          ),
        ]);

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
          ended_sessions: endedSessions.length,
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
