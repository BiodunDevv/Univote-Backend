const Student = require("../models/Student");
const Admin = require("../models/Admin");
const VotingSession = require("../models/VotingSession");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const College = require("../models/College");
const AuditLog = require("../models/AuditLog");
const mongoose = require("mongoose");
const cacheService = require("../services/cacheService");

class DashboardController {
  /**
   * Helper: Get or cache individual stat with Redis
   */
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
      const adminId = req.adminId;
      const forceFresh = req.query.fresh === "true";

      // Try cache first (5 minute TTL)
      const cacheKey = `dashboard:admin:full`;
      const cachedData = forceFresh ? null : await cacheService.get(cacheKey);

      if (cachedData) {
        console.log("✅ Dashboard served from cache");
        return res.json({
          ...cachedData,
          cached: true,
          cache_age: Math.floor(
            (Date.now() - new Date(cachedData.timestamp).getTime()) / 1000,
          ),
        });
      }

      console.log("🔄 Fetching fresh dashboard data...");
      const startTime = Date.now();

      // Get current date for time-based queries
      const now = new Date();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Use Redis for individual stats caching (shorter TTL for frequently changing data)
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
      ] = await Promise.all([
        // Cache counts separately for 2 minutes
        this.getCachedStat(
          "stat:total_students",
          () => Student.countDocuments({}),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          "stat:active_students",
          () =>
            Student.countDocuments({ last_login_at: { $gte: thirtyDaysAgo } }),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          "stat:total_sessions",
          () => VotingSession.countDocuments({}),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          "stat:active_sessions",
          () => VotingSession.countDocuments({ status: "active" }),
          60,
          forceFresh,
        ),
        this.getCachedStat(
          "stat:upcoming_sessions",
          () => VotingSession.countDocuments({ status: "upcoming" }),
          60,
          forceFresh,
        ),
        this.getCachedStat(
          "stat:ended_sessions",
          () => VotingSession.countDocuments({ status: "ended" }),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          "stat:total_votes",
          () => Vote.countDocuments({ status: "valid" }),
          120,
          forceFresh,
        ),
        this.getCachedStat(
          "stat:total_colleges",
          () => College.countDocuments({ is_active: true }),
          300,
          forceFresh,
        ),
        this.getCachedStat(
          "stat:total_departments",
          () =>
            College.aggregate([
              { $match: { is_active: true } },
              { $unwind: "$departments" },
              { $match: { "departments.is_active": true } },
              { $count: "total" },
            ]).then((result) => result[0]?.total || 0),
          300,
          forceFresh,
        ),

        // Cache distributions for 3 minutes
        this.getCachedStat(
          "stat:students_by_level",
          () =>
            Student.aggregate([
              { $group: { _id: "$level", count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ]),
          180,
          forceFresh,
        ),

        this.getCachedStat(
          "stat:students_by_college",
          () =>
            Student.aggregate([
              { $group: { _id: "$college", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 },
            ]),
          180,
          forceFresh,
        ),

        this.getCachedStat(
          "stat:new_students_7days",
          () => Student.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
          300,
          forceFresh,
        ),
      ]);

      // Fetch non-cacheable or short-lived data
      const [
        recentAuditLogs,
        recentSessions,
        topVoters,
        voteTrend,
        studentsWhoVoted,
      ] = await Promise.all([
        // Recent audit logs (last 10) - cache for 1 minute
        this.getCachedStat(
          "stat:recent_audit_logs",
          async () => {
            const logs = await AuditLog.find({})
              .sort({ createdAt: -1 })
              .limit(10)
              .populate("user_id", "full_name email matric_no")
              .lean();
            return logs;
          },
          60,
          forceFresh,
        ),

        // Recent sessions with vote counts - cache for 2 minutes
        this.getCachedStat(
          "stat:recent_sessions",
          async () => {
            const sessions = await VotingSession.find({})
              .sort({ createdAt: -1 })
              .limit(5)
              .select("title status start_time end_time")
              .lean();

            const sessionIds = sessions.map((session) => session._id);
            const voteCounts = await Vote.aggregate([
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
            ]);

            const voteCountMap = new Map(
              voteCounts.map((item) => [item._id.toString(), item.count]),
            );

            const sessionsWithVotes = sessions.map((session) => ({
              ...session,
              vote_count: voteCountMap.get(session._id.toString()) || 0,
            }));
            return sessionsWithVotes;
          },
          120,
          forceFresh,
        ),

        // Top 5 voters - cache for 3 minutes
        this.getCachedStat(
          "stat:top_voters",
          async () => {
            return Student.aggregate([
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
              {
                $match: {
                  votes_cast: { $gt: 0 },
                },
              },
              { $sort: { votes_cast: -1 } },
              { $limit: 5 },
            ]);
          },
          180,
          forceFresh,
        ),

        // Vote trend (last 7 days) - cache for 5 minutes
        this.getCachedStat(
          "stat:vote_trend",
          () =>
            Vote.aggregate([
              {
                $match: { createdAt: { $gte: sevenDaysAgo }, status: "valid" },
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
          300,
          forceFresh,
        ),

        // Students who voted - cache for 2 minutes
        this.getCachedStat(
          "stat:students_who_voted",
          () =>
            Student.countDocuments({
              has_voted_sessions: { $exists: true, $ne: [] },
            }),
          120,
          forceFresh,
        ),
      ]);

      // Calculate participation rate
      const participationRate =
        totalStudents > 0
          ? ((studentsWhoVoted / totalStudents) * 100).toFixed(2)
          : 0;

      // Calculate average votes per session
      const avgVotesPerSession =
        totalSessions > 0 ? (totalVotes / totalSessions).toFixed(2) : 0;

      const fetchTime = Date.now() - startTime;
      console.log(`✅ Dashboard data fetched in ${fetchTime}ms`);

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
        fetch_time_ms: fetchTime,
      };

      // Cache full dashboard for 5 minutes
      if (!forceFresh) {
        await cacheService.set(cacheKey, dashboardData, 300);
        console.log(`💾 Dashboard cached with key: ${cacheKey}`);
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
      const startTime = Date.now();

      // Try cache first (2 minute TTL for student data)
      const cacheKey = `dashboard:student:${studentId}`;
      const cachedData = await cacheService.get(cacheKey);

      if (cachedData) {
        console.log("✅ Student dashboard served from cache");
        return res.json({
          ...cachedData,
          cached: true,
          cache_age: Math.floor(
            (Date.now() - new Date(cachedData.timestamp).getTime()) / 1000,
          ),
        });
      }

      console.log("🔄 Fetching fresh student dashboard data...");

      // Get student details from cache or DB
      const student = await this.getCachedStat(
        `student:profile:${studentId}`,
        () =>
          Student.findById(studentId)
            .select(
              "matric_no full_name email department college level has_voted_sessions face_token photo_url created_at last_login_at",
            )
            .lean(),
        120,
      );

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // Get eligible sessions - cache for 1 minute
      const now = new Date();
      const allSessions = await this.getCachedStat(
        "stat:all_sessions",
        () =>
          VotingSession.find({})
            .select(
              "title status start_time end_time eligible_college eligible_departments eligible_levels",
            )
            .lean(),
        60,
      );

      // Cache college departments mapping for 5 minutes
      const collegesData = await this.getCachedStat(
        "stat:colleges_departments",
        () => College.find({}).select("departments").lean(),
        300,
      );

      // Filter eligible sessions
      const eligibleSessions = [];
      const ineligibleSessions = [];

      for (const session of allSessions) {
        let isEligible = true;

        // Update status based on current time
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
          isEligible = false;
        }

        // Check department eligibility
        if (
          session.eligible_departments &&
          session.eligible_departments.length > 0
        ) {
          const departmentNames = [];

          collegesData.forEach((college) => {
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

        // Check level eligibility
        if (session.eligible_levels && session.eligible_levels.length > 0) {
          if (!session.eligible_levels.includes(student.level)) {
            isEligible = false;
          }
        }

        // Add has_voted flag
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

        if (isEligible) {
          eligibleSessions.push(sessionData);
        } else {
          ineligibleSessions.push(sessionData);
        }
      }

      // Count sessions by status
      const activeSessions = eligibleSessions.filter(
        (s) => s.status === "active",
      ).length;
      const upcomingSessions = eligibleSessions.filter(
        (s) => s.status === "upcoming",
      ).length;
      const endedSessions = eligibleSessions.filter(
        (s) => s.status === "ended",
      ).length;

      // Get voting history with session details - cache for 2 minutes
      const votingHistory = await this.getCachedStat(
        `student:voting_history:${studentId}`,
        () =>
          Vote.find({ student_id: studentId, status: "valid" })
            .populate("session_id", "title start_time end_time")
            .populate("candidate_id", "name position photo_url")
            .sort({ createdAt: -1 })
            .limit(10)
            .lean(),
        120,
      );

      // Get recent results for sessions student voted in
      const recentResults = [];
      const sessionIdsToCheck = student.has_voted_sessions.slice(0, 5);

      for (const sessionId of sessionIdsToCheck) {
        // Cache each session result for 3 minutes
        const sessionResult = await this.getCachedStat(
          `session:result:${sessionId}`,
          async () => {
            const session = await VotingSession.findById(sessionId)
              .select("title status end_time results_public")
              .populate("candidates", "name position vote_count")
              .lean();

            if (!session || session.status !== "ended") return null;

            // Group candidates by position
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

            // Find winner for each position
            const winners = {};
            Object.keys(resultsByPosition).forEach((position) => {
              const candidates = resultsByPosition[position];
              const maxVotes = Math.max(...candidates.map((c) => c.vote_count));
              winners[position] = candidates.find(
                (c) => c.vote_count === maxVotes,
              );
            });

            return {
              session_id: session._id,
              title: session.title,
              end_time: session.end_time,
              winners: winners,
            };
          },
          180,
        );

        if (sessionResult) {
          recentResults.push(sessionResult);
        }
      }

      // Get notifications (recent activities relevant to student)
      const notifications = [];

      // Check for active sessions not yet voted in
      const activeNotVoted = eligibleSessions.filter(
        (s) => s.status === "active" && !s.has_voted,
      );
      if (activeNotVoted.length > 0) {
        notifications.push({
          type: "active_sessions",
          message: `You have ${activeNotVoted.length} active voting session(s) available`,
          count: activeNotVoted.length,
          priority: "high",
        });
      }

      // Check for upcoming sessions
      if (upcomingSessions > 0) {
        notifications.push({
          type: "upcoming_sessions",
          message: `${upcomingSessions} voting session(s) starting soon`,
          count: upcomingSessions,
          priority: "medium",
        });
      }

      // Check if face token is missing
      if (!student.face_token) {
        notifications.push({
          type: "no_face_data",
          message: "Please register your facial data to enable voting",
          priority: "high",
        });
      }

      const dashboardData = {
        student_info: {
          matric_no: student.matric_no,
          full_name: student.full_name,
          email: student.email,
          department: student.department,
          college: student.college,
          level: student.level,
          photo_url: student.photo_url,
          has_facial_data: !!student.face_token,
          member_since: student.created_at,
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
          eligible: eligibleSessions.slice(0, 5), // Latest 5
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
        notifications: notifications,
        timestamp: new Date().toISOString(),
        fetch_time_ms: Date.now() - startTime,
      };

      // Cache for 2 minutes
      await cacheService.set(cacheKey, dashboardData, 120);
      console.log(`💾 Student dashboard cached with key: ${cacheKey}`);
      console.log(
        `✅ Student dashboard fetched in ${Date.now() - startTime}ms`,
      );

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
      const startTime = Date.now();
      const forceFresh = req.query.fresh === "true";

      const cacheKey = `dashboard:quick:${userType}:${userId}`;
      const cachedStats = forceFresh ? null : await cacheService.get(cacheKey);

      if (cachedStats) {
        console.log("✅ Quick stats served from cache");
        return res.json({ ...cachedStats, cached: true });
      }

      console.log("🔄 Fetching fresh quick stats...");

      if (userType === "admin") {
        // Use cached individual stats for better performance
        const [totalStudents, activeSessions, totalVotes, pendingActions] =
          await Promise.all([
            this.getCachedStat(
              "stat:total_students",
              () => Student.countDocuments({}),
              120,
              forceFresh,
            ),
            this.getCachedStat(
              "stat:active_sessions",
              () => VotingSession.countDocuments({ status: "active" }),
              60,
              forceFresh,
            ),
            this.getCachedStat(
              "stat:total_votes",
              () => Vote.countDocuments({ status: "valid" }),
              120,
              forceFresh,
            ),
            this.getCachedStat(
              "stat:pending_actions",
              () =>
                AuditLog.countDocuments({
                  status: "failure",
                  createdAt: {
                    $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                  },
                }),
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
          await cacheService.set(cacheKey, stats, 60); // 1 minute cache
        }
        console.log(
          `✅ Quick stats (admin) fetched in ${Date.now() - startTime}ms`,
        );
        return res.json(stats);
      } else {
        // Student quick stats - use cached data
        const student = await this.getCachedStat(
          `student:profile:${userId}`,
          () => Student.findById(userId).select("has_voted_sessions").lean(),
          120,
          forceFresh,
        );

        const [totalEligible, activeSessions] = await Promise.all([
          this.getCachedStat(
            "stat:total_sessions",
            () => VotingSession.countDocuments({}),
            120,
            forceFresh,
          ),
          this.getCachedStat(
            "stat:active_sessions",
            () => VotingSession.countDocuments({ status: "active" }),
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
          await cacheService.set(cacheKey, stats, 60); // 1 minute cache
        }
        console.log(
          `✅ Quick stats (student) fetched in ${Date.now() - startTime}ms`,
        );
        return res.json(stats);
      }
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

      console.log(`🗑️  Invalidating cache for ${userType}: ${userId}`);

      // Delete user-specific cache and related stats
      await Promise.all([
        cacheService.delPattern(`dashboard:${userType}:${userId}*`),
        cacheService.delPattern(`dashboard:quick:${userType}:${userId}*`),
        cacheService.delPattern(`student:profile:${userId}*`),
        cacheService.delPattern(`student:voting_history:${userId}*`),
        // Clear global stats if admin
        userType === "admin"
          ? cacheService.delPattern("stat:*")
          : Promise.resolve(),
      ]);

      console.log(`✅ Cache invalidated successfully for ${userType}`);

      res.json({
        message: "Dashboard cache invalidated successfully",
        cleared_patterns: [
          `dashboard:${userType}:${userId}*`,
          `dashboard:quick:${userType}:${userId}*`,
        ],
      });
    } catch (error) {
      console.error("Cache invalidation error:", error);
      res.status(500).json({ error: "Failed to invalidate cache" });
    }
  };
}

module.exports = new DashboardController();
