const mongoose = require("mongoose");
const VotingSession = require("../models/VotingSession");
const Student = require("../models/Student");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const College = require("../models/College");
const cacheService = require("../services/cacheService");
const {
  getTenantScopedFilter,
  getTenantCacheNamespace,
  prependTenantMatch,
} = require("../utils/tenantScope");

function calculateSessionStatus(session) {
  const now = new Date();

  if (now < session.start_time) {
    return "upcoming";
  }

  if (now >= session.start_time && now <= session.end_time) {
    return "active";
  }

  return "ended";
}

function resolveEligibleDepartmentNames(eligibleDepartmentIds, colleges) {
  if (!eligibleDepartmentIds || eligibleDepartmentIds.length === 0) {
    return [];
  }

  const names = [];

  colleges.forEach((college) => {
    college.departments.forEach((department) => {
      if (eligibleDepartmentIds.includes(department._id.toString())) {
        names.push(department.name);
      }
    });
  });

  return names;
}

function getSessionEligibility(session, student, colleges) {
  if (
    session.eligible_college &&
    session.eligible_college !== student.college
  ) {
    return {
      eligible: false,
      reason: "College not eligible",
    };
  }

  if (session.eligible_departments && session.eligible_departments.length > 0) {
    const departmentNames = resolveEligibleDepartmentNames(
      session.eligible_departments,
      colleges,
    );

    if (!departmentNames.includes(student.department)) {
      return {
        eligible: false,
        reason: "Department not eligible",
      };
    }
  }

  if (session.eligible_levels && session.eligible_levels.length > 0) {
    if (!session.eligible_levels.includes(student.level)) {
      return {
        eligible: false,
        reason: "Level not eligible",
      };
    }
  }

  return {
    eligible: true,
    reason: null,
  };
}

function buildCandidatesByPosition(candidates) {
  return candidates.reduce((acc, candidate) => {
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
  }, {});
}

class SessionController {
  async getStudentAndCollegeContext(req, studentId) {
    const [student, colleges] = await Promise.all([
      Student.findOne(getTenantScopedFilter(req, { _id: studentId })).lean(),
      College.find(getTenantScopedFilter(req, {}))
        .select("departments._id departments.name")
        .lean(),
    ]);

    return { student, colleges };
  }

  /**
   * Get all eligible sessions for a student
   * GET /api/sessions
   */
  async listEligibleSessions(req, res) {
    try {
      const studentId = req.studentId;
      const { status } = req.query;
      const tenantNamespace = getTenantCacheNamespace(req);

      const cacheKey = `eligible_sessions:${tenantNamespace}:${studentId}:${status || "all"}`;
      const cachedSessions = await cacheService.get(cacheKey);

      if (cachedSessions) {
        return res.json({
          sessions: cachedSessions,
          cached: true,
        });
      }

      const { student, colleges } = await this.getStudentAndCollegeContext(
        req,
        studentId,
      );

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      const sessionFilter = getTenantScopedFilter(req, status ? { status } : {});
      const sessions = await VotingSession.find(sessionFilter)
        .populate("candidates", "name position photo_url bio manifesto")
        .sort({ start_time: -1 })
        .lean();

      const eligibleSessions = sessions.reduce((acc, rawSession) => {
        const session = {
          ...rawSession,
          status: calculateSessionStatus(rawSession),
        };

        const { eligible } = getSessionEligibility(session, student, colleges);
        if (!eligible) {
          return acc;
        }

        acc.push({
          ...session,
          has_voted: student.has_voted_sessions.some(
            (value) => value.toString() === session._id.toString(),
          ),
          candidate_count: session.candidates.length,
        });

        return acc;
      }, []);

      await cacheService.set(cacheKey, eligibleSessions, 120);

      res.json({
        sessions: eligibleSessions,
        cached: false,
      });
    } catch (error) {
      console.error("List sessions error:", error);
      res.status(500).json({ error: "Failed to list sessions" });
    }
  }

  async buildSessionResponse(req, sessionId, studentId, cacheSuffix = "") {
    const tenantNamespace = getTenantCacheNamespace(req);
    const cacheKey = `session:${tenantNamespace}:${sessionId}:student:${studentId}${cacheSuffix}`;
    const cachedSession = await cacheService.get(cacheKey);

    if (cachedSession) {
      return {
        statusCode: 200,
        payload: {
          ...cachedSession,
          cached: true,
        },
      };
    }

    const [session, context] = await Promise.all([
      VotingSession.findOne(getTenantScopedFilter(req, { _id: sessionId }))
        .populate("candidates", "name position photo_url bio manifesto")
        .lean(),
      this.getStudentAndCollegeContext(req, studentId),
    ]);

    if (!session) {
      return {
        statusCode: 404,
        payload: { error: "Session not found" },
      };
    }

    if (!context.student) {
      return {
        statusCode: 404,
        payload: { error: "Student not found" },
      };
    }

    const calculatedSession = {
      ...session,
      status: calculateSessionStatus(session),
    };
    const { eligible, reason } = getSessionEligibility(
      calculatedSession,
      context.student,
      context.colleges,
    );

    const responseData = {
      session: {
        id: calculatedSession._id,
        title: calculatedSession.title,
        description: calculatedSession.description,
        start_time: calculatedSession.start_time,
        end_time: calculatedSession.end_time,
        status: calculatedSession.status,
        categories: calculatedSession.categories,
        location: calculatedSession.location,
        is_off_campus_allowed: calculatedSession.is_off_campus_allowed,
        eligible,
        eligibility_reason: reason,
        has_voted: context.student.has_voted_sessions.some(
          (value) => value.toString() === calculatedSession._id.toString(),
        ),
        candidates_by_position: buildCandidatesByPosition(
          calculatedSession.candidates,
        ),
      },
      cached: false,
    };

    await cacheService.set(cacheKey, responseData, 180);

    return {
      statusCode: 200,
      payload: responseData,
    };
  }

  /**
   * Get a specific session details
   * GET /api/sessions/:id
   */
  async getSession(req, res) {
    try {
      const result = await this.buildSessionResponse(
        req,
        req.params.id,
        req.studentId,
      );

      res.status(result.statusCode).json(result.payload);
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
      const result = await this.buildSessionResponse(
        req,
        req.params.id,
        req.studentId,
        ":byid",
      );

      res.status(result.statusCode).json(result.payload);
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
      const tenantNamespace = getTenantCacheNamespace(req);
      const cacheKey = `candidate:${tenantNamespace}:${id}`;
      const cachedCandidate = await cacheService.get(cacheKey);

      if (cachedCandidate) {
        return res.json({
          ...cachedCandidate,
          cached: true,
        });
      }

      const candidate = await Candidate.findOne(
        getTenantScopedFilter(req, { _id: id }),
      )
        .populate("session_id", "title description start_time end_time status")
        .lean();

      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      const session = candidate.session_id;
      const sessionStatus = calculateSessionStatus(session);

      const responseData = {
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
        cached: false,
      };

      await cacheService.set(cacheKey, responseData, 300);

      res.json(responseData);
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
      const tenantNamespace = getTenantCacheNamespace(req);
      const cacheKey = `live_results:${tenantNamespace}:${id}`;
      const cachedResults = await cacheService.get(cacheKey);

      if (cachedResults) {
        return res.json({
          ...cachedResults,
          cached: true,
        });
      }

      const sessionObjectId = new mongoose.Types.ObjectId(id);

      const [session, votesByCandidate, totalVotes] = await Promise.all([
        VotingSession.findOne(getTenantScopedFilter(req, { _id: id }))
          .select("title description start_time end_time status results_public")
          .lean(),
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
            session_id: id,
            status: "valid",
          }),
        ),
      ]);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const calculatedSession = {
        ...session,
        status: calculateSessionStatus(session),
      };

      const candidates = await Candidate.find(
        getTenantScopedFilter(req, { session_id: id }),
      )
        .select("name position photo_url")
        .lean();

      const candidatesWithVotes = candidates.map((candidate) => {
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
          candidate.is_leading = candidate.vote_count === maxVotes && maxVotes > 0;
        });
        position.candidates.sort((a, b) => b.vote_count - a.vote_count);
      });

      const responseData = {
        session: {
          id: calculatedSession._id,
          title: calculatedSession.title,
          description: calculatedSession.description,
          status: calculatedSession.status,
          start_time: calculatedSession.start_time,
          end_time: calculatedSession.end_time,
          is_live: calculatedSession.status === "active",
        },
        total_votes: totalVotes,
        last_updated: new Date().toISOString(),
        results: Object.values(resultsByPosition),
        cached: false,
      };

      await cacheService.set(cacheKey, responseData, 30);

      res.set({
        "Cache-Control": "public, max-age=30",
        ETag: `"${tenantNamespace}-${id}-${totalVotes}"`,
      });

      res.json(responseData);
    } catch (error) {
      console.error("Get live results error:", error);
      res.status(500).json({ error: "Failed to get live results" });
    }
  }
}

module.exports = new SessionController();
