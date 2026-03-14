const Student = require("../models/Student");
const VotingSession = require("../models/VotingSession");
const Vote = require("../models/Vote");
const College = require("../models/College");
const AuditLog = require("../models/AuditLog");
const cacheService = require("../services/cacheService");
const {
  getTenantScopedFilter,
  getTenantCacheNamespace,
  prependTenantMatch,
} = require("../utils/tenantScope");
const {
  getTenantEligibilityPolicy,
  getTenantIdentityMetadata,
  getTenantParticipantFieldMetadata,
  getTenantSettings,
} = require("../utils/tenantSettings");

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

function resolveEligibleDepartmentNames(session, colleges) {
  if (!session.eligible_departments || session.eligible_departments.length === 0) {
    return [];
  }

  const departmentNames = [];
  colleges.forEach((college) => {
    college.departments.forEach((department) => {
      if (session.eligible_departments.includes(department._id.toString())) {
        departmentNames.push(department.name);
      }
    });
  });

  return departmentNames;
}

function isStudentEligibleForSession(session, student, colleges) {
  if (
    session.eligible_college &&
    session.eligible_college !== student.college
  ) {
    return false;
  }

  if (session.eligible_departments && session.eligible_departments.length > 0) {
    const departmentNames = resolveEligibleDepartmentNames(session, colleges);
    if (!departmentNames.includes(student.department)) {
      return false;
    }
  }

  if (session.eligible_levels && session.eligible_levels.length > 0) {
    if (!session.eligible_levels.includes(student.level)) {
      return false;
    }
  }

  return true;
}

function buildTenantStatKey(req, key) {
  return `stat:${getTenantCacheNamespace(req)}:${key}`;
}

class DashboardController {
  getCachedStat = async (
    key,
    fetchFunction,
    ttl = 300,
    bypassCache = false,
  ) => {
    if (!bypassCache) {
      const cached = await cacheService.get(key);
      if (cached !== null) return cached;
    }

    const data = await fetchFunction();
    if (!bypassCache) {
      await cacheService.set(key, data, ttl);
    }
    return data;
  };

  /**
   * Get admin dashboard statistics
   * GET /api/dashboard/admin
   */
  getAdminDashboard = async (req, res) => {
    try {
      const forceFresh = req.query.fresh === "true";
      const tenantNamespace = getTenantCacheNamespace(req);
      const cacheKey = `dashboard:admin:${tenantNamespace}:full`;
      const cachedData = forceFresh ? null : await cacheService.get(cacheKey);

      if (cachedData) {
        return res.json({
          ...cachedData,
          cached: true,
          cache_age: Math.floor(
            (Date.now() - new Date(cachedData.timestamp).getTime()) / 1000,
          ),
        });
      }

      const startTime = Date.now();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalStudents,
        activeStudents,
        totalSessions,
        activeSessions,
        upcomingSessions,
        endedSessions,
        totalVotes,
        totalColleges,
        totalDepartments,
        studentsByLevel,
        studentsByCollege,
        newStudents,
        recentAuditLogs,
        recentSessions,
        topVoters,
        voteTrend,
        studentsWhoVoted,
      ] = await Promise.all([
        this.getCachedStat(
          buildTenantStatKey(req, "total_students"),
          () => Student.countDocuments(getTenantScopedFilter(req, {})),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "active_students"),
          () =>
            Student.countDocuments(
              getTenantScopedFilter(req, {
                last_login_at: { $gte: thirtyDaysAgo },
              }),
            ),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "total_sessions"),
          () => VotingSession.countDocuments(getTenantScopedFilter(req, {})),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "active_sessions"),
          () =>
            VotingSession.countDocuments(
              getTenantScopedFilter(req, { status: "active" }),
            ),
          60,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "upcoming_sessions"),
          () =>
            VotingSession.countDocuments(
              getTenantScopedFilter(req, { status: "upcoming" }),
            ),
          60,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "ended_sessions"),
          () =>
            VotingSession.countDocuments(
              getTenantScopedFilter(req, { status: "ended" }),
            ),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "total_votes"),
          () => Vote.countDocuments(getTenantScopedFilter(req, { status: "valid" })),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "total_colleges"),
          () =>
            College.countDocuments(getTenantScopedFilter(req, { is_active: true })),
          300,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "total_departments"),
          () =>
            College.aggregate(
              prependTenantMatch(req, [
                { $match: { is_active: true } },
                { $unwind: "$departments" },
                { $match: { "departments.is_active": true } },
                { $count: "total" },
              ]),
            ).then((result) => result[0]?.total || 0),
          300,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "students_by_level"),
          () =>
            Student.aggregate(
              prependTenantMatch(req, [
                { $group: { _id: "$level", count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
              ]),
            ),
          180,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "students_by_college"),
          () =>
            Student.aggregate(
              prependTenantMatch(req, [
                { $group: { _id: "$college", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
              ]),
            ),
          180,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "new_students_7days"),
          () =>
            Student.countDocuments(
              getTenantScopedFilter(req, { createdAt: { $gte: sevenDaysAgo } }),
            ),
          300,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "recent_audit_logs"),
          () =>
            AuditLog.find(getTenantScopedFilter(req, {}))
              .sort({ createdAt: -1 })
              .limit(10)
              .populate("user_id", "full_name email matric_no")
              .lean(),
          60,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "recent_sessions"),
          async () => {
            const sessions = await VotingSession.find(getTenantScopedFilter(req, {}))
              .sort({ createdAt: -1 })
              .limit(5)
              .select("title status start_time end_time")
              .lean();

            const sessionIds = sessions.map((session) => session._id);
            const voteCounts = await Vote.aggregate(
              prependTenantMatch(req, [
                {
                  $match: {
                    status: "valid",
                    session_id: { $in: sessionIds },
                  },
                },
                {
                  $group: {
                    _id: "$session_id",
                    count: { $sum: 1 },
                  },
                },
              ]),
            );

            const voteCountMap = new Map(
              voteCounts.map((item) => [item._id.toString(), item.count]),
            );

            return sessions.map((session) => ({
              ...session,
              vote_count: voteCountMap.get(session._id.toString()) || 0,
            }));
          },
          120,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "top_voters"),
          () =>
            Student.aggregate(
              prependTenantMatch(req, [
                {
                  $project: {
                    matric_no: 1,
                    full_name: 1,
                    department: 1,
                    college: 1,
                    votes_cast: {
                      $size: { $ifNull: ["$has_voted_sessions", []] },
                    },
                  },
                },
                { $match: { votes_cast: { $gt: 0 } } },
                { $sort: { votes_cast: -1 } },
                { $limit: 5 },
              ]),
            ),
          180,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "vote_trend"),
          () =>
            Vote.aggregate(
              prependTenantMatch(req, [
                {
                  $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    status: "valid",
                  },
                },
                {
                  $group: {
                    _id: {
                      $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                    },
                    count: { $sum: 1 },
                  },
                },
                { $sort: { _id: 1 } },
              ]),
            ),
          300,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "students_who_voted"),
          () =>
            Student.countDocuments(
              getTenantScopedFilter(req, {
                has_voted_sessions: { $exists: true, $ne: [] },
              }),
            ),
          120,
          forceFresh,
        ),
      ]);

      const participationRate =
        totalStudents > 0
          ? ((studentsWhoVoted / totalStudents) * 100).toFixed(2)
          : 0;
      const avgVotesPerSession =
        totalSessions > 0 ? (totalVotes / totalSessions).toFixed(2) : 0;

      const dashboardData = {
        overview: {
          total_students: totalStudents,
          active_students: activeStudents,
          total_sessions: totalSessions,
          active_sessions: activeSessions,
          upcoming_sessions: upcomingSessions,
          ended_sessions: endedSessions,
          total_votes: totalVotes,
          total_colleges: totalColleges,
          total_departments: totalDepartments,
          participation_rate: parseFloat(participationRate),
          avg_votes_per_session: parseFloat(avgVotesPerSession),
          new_students_7days: newStudents,
        },
        distributions: {
          students_by_level: studentsByLevel.map((item) => ({
            level: item._id,
            count: item.count,
          })),
          students_by_college: studentsByCollege.map((item) => ({
            college: item._id,
            count: item.count,
          })),
        },
        recent_sessions: recentSessions,
        top_voters: topVoters,
        vote_trend: voteTrend.map((item) => ({
          date: item._id,
          votes: item.count,
        })),
        recent_activities: recentAuditLogs.map((log) => ({
          id: log._id,
          user_type: log.user_type,
          user_name: log.user_id?.full_name || log.user_id?.email || "Unknown",
          action: log.action,
          resource: log.resource,
          timestamp: log.createdAt,
          status: log.status,
        })),
        timestamp: new Date().toISOString(),
        fetch_time_ms: Date.now() - startTime,
      };

      if (!forceFresh) {
        await cacheService.set(cacheKey, dashboardData, 300);
      }

      res.json(dashboardData);
    } catch (error) {
      console.error("Admin dashboard error:", error);
      res.status(500).json({ error: "Failed to load dashboard data" });
    }
  };

  /**
   * Get student dashboard data
   * GET /api/dashboard/student
   */
  getStudentDashboard = async (req, res) => {
    try {
      const studentId = req.studentId;
      const tenantNamespace = getTenantCacheNamespace(req);
      const startTime = Date.now();
      const cacheKey = `dashboard:student:${tenantNamespace}:${studentId}`;
      const cachedData = await cacheService.get(cacheKey);

      if (cachedData) {
        return res.json({
          ...cachedData,
          cached: true,
          cache_age: Math.floor(
            (Date.now() - new Date(cachedData.timestamp).getTime()) / 1000,
          ),
        });
      }

      const student = await this.getCachedStat(
        buildTenantStatKey(req, `student_profile:${studentId}`),
        () =>
          Student.findOne(getTenantScopedFilter(req, { _id: studentId }))
            .select(
              "matric_no member_id employee_id username full_name email department college level has_voted_sessions face_token photo_url createdAt last_login_at first_login",
            )
            .lean(),
        120,
      );

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      const [allSessions, collegesData, votingHistory] = await Promise.all([
        this.getCachedStat(
          buildTenantStatKey(req, "all_sessions"),
          () =>
            VotingSession.find(getTenantScopedFilter(req, {}))
              .select(
                "title status start_time end_time eligible_college eligible_departments eligible_levels results_public candidates",
              )
              .lean(),
          60,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "colleges_departments"),
          () =>
            College.find(getTenantScopedFilter(req, {}))
              .select("departments")
              .lean(),
          300,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, `student_voting_history:${studentId}`),
          () =>
            Vote.find(
              getTenantScopedFilter(req, {
                student_id: studentId,
                status: "valid",
              }),
            )
              .populate("session_id", "title start_time end_time")
              .populate("candidate_id", "name position photo_url")
              .sort({ createdAt: -1 })
              .limit(10)
              .lean(),
          120,
        ),
      ]);

      const eligibleSessions = [];
      const ineligibleSessions = [];

      allSessions.forEach((rawSession) => {
        const session = {
          ...rawSession,
          status: calculateSessionStatus(rawSession),
        };

        const hasVoted = student.has_voted_sessions.some(
          (id) => id.toString() === session._id.toString(),
        );

        const sessionData = {
          _id: session._id,
          title: session.title,
          status: session.status,
          start_time: session.start_time,
          end_time: session.end_time,
          has_voted: hasVoted,
        };

        if (isStudentEligibleForSession(session, student, collegesData)) {
          eligibleSessions.push(sessionData);
        } else {
          ineligibleSessions.push(sessionData);
        }
      });

      const activeSessions = eligibleSessions.filter(
        (session) => session.status === "active",
      ).length;
      const upcomingSessions = eligibleSessions.filter(
        (session) => session.status === "upcoming",
      ).length;
      const endedSessions = eligibleSessions.filter(
        (session) => session.status === "ended",
      ).length;

      const recentResults = [];
      const sessionIdsToCheck = student.has_voted_sessions.slice(0, 5);

      for (const sessionId of sessionIdsToCheck) {
        const sessionResult = await this.getCachedStat(
          buildTenantStatKey(req, `session_result:${sessionId}`),
          async () => {
            const session = await VotingSession.findOne(
              getTenantScopedFilter(req, { _id: sessionId }),
            )
              .select("title status end_time results_public")
              .populate("candidates", "name position vote_count")
              .lean();

            if (!session) return null;

            const sessionStatus = calculateSessionStatus(session);
            if (sessionStatus !== "ended") return null;

            const resultsByPosition = {};
            session.candidates.forEach((candidate) => {
              if (!resultsByPosition[candidate.position]) {
                resultsByPosition[candidate.position] = [];
              }
              resultsByPosition[candidate.position].push({
                name: candidate.name,
                vote_count: candidate.vote_count,
              });
            });

            const winners = {};
            Object.keys(resultsByPosition).forEach((position) => {
              const candidates = resultsByPosition[position];
              const maxVotes = Math.max(...candidates.map((c) => c.vote_count));
              winners[position] = candidates.find(
                (candidate) => candidate.vote_count === maxVotes,
              );
            });

            return {
              session_id: session._id,
              title: session.title,
              end_time: session.end_time,
              winners,
            };
          },
          180,
        );

        if (sessionResult) {
          recentResults.push(sessionResult);
        }
      }

      const notifications = [];
      const activeNotVoted = eligibleSessions.filter(
        (session) => session.status === "active" && !session.has_voted,
      );

      if (activeNotVoted.length > 0) {
        notifications.push({
          type: "active_sessions",
          message: `You have ${activeNotVoted.length} active voting session(s) available`,
          count: activeNotVoted.length,
          priority: "high",
        });
      }

      if (upcomingSessions > 0) {
        notifications.push({
          type: "upcoming_sessions",
          message: `${upcomingSessions} voting session(s) starting soon`,
          count: upcomingSessions,
          priority: "medium",
        });
      }

      if (!student.face_token) {
        notifications.push({
          type: "no_face_data",
          message: "Please register your facial data to enable voting",
          priority: "high",
        });
      }

      const dashboardData = {
        tenant: req.tenant
          ? {
              id: req.tenant._id,
              name: req.tenant.name,
              slug: req.tenant.slug,
              primary_domain: req.tenant.primary_domain || null,
              plan_code: req.tenant.plan_code || null,
              labels: getTenantSettings(req.tenant).labels,
              identity: getTenantIdentityMetadata(req.tenant),
              participant_fields: getTenantParticipantFieldMetadata(req.tenant),
              eligibility_policy: getTenantEligibilityPolicy(req.tenant),
              branding: {
                primary_color: req.tenant.branding?.primary_color || null,
                accent_color: req.tenant.branding?.accent_color || null,
                logo_url: req.tenant.branding?.logo_url || null,
                support_email: req.tenant.branding?.support_email || null,
              },
            }
          : null,
        student_info: {
          matric_no: student.matric_no,
          member_id: student.member_id || null,
          employee_id: student.employee_id || null,
          username: student.username || null,
          display_identifier:
            student.member_id ||
            student.employee_id ||
            student.username ||
            student.matric_no ||
            student.email,
          full_name: student.full_name,
          email: student.email,
          department: student.department,
          college: student.college,
          level: student.level,
          photo_url: student.photo_url,
          has_facial_data: !!student.face_token,
          first_login: Boolean(student.first_login),
          member_since: student.createdAt,
          last_login: student.last_login_at,
        },
        voting_stats: {
          total_votes_cast: student.has_voted_sessions.length,
          eligible_sessions: eligibleSessions.length,
          active_sessions: activeSessions,
          upcoming_sessions: upcomingSessions,
          ended_sessions: endedSessions,
        },
        sessions: {
          eligible: eligibleSessions.slice(0, 5),
          total_eligible: eligibleSessions.length,
        },
        voting_history: votingHistory.map((vote) => ({
          session: vote.session_id?.title || "Unknown Session",
          candidate: vote.candidate_id?.name || "Unknown Candidate",
          position: vote.candidate_id?.position || "Unknown Position",
          voted_at: vote.createdAt,
          face_match_score: vote.face_match_score,
        })),
        recent_results: recentResults,
        notifications,
        timestamp: new Date().toISOString(),
        fetch_time_ms: Date.now() - startTime,
      };

      await cacheService.set(cacheKey, dashboardData, 120);

      res.json(dashboardData);
    } catch (error) {
      console.error("Student dashboard error:", error);
      res.status(500).json({ error: "Failed to load dashboard data" });
    }
  };

  /**
   * Get dashboard statistics summary (quick overview)
   * GET /api/dashboard/stats
   */
  getQuickStats = async (req, res) => {
    try {
      const userType = req.admin ? "admin" : "student";
      const userId = req.admin ? req.adminId : req.studentId;
      const forceFresh = req.query.fresh === "true";
      const tenantNamespace = getTenantCacheNamespace(req);
      const cacheKey = `dashboard:quick:${tenantNamespace}:${userType}:${userId}`;
      const cachedStats = forceFresh ? null : await cacheService.get(cacheKey);

      if (cachedStats) {
        return res.json({ ...cachedStats, cached: true });
      }

      const startTime = Date.now();

      if (userType === "admin") {
        const [totalStudents, activeSessions, totalVotes, pendingActions] =
          await Promise.all([
            this.getCachedStat(
              buildTenantStatKey(req, "total_students"),
              () => Student.countDocuments(getTenantScopedFilter(req, {})),
              120,
              forceFresh,
            ),
            this.getCachedStat(
              buildTenantStatKey(req, "active_sessions"),
              () =>
                VotingSession.countDocuments(
                  getTenantScopedFilter(req, { status: "active" }),
                ),
              60,
              forceFresh,
            ),
            this.getCachedStat(
              buildTenantStatKey(req, "total_votes"),
              () => Vote.countDocuments(getTenantScopedFilter(req, { status: "valid" })),
              120,
              forceFresh,
            ),
            this.getCachedStat(
              buildTenantStatKey(req, "pending_actions"),
              () =>
                AuditLog.countDocuments(
                  getTenantScopedFilter(req, {
                    status: "failure",
                    createdAt: {
                      $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    },
                  }),
                ),
              120,
              forceFresh,
            ),
          ]);

        const stats = {
          total_students: totalStudents,
          active_sessions: activeSessions,
          total_votes: totalVotes,
          pending_actions: pendingActions,
          fetch_time_ms: Date.now() - startTime,
        };

        if (!forceFresh) {
          await cacheService.set(cacheKey, stats, 60);
        }
        return res.json(stats);
      }

      const student = await this.getCachedStat(
        buildTenantStatKey(req, `student_profile:${userId}`),
        () =>
          Student.findOne(getTenantScopedFilter(req, { _id: userId }))
            .select("has_voted_sessions")
            .lean(),
        120,
        forceFresh,
      );

      const [totalEligible, activeSessions] = await Promise.all([
        this.getCachedStat(
          buildTenantStatKey(req, "total_sessions"),
          () => VotingSession.countDocuments(getTenantScopedFilter(req, {})),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          buildTenantStatKey(req, "active_sessions"),
          () =>
            VotingSession.countDocuments(
              getTenantScopedFilter(req, { status: "active" }),
            ),
          60,
          forceFresh,
        ),
      ]);

      const stats = {
        votes_cast: student?.has_voted_sessions.length || 0,
        active_sessions: activeSessions,
        total_eligible_sessions: totalEligible,
        fetch_time_ms: Date.now() - startTime,
      };

      if (!forceFresh) {
        await cacheService.set(cacheKey, stats, 60);
      }
      return res.json(stats);
    } catch (error) {
      console.error("Quick stats error:", error);
      res.status(500).json({ error: "Failed to load statistics" });
    }
  };

  /**
   * Invalidate dashboard cache
   * POST /api/dashboard/invalidate-cache
   */
  invalidateCache = async (req, res) => {
    try {
      const userType = req.admin ? "admin" : "student";
      const userId = req.admin ? req.adminId : req.studentId;
      const tenantNamespace = getTenantCacheNamespace(req);

      await Promise.all([
        cacheService.delPattern(`dashboard:${userType}:${tenantNamespace}:${userId}*`),
        cacheService.delPattern(
          `dashboard:quick:${tenantNamespace}:${userType}:${userId}*`,
        ),
        cacheService.delPattern(`stat:${tenantNamespace}:*`),
        userType === "student"
          ? cacheService.delPattern(`student:profile:${userId}*`)
          : Promise.resolve(),
      ]);

      res.json({
        message: "Dashboard cache invalidated successfully",
        cleared_patterns: [
          `dashboard:${userType}:${tenantNamespace}:${userId}*`,
          `dashboard:quick:${tenantNamespace}:${userType}:${userId}*`,
        ],
      });
    } catch (error) {
      console.error("Cache invalidation error:", error);
      res.status(500).json({ error: "Failed to invalidate cache" });
    }
  };
}

module.exports = new DashboardController();
