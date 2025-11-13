const Admin = require("../models/Admin");
const Student = require("../models/Student");
const VotingSession = require("../models/VotingSession");
const Vote = require("../models/Vote");
const AuditLog = require("../models/AuditLog");
const College = require("../models/College");
const bcrypt = require("bcryptjs");
const faceppService = require("../services/faceppService");
const emailService = require("../services/emailService");

class SettingsController {
  /**
   * Get admin profile settings
   * GET /api/admin/settings/profile
   */
  async getProfile(req, res) {
    try {
      const admin = await Admin.findById(req.adminId)
        .select("-password_hash -reset_password_code")
        .lean();

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      res.json({
        profile: admin,
      });
    } catch (error) {
      console.error("Get admin profile error:", error);
      res.status(500).json({ error: "Failed to get profile" });
    }
  }

  /**
   * Update admin profile
   * PATCH /api/admin/settings/profile
   */
  async updateProfile(req, res) {
    try {
      const { full_name, email } = req.body;

      const admin = await Admin.findById(req.adminId);

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Check if email is already taken by another admin
      if (email && email !== admin.email) {
        const existingAdmin = await Admin.findOne({
          email: email.toLowerCase(),
          _id: { $ne: req.adminId },
        });

        if (existingAdmin) {
          return res.status(409).json({
            error: "Email is already taken by another admin",
          });
        }

        admin.email = email.toLowerCase();
      }

      if (full_name !== undefined) {
        admin.full_name = full_name;
      }

      await admin.save();

      res.json({
        message: "Profile updated successfully",
        profile: {
          id: admin._id,
          email: admin.email,
          full_name: admin.full_name,
          role: admin.role,
          updated_at: admin.updatedAt,
        },
      });
    } catch (error) {
      console.error("Update admin profile error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  }

  /**
   * Change admin password
   * PATCH /api/admin/settings/change-password
   */
  async changePassword(req, res) {
    try {
      const { current_password, new_password } = req.body;

      if (!current_password || !new_password) {
        return res.status(400).json({
          error: "Current password and new password are required",
        });
      }

      if (new_password.length < 8) {
        return res.status(400).json({
          error: "New password must be at least 8 characters long",
        });
      }

      const admin = await Admin.findById(req.adminId);

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(
        current_password,
        admin.password_hash
      );

      if (!isValidPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10)
      );
      admin.password_hash = await bcrypt.hash(new_password, salt);

      await admin.save();

      res.json({
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Change admin password error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  }

  /**
   * Get system statistics dashboard
   * GET /api/admin/settings/dashboard
   */
  async getDashboard(req, res) {
    try {
      const [
        totalStudents,
        activeStudents,
        totalColleges,
        totalDepartments,
        totalSessions,
        activeSessions,
        completedSessions,
        totalVotes,
        totalAdmins,
        studentsWithFacialData,
        recentAuditLogs,
      ] = await Promise.all([
        Student.countDocuments(),
        Student.countDocuments({ is_active: true }),
        College.countDocuments(),
        College.aggregate([
          { $project: { department_count: { $size: "$departments" } } },
          { $group: { _id: null, total: { $sum: "$department_count" } } },
        ]),
        VotingSession.countDocuments(),
        VotingSession.countDocuments({ status: "active" }),
        VotingSession.countDocuments({ status: "ended" }),
        Vote.countDocuments({ status: "valid" }),
        Admin.countDocuments(),
        Student.countDocuments({ face_token: { $exists: true, $ne: null } }),
        AuditLog.find({ user_type: "admin" })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

      // Calculate facial registration percentage
      const facialRegistrationRate =
        totalStudents > 0
          ? ((studentsWithFacialData / totalStudents) * 100).toFixed(2)
          : 0;

      // Get voting statistics
      const votingStats = await VotingSession.aggregate([
        {
          $lookup: {
            from: "votes",
            localField: "_id",
            foreignField: "session_id",
            as: "votes",
          },
        },
        {
          $project: {
            title: 1,
            status: 1,
            start_time: 1,
            end_time: 1,
            vote_count: { $size: "$votes" },
          },
        },
        { $sort: { start_time: -1 } },
        { $limit: 5 },
      ]);

      // Get admin details for recent audit logs
      const adminIds = [
        ...new Set(
          recentAuditLogs.map((log) => log.user_id.toString()).filter(Boolean)
        ),
      ];
      const admins = await Admin.find({ _id: { $in: adminIds } })
        .select("full_name email")
        .lean();
      const adminMap = Object.fromEntries(
        admins.map((admin) => [admin._id.toString(), admin])
      );

      res.json({
        dashboard: {
          students: {
            total: totalStudents,
            active: activeStudents,
            inactive: totalStudents - activeStudents,
            with_facial_data: studentsWithFacialData,
            facial_registration_rate: `${facialRegistrationRate}%`,
          },
          colleges: {
            total: totalColleges,
            total_departments:
              totalDepartments.length > 0 ? totalDepartments[0].total : 0,
          },
          sessions: {
            total: totalSessions,
            active: activeSessions,
            completed: completedSessions,
            pending: totalSessions - activeSessions - completedSessions,
          },
          votes: {
            total: totalVotes,
          },
          admins: {
            total: totalAdmins,
          },
          recent_sessions: votingStats,
          recent_audit_logs: recentAuditLogs.map((log) => {
            const admin = adminMap[log.user_id.toString()];
            return {
              action: log.action,
              details: log.details,
              admin: admin
                ? {
                    name: admin.full_name,
                    email: admin.email,
                  }
                : null,
              timestamp: log.createdAt,
              ip_address: log.ip_address,
            };
          }),
        },
      });
    } catch (error) {
      console.error("Get dashboard error:", error);
      res.status(500).json({ error: "Failed to get dashboard data" });
    }
  }

  /**
   * Get system configuration
   * GET /api/admin/settings/system
   */
  async getSystemConfig(req, res) {
    try {
      // Get Face++ configuration status
      const faceppStatus = faceppService.getStatus();

      // Get email service configuration (Brevo)
      const emailConfig = {
        configured: !!process.env.BREVO_API_KEY,
        service: "Brevo (Sendinblue)",
        api_configured: !!process.env.BREVO_API_KEY,
        from_name: process.env.EMAIL_FROM_NAME || "Not configured",
        from_email: process.env.EMAIL_FROM_EMAIL || "Not configured",
      };

      // Get database configuration
      const dbConfig = {
        connected: true, // If we got here, DB is connected
        database_url: process.env.MONGODB_URI
          ? process.env.MONGODB_URI.replace(/\/\/.*:.*@/, "//***:***@") // Hide credentials
          : "Not configured",
      };

      // Get JWT configuration
      const jwtConfig = {
        configured: !!process.env.JWT_SECRET,
        token_expiry: process.env.JWT_EXPIRY || "24h",
      };

      // Get other settings
      const otherConfig = {
        bcrypt_rounds: parseInt(process.env.BCRYPT_ROUNDS || 10),
        default_student_password: "univote2024",
        environment: process.env.NODE_ENV || "development",
        port: process.env.PORT || 3000,
      };

      res.json({
        system_config: {
          facepp: faceppStatus,
          email: emailConfig,
          database: dbConfig,
          jwt: jwtConfig,
          other: otherConfig,
        },
      });
    } catch (error) {
      console.error("Get system config error:", error);
      res.status(500).json({ error: "Failed to get system configuration" });
    }
  }

  /**
   * Get audit logs with filters
   * GET /api/admin/settings/audit-logs
   */
  async getAuditLogs(req, res) {
    try {
      const {
        action,
        admin_id,
        start_date,
        end_date,
        page = 1,
        limit = 50,
      } = req.query;

      const filter = { user_type: "admin" };

      if (action) filter.action = action;
      if (admin_id) filter.user_id = admin_id;

      // Date range filter
      if (start_date || end_date) {
        filter.createdAt = {};
        if (start_date) filter.createdAt.$gte = new Date(start_date);
        if (end_date) filter.createdAt.$lte = new Date(end_date);
      }

      const [logs, total] = await Promise.all([
        AuditLog.find(filter)
          .sort({ createdAt: -1 })
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .lean(),
        AuditLog.countDocuments(filter),
      ]);

      // Get admin details separately
      const adminIds = [
        ...new Set(logs.map((log) => log.user_id.toString()).filter(Boolean)),
      ];
      const admins = await Admin.find({ _id: { $in: adminIds } })
        .select("full_name email role")
        .lean();
      const adminMap = Object.fromEntries(
        admins.map((admin) => [admin._id.toString(), admin])
      );

      res.json({
        audit_logs: logs.map((log) => {
          const admin = adminMap[log.user_id.toString()];
          return {
            id: log._id,
            action: log.action,
            details: log.details,
            admin: admin
              ? {
                  id: admin._id,
                  name: admin.full_name,
                  email: admin.email,
                  role: admin.role,
                }
              : null,
            timestamp: log.createdAt,
            ip_address: log.ip_address,
            user_agent: log.user_agent,
          };
        }),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({ error: "Failed to get audit logs" });
    }
  }

  /**
   * Get available actions for audit logs
   * GET /api/admin/settings/audit-actions
   */
  async getAuditActions(req, res) {
    try {
      const actions = await AuditLog.distinct("action");

      res.json({
        actions: actions.sort(),
        total: actions.length,
      });
    } catch (error) {
      console.error("Get audit actions error:", error);
      res.status(500).json({ error: "Failed to get audit actions" });
    }
  }

  /**
   * Clear old audit logs
   * DELETE /api/admin/settings/audit-logs/cleanup
   * Super admin only
   */
  async cleanupAuditLogs(req, res) {
    try {
      const { days_old = 90, preview = false } = req.body;

      if (days_old < 1) {
        return res.status(400).json({
          error: "days_old must be at least 1",
        });
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days_old);

      // Count how many logs would be deleted
      const count = await AuditLog.countDocuments({
        createdAt: { $lt: cutoffDate },
      });

      // If preview mode, just return count without deleting
      if (preview) {
        return res.json({
          preview: true,
          message: `${count} audit logs would be deleted`,
          count: count,
          cutoff_date: cutoffDate,
          note: `Logs created before ${cutoffDate.toLocaleString()} would be deleted`,
        });
      }

      // Actually delete the logs
      const result = await AuditLog.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      res.json({
        message: `Audit logs older than ${days_old} days deleted successfully`,
        deleted_count: result.deletedCount,
        cutoff_date: cutoffDate,
      });
    } catch (error) {
      console.error("Cleanup audit logs error:", error);
      res.status(500).json({ error: "Failed to cleanup audit logs" });
    }
  }

  /**
   * Test email configuration
   * POST /api/admin/settings/test-email
   */
  async testEmail(req, res) {
    try {
      const { recipient_email } = req.body;

      if (!recipient_email) {
        return res.status(400).json({
          error: "Recipient email is required",
        });
      }

      const admin = await Admin.findById(req.adminId).select("full_name email");

      // Send test email
      await emailService.sendEmail(
        recipient_email,
        "Univote Email Test",
        `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #4CAF50;">Email Configuration Test</h2>
          <p>This is a test email from Univote Backend.</p>
          <p><strong>Sent by:</strong> ${admin.full_name} (${admin.email})</p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          <hr style="margin: 20px 0; border: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">
            If you received this email, your email configuration is working correctly.
          </p>
        </div>
        `
      );

      res.json({
        message: "Test email sent successfully",
        recipient: recipient_email,
      });
    } catch (error) {
      console.error("Test email error:", error);
      res.status(500).json({
        error: "Failed to send test email",
        details: error.message,
      });
    }
  }

  /**
   * Test Face++ configuration
   * POST /api/admin/settings/test-facepp
   */
  async testFacepp(req, res) {
    try {
      const { image_url } = req.body;

      if (!image_url) {
        return res.status(400).json({
          error: "Image URL is required for Face++ test",
        });
      }

      // Get Face++ status
      const status = faceppService.getStatus();

      if (!status.configured) {
        return res.status(400).json({
          error: "Face++ is not configured",
          details:
            "Please configure FACEPP_API_KEY and FACEPP_API_SECRET in .env file",
        });
      }

      // Test face detection
      const result = await faceppService.detectFace(image_url);

      if (result.success) {
        res.json({
          message: "Face++ configuration is working correctly",
          test_result: {
            success: true,
            face_detected: true,
            face_token: result.face_token.substring(0, 20) + "...",
            face_rectangle: result.face_rectangle,
            image_id: result.image_id,
          },
          configuration: status,
        });
      } else {
        res.status(400).json({
          error: "Face detection failed",
          details: result.error,
          configuration: status,
        });
      }
    } catch (error) {
      console.error("Test Face++ error:", error);
      res.status(500).json({
        error: "Failed to test Face++ configuration",
        details: error.message,
      });
    }
  }

  /**
   * Get database statistics
   * GET /api/admin/settings/database-stats
   */
  async getDatabaseStats(req, res) {
    try {
      const [
        studentStats,
        voteStats,
        sessionStats,
        adminStats,
        collegeStats,
        auditLogStats,
      ] = await Promise.all([
        Student.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              with_face_token: {
                $sum: {
                  $cond: [
                    { $and: [{ $ifNull: ["$face_token", false] }] },
                    1,
                    0,
                  ],
                },
              },
              with_photo: {
                $sum: {
                  $cond: [{ $and: [{ $ifNull: ["$photo_url", false] }] }, 1, 0],
                },
              },
              active: {
                $sum: { $cond: [{ $eq: ["$is_active", true] }, 1, 0] },
              },
            },
          },
        ]),
        Vote.aggregate([
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),
        VotingSession.aggregate([
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),
        Admin.aggregate([
          {
            $group: {
              _id: "$role",
              count: { $sum: 1 },
            },
          },
        ]),
        College.countDocuments(),
        AuditLog.countDocuments(),
      ]);

      res.json({
        database_statistics: {
          students: studentStats[0] || {
            total: 0,
            with_face_token: 0,
            with_photo: 0,
            active: 0,
          },
          votes: {
            by_status: voteStats,
            total: voteStats.reduce((sum, v) => sum + v.count, 0),
          },
          sessions: {
            by_status: sessionStats,
            total: sessionStats.reduce((sum, s) => sum + s.count, 0),
          },
          admins: {
            by_role: adminStats,
            total: adminStats.reduce((sum, a) => sum + a.count, 0),
          },
          colleges: collegeStats,
          audit_logs: auditLogStats,
        },
      });
    } catch (error) {
      console.error("Get database stats error:", error);
      res.status(500).json({ error: "Failed to get database statistics" });
    }
  }

  /**
   * Export data (CSV/JSON)
   * POST /api/admin/settings/export
   */
  async exportData(req, res) {
    try {
      const { data_type, format = "json", filters = {} } = req.body;

      if (!data_type) {
        return res.status(400).json({
          error: "data_type is required (students, votes, sessions, admins)",
        });
      }

      let data;
      let filename;

      switch (data_type) {
        case "students":
          data = await Student.find(filters)
            .select(
              "-password_hash -active_token -face_token -embedding_vector"
            )
            .lean();
          filename = `students_export_${Date.now()}.${format}`;
          break;

        case "votes":
          data = await Vote.find(filters)
            .populate("student_id", "matric_no full_name")
            .populate("session_id", "title")
            .lean();
          filename = `votes_export_${Date.now()}.${format}`;
          break;

        case "sessions":
          data = await VotingSession.find(filters)
            .populate("candidates")
            .lean();
          filename = `sessions_export_${Date.now()}.${format}`;
          break;

        case "admins":
          data = await Admin.find(filters)
            .select("-password_hash -reset_password_code")
            .lean();
          filename = `admins_export_${Date.now()}.${format}`;
          break;

        case "audit_logs":
          data = await AuditLog.find({ user_type: "admin", ...filters }).lean();
          // Get admin details for audit logs
          const adminIds = [
            ...new Set(
              data.map((log) => log.user_id.toString()).filter(Boolean)
            ),
          ];
          const admins = await Admin.find({ _id: { $in: adminIds } })
            .select("full_name email")
            .lean();
          const adminMap = Object.fromEntries(
            admins.map((admin) => [admin._id.toString(), admin])
          );
          // Map admin details to logs
          data = data.map((log) => {
            const admin = adminMap[log.user_id.toString()];
            return {
              ...log,
              admin_name: admin ? admin.full_name : null,
              admin_email: admin ? admin.email : null,
            };
          });
          filename = `audit_logs_export_${Date.now()}.${format}`;
          break;

        default:
          return res.status(400).json({
            error: "Invalid data_type",
            allowed_types: [
              "students",
              "votes",
              "sessions",
              "admins",
              "audit_logs",
            ],
          });
      }

      if (format === "csv") {
        // Convert to CSV (basic implementation)
        if (data.length === 0) {
          return res.status(404).json({ error: "No data to export" });
        }

        const keys = Object.keys(data[0]);
        const csv = [
          keys.join(","),
          ...data.map((row) =>
            keys
              .map((key) => {
                const value = row[key];
                return typeof value === "object"
                  ? JSON.stringify(value)
                  : value;
              })
              .join(",")
          ),
        ].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
        return res.send(csv);
      } else {
        // JSON format
        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
        return res.json({
          data_type,
          export_date: new Date(),
          total_records: data.length,
          data,
        });
      }
    } catch (error) {
      console.error("Export data error:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  }

  /**
   * Get system health check
   * GET /api/admin/settings/health
   */
  async getSystemHealth(req, res) {
    try {
      const health = {
        status: "healthy",
        timestamp: new Date(),
        checks: {},
      };

      // Database check
      try {
        await Student.findOne().limit(1);
        health.checks.database = { status: "healthy", message: "Connected" };
      } catch (error) {
        health.checks.database = {
          status: "unhealthy",
          message: error.message,
        };
        health.status = "unhealthy";
      }

      // Face++ check
      const faceppStatus = faceppService.getStatus();
      health.checks.facepp = {
        status: faceppStatus.configured ? "healthy" : "not_configured",
        message: faceppStatus.configured
          ? "Configured"
          : "API keys not configured",
        base_url: faceppStatus.base_url,
      };

      // Email check (Brevo)
      const emailConfigured = !!process.env.BREVO_API_KEY;
      health.checks.email = {
        status: emailConfigured ? "healthy" : "not_configured",
        service: "Brevo",
        message: emailConfigured
          ? "Brevo API configured"
          : "Brevo API key not configured",
        from_email: process.env.EMAIL_FROM_EMAIL || "Not configured",
      };

      // JWT check
      const jwtConfigured = !!process.env.JWT_SECRET;
      health.checks.jwt = {
        status: jwtConfigured ? "healthy" : "not_configured",
        message: jwtConfigured ? "Configured" : "JWT secret not configured",
      };

      res.json({ health });
    } catch (error) {
      console.error("Get system health error:", error);
      res.status(500).json({
        health: {
          status: "unhealthy",
          timestamp: new Date(),
          error: error.message,
        },
      });
    }
  }

  /**
   * Get notification preferences
   * GET /api/admin/settings/notifications
   */
  async getNotificationPreferences(req, res) {
    try {
      const admin = await Admin.findById(req.adminId)
        .select("notification_preferences")
        .lean();

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Default notification preferences if not set
      const preferences = admin.notification_preferences || {
        email_on_new_vote: true,
        email_on_session_end: true,
        email_on_student_upload: true,
        email_on_system_alert: true,
      };

      res.json({ notification_preferences: preferences });
    } catch (error) {
      console.error("Get notification preferences error:", error);
      res.status(500).json({ error: "Failed to get notification preferences" });
    }
  }

  /**
   * Update notification preferences
   * PATCH /api/admin/settings/notifications
   */
  async updateNotificationPreferences(req, res) {
    try {
      const preferences = req.body;

      const admin = await Admin.findById(req.adminId);

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      admin.notification_preferences = {
        ...admin.notification_preferences,
        ...preferences,
      };

      await admin.save();

      res.json({
        message: "Notification preferences updated successfully",
        notification_preferences: admin.notification_preferences,
      });
    } catch (error) {
      console.error("Update notification preferences error:", error);
      res
        .status(500)
        .json({ error: "Failed to update notification preferences" });
    }
  }
}

module.exports = new SettingsController();
