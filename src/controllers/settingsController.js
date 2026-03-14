const Admin = require("../models/Admin");
const Student = require("../models/Student");
const VotingSession = require("../models/VotingSession");
const Vote = require("../models/Vote");
const AuditLog = require("../models/AuditLog");
const College = require("../models/College");
const Tenant = require("../models/Tenant");
const TenantAdminMembership = require("../models/TenantAdminMembership");
const PlatformSetting = require("../models/PlatformSetting");
const bcrypt = require("bcryptjs");
const faceProviderService = require("../services/faceProviderService");
const emailService = require("../services/emailService");
const {
  getTenantScopedFilter,
  prependTenantMatch,
} = require("../utils/tenantScope");
const {
  DEFAULT_PARTICIPANT_FIELDS,
  getTenantEligibilityPolicy,
  getTenantIdentityMetadata,
  getTenantParticipantFieldMetadata,
  getTenantSettings,
  getTenantSettingsCatalog,
  mergeTenantSettings,
  normalizeIdentifierKey,
} = require("../utils/tenantSettings");
const { getTenantEntitlements, hasTenantFeature } = require("../services/planAccessService");

function serializeTenantSettingsPayload(tenant) {
  const settings = getTenantSettings(tenant);
  return {
    tenant: {
      id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan_code: tenant.plan_code,
      subscription_status: tenant.subscription_status,
      branding: tenant.branding || {},
    },
    labels: settings.labels,
    identity: getTenantIdentityMetadata(tenant),
    auth_policy: settings.auth,
    participant_fields: getTenantParticipantFieldMetadata(tenant),
    eligibility_policy: getTenantEligibilityPolicy(tenant),
    support: settings.support,
    notifications: settings.notifications,
    voting: settings.voting,
    features: settings.features,
    entitlements: getTenantEntitlements(tenant),
  };
}

async function getOrCreatePlatformSetting() {
  let platformSetting = await PlatformSetting.findOne({ key: "defaults" });
  if (!platformSetting) {
    platformSetting = await PlatformSetting.create({ key: "defaults" });
  }
  return platformSetting;
}

function buildAuditLogFilter(req, overrides = {}) {
  return getTenantScopedFilter(req, {
    user_type: "admin",
    ...overrides,
  });
}

async function buildTenantAdminExportRows(req, filters = {}) {
  const membershipFilter = getTenantScopedFilter(req, {
    ...(filters.is_active !== undefined ? { is_active: filters.is_active } : {}),
    ...(filters.role ? { role: filters.role } : {}),
  });

  const memberships = await TenantAdminMembership.find(membershipFilter)
    .sort({ createdAt: -1 })
    .lean();

  const adminIds = memberships.map((membership) => membership.admin_id);
  const admins = await Admin.find({ _id: { $in: adminIds } })
    .select("email full_name role is_active last_login_at createdAt updatedAt")
    .lean();
  const adminMap = new Map(
    admins.map((admin) => [admin._id.toString(), admin]),
  );

  return memberships.map((membership) => {
    const admin = adminMap.get(membership.admin_id.toString());
    return {
      membership_id: membership._id,
      admin_id: membership.admin_id,
      email: admin?.email || null,
      full_name: admin?.full_name || null,
      global_role: admin?.role || null,
      global_is_active: admin?.is_active || false,
      tenant_role: membership.role,
      permissions: membership.permissions,
      tenant_is_active: membership.is_active,
      last_login_at: admin?.last_login_at || null,
      created_at: membership.createdAt,
      updated_at: membership.updatedAt,
    };
  });
}

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
        admin.password_hash,
      );

      if (!isValidPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10),
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
        Student.countDocuments(getTenantScopedFilter(req, {})),
        Student.countDocuments(getTenantScopedFilter(req, { is_active: true })),
        College.countDocuments(getTenantScopedFilter(req, {})),
        College.aggregate(
          prependTenantMatch(req, [
            { $project: { department_count: { $size: "$departments" } } },
            { $group: { _id: null, total: { $sum: "$department_count" } } },
          ]),
        ),
        VotingSession.countDocuments(getTenantScopedFilter(req, {})),
        VotingSession.countDocuments(
          getTenantScopedFilter(req, { status: "active" }),
        ),
        VotingSession.countDocuments(
          getTenantScopedFilter(req, { status: "ended" }),
        ),
        Vote.countDocuments(getTenantScopedFilter(req, { status: "valid" })),
        req.tenantId
          ? TenantAdminMembership.countDocuments(
              getTenantScopedFilter(req, { is_active: true }),
            )
          : Admin.countDocuments(),
        Student.countDocuments(
          getTenantScopedFilter(req, {
            face_token: { $exists: true, $ne: null },
          }),
        ),
        AuditLog.find(buildAuditLogFilter(req))
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

      // Calculate facial registration percentage
      const facialRegistrationRate =
        totalStudents > 0
          ? ((studentsWithFacialData / totalStudents) * 100).toFixed(2)
          : 0;

      // Get recent sessions with vote counts using grouped aggregation (faster than $lookup of full vote arrays)
      const recentSessions = await VotingSession.find(getTenantScopedFilter(req, {}))
        .select("title status start_time end_time")
        .sort({ start_time: -1 })
        .limit(5)
        .lean();

      const sessionIds = recentSessions.map((session) => session._id);
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

      const votingStats = recentSessions.map((session) => ({
        ...session,
        vote_count: voteCountMap.get(session._id.toString()) || 0,
      }));

      // Get admin details for recent audit logs
      const adminIds = [
        ...new Set(
          recentAuditLogs
            .map((log) => log.user_id?.toString())
            .filter(Boolean),
        ),
      ];
      const admins = await Admin.find({ _id: { $in: adminIds } })
        .select("full_name email")
        .lean();
      const adminMap = Object.fromEntries(
        admins.map((admin) => [admin._id.toString(), admin]),
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
            const admin = log.user_id
              ? adminMap[log.user_id.toString()]
              : null;
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
      const faceppStatus = await faceProviderService.getStatus();

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
          tenant: req.tenant
            ? {
                id: req.tenant._id,
                name: req.tenant.name,
                slug: req.tenant.slug,
                plan_code: req.tenant.plan_code,
                subscription_status: req.tenant.subscription_status,
              }
            : null,
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
        tenant_id,
        start_date,
        end_date,
        page = 1,
        limit = 50,
      } = req.query;

      const filter = buildAuditLogFilter(req);

      if (action) filter.action = action;
      if (admin_id) filter.user_id = admin_id;
      if (tenant_id && req.admin?.role === "super_admin") {
        filter.tenant_id = tenant_id;
      }

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
        ...new Set(logs.map((log) => log.user_id?.toString()).filter(Boolean)),
      ];
      const tenantIds = [
        ...new Set(logs.map((log) => log.tenant_id?.toString()).filter(Boolean)),
      ];
      const [admins, tenants] = await Promise.all([
        Admin.find({ _id: { $in: adminIds } }).select("full_name email role").lean(),
        Tenant.find({ _id: { $in: tenantIds } }).select("name slug").lean(),
      ]);
      const adminMap = Object.fromEntries(
        admins.map((admin) => [admin._id.toString(), admin]),
      );
      const tenantMap = Object.fromEntries(
        tenants.map((tenant) => [tenant._id.toString(), tenant]),
      );

      res.json({
        audit_logs: logs.map((log) => {
          const admin = log.user_id ? adminMap[log.user_id.toString()] : null;
          const tenant = log.tenant_id ? tenantMap[log.tenant_id.toString()] : null;
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
            tenant: tenant
              ? {
                  id: log.tenant_id,
                  name: tenant.name,
                  slug: tenant.slug,
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
      const actions = await AuditLog.distinct("action", buildAuditLogFilter(req));

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
      await emailService.sendOperationalTestEmail({
        to: recipient_email,
        senderName: admin.full_name,
        senderEmail: admin.email,
        tenant: req.tenant || null,
      });

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
      const status = await faceProviderService.getStatus();

      if (!status.configured) {
        return res.status(400).json({
          error: "Face++ is not configured",
          details:
            "Please configure FACEPP_API_KEY and FACEPP_API_SECRET in .env file",
        });
      }

      // Test face detection
      const result = await faceProviderService.testConnection(image_url);

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
        Student.aggregate(
          prependTenantMatch(req, [
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
        ),
        Vote.aggregate(
          prependTenantMatch(req, [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ]),
        ),
        VotingSession.aggregate(
          prependTenantMatch(req, [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ]),
        ),
        req.tenantId
          ? TenantAdminMembership.aggregate([
              {
                $match: {
                  tenant_id: req.tenantId,
                },
              },
              {
                $group: {
                  _id: "$role",
                  count: { $sum: 1 },
                },
              },
            ])
          : Admin.aggregate([
              {
                $group: {
                  _id: "$role",
                  count: { $sum: 1 },
                },
              },
            ]),
        College.countDocuments(getTenantScopedFilter(req, {})),
        AuditLog.countDocuments(getTenantScopedFilter(req, {})),
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
      const scopedFilters = getTenantScopedFilter(req, filters);

      switch (data_type) {
        case "students":
          data = await Student.find(scopedFilters)
            .select(
              "-password_hash -active_token -face_token -embedding_vector",
            )
            .lean();
          filename = `students_export_${Date.now()}.${format}`;
          break;

        case "votes":
          data = await Vote.find(scopedFilters)
            .populate("student_id", "matric_no full_name")
            .populate("session_id", "title")
            .lean();
          filename = `votes_export_${Date.now()}.${format}`;
          break;

        case "sessions":
          data = await VotingSession.find(scopedFilters)
            .populate("candidates")
            .lean();
          filename = `sessions_export_${Date.now()}.${format}`;
          break;

        case "admins":
          if (req.tenantId) {
            data = await buildTenantAdminExportRows(req, filters);
          } else {
            data = await Admin.find(filters)
              .select("-password_hash -reset_password_code")
              .lean();
          }
          filename = `admins_export_${Date.now()}.${format}`;
          break;

        case "audit_logs":
          data = await AuditLog.find(buildAuditLogFilter(req, filters)).lean();
          // Get admin details for audit logs
          const adminIds = [
            ...new Set(
              data.map((log) => log.user_id?.toString()).filter(Boolean),
            ),
          ];
          const admins = await Admin.find({ _id: { $in: adminIds } })
            .select("full_name email")
            .lean();
          const adminMap = Object.fromEntries(
            admins.map((admin) => [admin._id.toString(), admin]),
          );
          // Map admin details to logs
          data = data.map((log) => {
            const admin = log.user_id ? adminMap[log.user_id.toString()] : null;
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
              .join(","),
          ),
        ].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        return res.send(csv);
      } else {
        // JSON format
        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
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
        await Student.findOne(getTenantScopedFilter(req, {})).limit(1);
        health.checks.database = { status: "healthy", message: "Connected" };
      } catch (error) {
        health.checks.database = {
          status: "unhealthy",
          message: error.message,
        };
        health.status = "unhealthy";
      }

      // Face++ check
      const faceppStatus = await faceProviderService.getStatus();
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

      if (req.tenant) {
        health.checks.tenant = {
          status: "healthy",
          message: `${req.tenant.name} is on ${req.tenant.plan_code}`,
          subscription_status: req.tenant.subscription_status,
        };
      }

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

  async getTenantProfile(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(req.tenantId).lean();
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      res.json(serializeTenantSettingsPayload(tenant));
    } catch (error) {
      console.error("Get tenant profile settings error:", error);
      res.status(500).json({ error: "Failed to fetch tenant settings" });
    }
  }

  async updateTenantProfile(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(req.tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const {
        name,
        primary_domain,
        support_email,
        primary_color,
        accent_color,
        logo_url,
        contact_name,
        contact_email,
        contact_phone,
      } = req.body;

      if (name !== undefined) tenant.name = String(name || "").trim() || tenant.name;
      if (primary_domain !== undefined) {
        tenant.primary_domain = primary_domain
          ? String(primary_domain).trim().toLowerCase()
          : null;
      }

      tenant.branding = {
        ...(tenant.branding?.toObject?.() || tenant.branding || {}),
        ...(support_email !== undefined
          ? { support_email: support_email ? String(support_email).trim().toLowerCase() : null }
          : {}),
        ...(primary_color !== undefined ? { primary_color } : {}),
        ...(accent_color !== undefined ? { accent_color } : {}),
        ...(logo_url !== undefined ? { logo_url: logo_url || null } : {}),
      };

      tenant.onboarding = {
        ...(tenant.onboarding?.toObject?.() || tenant.onboarding || {}),
        ...(contact_name !== undefined ? { contact_name } : {}),
        ...(contact_email !== undefined
          ? { contact_email: contact_email ? String(contact_email).trim().toLowerCase() : null }
          : {}),
        ...(contact_phone !== undefined ? { contact_phone } : {}),
      };

      await tenant.save();

      res.json({
        message: "Tenant profile updated successfully",
        ...serializeTenantSettingsPayload(tenant),
      });
    } catch (error) {
      console.error("Update tenant profile settings error:", error);
      res.status(500).json({ error: "Failed to update tenant settings" });
    }
  }

  async getIdentitySettings(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const [tenant, platformSetting] = await Promise.all([
        Tenant.findById(req.tenantId).lean(),
        getOrCreatePlatformSetting(),
      ]);

      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      res.json({
        identity: getTenantIdentityMetadata(tenant),
        labels: getTenantSettings(tenant).labels,
        catalog: getTenantSettingsCatalog(),
        platform: platformSetting.identity_catalog,
        entitlements: getTenantEntitlements(tenant),
      });
    } catch (error) {
      console.error("Get identity settings error:", error);
      res.status(500).json({ error: "Failed to fetch identity settings" });
    }
  }

  async updateIdentitySettings(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(req.tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const currentSettings = getTenantSettings(tenant);
      const {
        primary_identifier,
        allowed_identifiers,
        recovery_identifiers,
        display_identifier,
      } = req.body;

      const nextPrimary = normalizeIdentifierKey(
        primary_identifier || currentSettings.identity.primary_identifier,
      );

      if (
        nextPrimary !== "matric_no" &&
        !hasTenantFeature(tenant, "custom_identity_policy")
      ) {
        return res.status(403).json({
          error: "Your current plan does not allow a custom participant login identifier",
          code: "PLAN_FEATURE_UNAVAILABLE",
          required_feature: "custom_identity_policy",
        });
      }

      const merged = mergeTenantSettings({
        ...currentSettings,
        identity: {
          ...currentSettings.identity,
          ...(primary_identifier !== undefined
            ? { primary_identifier: nextPrimary }
            : {}),
          ...(allowed_identifiers !== undefined
            ? { allowed_identifiers }
            : {}),
          ...(recovery_identifiers !== undefined
            ? { recovery_identifiers }
            : {}),
          ...(display_identifier !== undefined
            ? { display_identifier }
            : {}),
        },
      });

      tenant.settings = merged;
      await tenant.save();

      res.json({
        message: "Identity policy updated successfully",
        identity: getTenantIdentityMetadata(tenant),
        labels: merged.labels,
        entitlements: getTenantEntitlements(tenant),
      });
    } catch (error) {
      console.error("Update identity settings error:", error);
      res.status(500).json({ error: "Failed to update identity settings" });
    }
  }

  async getLabelSettings(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(req.tenantId).lean();
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      res.json({
        labels: getTenantSettings(tenant).labels,
        entitlements: getTenantEntitlements(tenant),
      });
    } catch (error) {
      console.error("Get label settings error:", error);
      res.status(500).json({ error: "Failed to fetch label settings" });
    }
  }

  async updateLabelSettings(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(req.tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (!hasTenantFeature(tenant, "custom_terminology")) {
        return res.status(403).json({
          error: "Your current plan does not allow custom participant terminology",
          code: "PLAN_FEATURE_UNAVAILABLE",
          required_feature: "custom_terminology",
        });
      }

      const currentSettings = getTenantSettings(tenant);
      tenant.settings = mergeTenantSettings({
        ...currentSettings,
        labels: {
          ...currentSettings.labels,
          ...(req.body.participant_singular !== undefined
            ? { participant_singular: String(req.body.participant_singular).trim() }
            : {}),
          ...(req.body.participant_plural !== undefined
            ? { participant_plural: String(req.body.participant_plural).trim() }
            : {}),
        },
      });

      await tenant.save();

      res.json({
        message: "Participant terminology updated successfully",
        labels: getTenantSettings(tenant).labels,
        entitlements: getTenantEntitlements(tenant),
      });
    } catch (error) {
      console.error("Update label settings error:", error);
      res.status(500).json({ error: "Failed to update label settings" });
    }
  }

  async getAuthPolicySettings(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(req.tenantId).lean();
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const settings = getTenantSettings(tenant);
      res.json({
        auth_policy: settings.auth,
        support: settings.support,
        notifications: settings.notifications,
        voting: settings.voting,
        participant_fields: getTenantParticipantFieldMetadata(tenant),
        eligibility_policy: getTenantEligibilityPolicy(tenant),
        entitlements: getTenantEntitlements(tenant),
      });
    } catch (error) {
      console.error("Get auth policy settings error:", error);
      res.status(500).json({ error: "Failed to fetch auth policy settings" });
    }
  }

  async updateAuthPolicySettings(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(req.tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const currentSettings = getTenantSettings(tenant);
      const nextRequireFaceVerification = Boolean(
        req.body.require_face_verification ??
          currentSettings.auth.require_face_verification,
      );

      if (nextRequireFaceVerification && !hasTenantFeature(tenant, "face_verification")) {
        return res.status(403).json({
          error: "Your current plan does not allow mandatory face verification",
          code: "PLAN_FEATURE_UNAVAILABLE",
          required_feature: "face_verification",
        });
      }

      tenant.settings = mergeTenantSettings({
        ...currentSettings,
        auth: {
          ...currentSettings.auth,
          ...(req.body.require_email !== undefined
            ? { require_email: Boolean(req.body.require_email) }
            : {}),
          ...(req.body.require_photo !== undefined
            ? { require_photo: Boolean(req.body.require_photo) }
            : {}),
          ...(req.body.require_face_verification !== undefined
            ? { require_face_verification: nextRequireFaceVerification }
            : {}),
        },
        support: {
          ...currentSettings.support,
          ...(req.body.allow_participant_tickets !== undefined
            ? { allow_participant_tickets: Boolean(req.body.allow_participant_tickets) }
            : {}),
        },
        notifications: {
          ...currentSettings.notifications,
          ...(req.body.email_enabled !== undefined
            ? { email_enabled: Boolean(req.body.email_enabled) }
            : {}),
          ...(req.body.in_app_enabled !== undefined
            ? { in_app_enabled: Boolean(req.body.in_app_enabled) }
            : {}),
          ...(req.body.push_enabled !== undefined
            ? { push_enabled: Boolean(req.body.push_enabled) }
            : {}),
        },
        voting: {
          ...currentSettings.voting,
          ...(req.body.voting_require_face_verification !== undefined
            ? {
                require_face_verification: Boolean(
                  req.body.voting_require_face_verification,
                ),
              }
            : {}),
        },
      });

      await tenant.save();

      res.json({
        message: "Authentication and policy settings updated successfully",
        auth_policy: getTenantSettings(tenant).auth,
        support: getTenantSettings(tenant).support,
        notifications: getTenantSettings(tenant).notifications,
        voting: getTenantSettings(tenant).voting,
        participant_fields: getTenantParticipantFieldMetadata(tenant),
        eligibility_policy: getTenantEligibilityPolicy(tenant),
        entitlements: getTenantEntitlements(tenant),
      });
    } catch (error) {
      console.error("Update auth policy settings error:", error);
      res.status(500).json({ error: "Failed to update auth policy settings" });
    }
  }

  async getParticipantFields(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const [tenant, platformSetting] = await Promise.all([
        Tenant.findById(req.tenantId).lean(),
        getOrCreatePlatformSetting(),
      ]);

      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      res.json({
        participant_fields: getTenantParticipantFieldMetadata(tenant),
        eligibility_policy: getTenantEligibilityPolicy(tenant),
        defaults: DEFAULT_PARTICIPANT_FIELDS,
        platform: {
          allowed_eligibility_dimensions:
            platformSetting.identity_catalog?.allowed_eligibility_dimensions || [
              "college",
              "department",
              "level",
            ],
        },
        entitlements: getTenantEntitlements(tenant),
      });
    } catch (error) {
      console.error("Get participant fields error:", error);
      res.status(500).json({ error: "Failed to fetch participant field policy" });
    }
  }

  async updateParticipantFields(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(req.tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      if (!hasTenantFeature(tenant, "custom_participant_structure")) {
        return res.status(403).json({
          error: "Your current plan does not allow configurable participant structure",
          code: "PLAN_FEATURE_UNAVAILABLE",
          required_feature: "custom_participant_structure",
        });
      }

      const currentSettings = getTenantSettings(tenant);
      const nextFieldsInput = req.body.participant_fields || {};

      const participantFields = Object.fromEntries(
        Object.entries(currentSettings.participant_fields || {}).map(
          ([fieldKey, fieldValue]) => [
            fieldKey,
            {
              ...fieldValue,
              ...((nextFieldsInput && nextFieldsInput[fieldKey]) || {}),
            },
          ],
        ),
      );

      participantFields.full_name = {
        ...participantFields.full_name,
        enabled: true,
        required: true,
      };

      const primaryIdentifier =
        currentSettings.identity.primary_identifier || "matric_no";
      participantFields[primaryIdentifier] = {
        ...participantFields[primaryIdentifier],
        enabled: true,
        required: true,
      };

      if (!participantFields.email?.enabled) {
        participantFields.email = {
          ...participantFields.email,
          required: false,
        };
      }

      if (participantFields.department?.enabled && !participantFields.college?.enabled) {
        return res.status(400).json({
          error: "College must remain enabled when department is enabled",
          code: "INVALID_PARTICIPANT_FIELD_POLICY",
        });
      }

      if (participantFields.department?.required && !participantFields.college?.required) {
        participantFields.college = {
          ...participantFields.college,
          required: true,
        };
      }

      if (participantFields.level?.required && !participantFields.department?.enabled) {
        return res.status(400).json({
          error: "Level cannot be required when department is disabled",
          code: "INVALID_PARTICIPANT_FIELD_POLICY",
        });
      }

      tenant.settings = mergeTenantSettings({
        ...currentSettings,
        participant_fields: participantFields,
        auth: {
          ...currentSettings.auth,
          require_email:
            participantFields.email?.enabled &&
            participantFields.email?.required,
        },
      });

      await tenant.save();

      res.json({
        message: "Participant field policy updated successfully",
        participant_fields: getTenantParticipantFieldMetadata(tenant),
        eligibility_policy: getTenantEligibilityPolicy(tenant),
        entitlements: getTenantEntitlements(tenant),
      });
    } catch (error) {
      console.error("Update participant fields error:", error);
      res.status(500).json({ error: "Failed to update participant field policy" });
    }
  }

  async getFeatureAccess(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(req.tenantId).lean();
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      res.json({
        features: {
          custom_terminology: hasTenantFeature(tenant, "custom_terminology"),
          custom_identity_policy: hasTenantFeature(
            tenant,
            "custom_identity_policy",
          ),
          custom_participant_structure: hasTenantFeature(
            tenant,
            "custom_participant_structure",
          ),
          custom_branding: hasTenantFeature(tenant, "custom_branding"),
          advanced_analytics: hasTenantFeature(tenant, "advanced_analytics"),
          advanced_reports: hasTenantFeature(tenant, "advanced_reports"),
          realtime_support: hasTenantFeature(tenant, "realtime_support"),
          push_notifications: hasTenantFeature(tenant, "push_notifications"),
          face_verification: hasTenantFeature(tenant, "face_verification"),
        },
        entitlements: getTenantEntitlements(tenant),
      });
    } catch (error) {
      console.error("Get feature access error:", error);
      res.status(500).json({ error: "Failed to fetch feature access" });
    }
  }

  async getPlanEntitlements(req, res) {
    try {
      if (!req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(req.tenantId).lean();
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      res.json({
        entitlements: getTenantEntitlements(tenant),
        settings: getTenantSettings(tenant),
        participant_fields: getTenantParticipantFieldMetadata(tenant),
        eligibility_policy: getTenantEligibilityPolicy(tenant),
      });
    } catch (error) {
      console.error("Get plan entitlements error:", error);
      res.status(500).json({ error: "Failed to fetch tenant entitlements" });
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
