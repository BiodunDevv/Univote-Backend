const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");
const {
  authenticateAdmin,
  requireSuperAdmin,
  requireTenantAdmin,
} = require("../middleware/auth");
const {
  requireTenantAccess,
  requireTenantContext,
} = require("../middleware/tenantContext");
const auditLogger = require("../middleware/auditLogger");

// All routes require admin authentication
router.use(authenticateAdmin);

const tenantSettingsContext = [requireTenantContext, requireTenantAdmin];
const tenantSettingsAccess = [requireTenantAccess, requireTenantAdmin];

/**
 * @swagger
 * /admin/settings/profile:
 *   get:
 *     summary: Get admin profile
 *     description: Retrieve the authenticated admin's profile information.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Admin profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 admin:
 *                   $ref: '#/components/schemas/Admin'
 */
router.get("/profile", ...tenantSettingsContext, settingsController.getProfile);

/**
 * @swagger
 * /admin/settings/profile:
 *   patch:
 *     summary: Update admin profile
 *     description: Update the authenticated admin's profile details (name, email, etc.).
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 profile:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     full_name:
 *                       type: string
 *                     role:
 *                       type: string
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 */
router.patch(
  "/profile",
  ...tenantSettingsContext,
  auditLogger("update_admin_profile", "admin_profile"),
  settingsController.updateProfile,
);

router.get(
  "/tenant-profile",
  ...tenantSettingsAccess,
  settingsController.getTenantProfile,
);

router.patch(
  "/tenant-profile",
  ...tenantSettingsAccess,
  auditLogger("update_tenant_profile_settings", "tenant_settings"),
  settingsController.updateTenantProfile,
);

router.get("/identity", ...tenantSettingsAccess, settingsController.getIdentitySettings);
router.patch(
  "/identity",
  ...tenantSettingsAccess,
  auditLogger("update_tenant_identity_settings", "tenant_settings"),
  settingsController.updateIdentitySettings,
);

router.get("/labels", ...tenantSettingsAccess, settingsController.getLabelSettings);
router.patch(
  "/labels",
  ...tenantSettingsAccess,
  auditLogger("update_tenant_label_settings", "tenant_settings"),
  settingsController.updateLabelSettings,
);

router.get(
  "/auth-policy",
  ...tenantSettingsAccess,
  settingsController.getAuthPolicySettings,
);
router.patch(
  "/auth-policy",
  ...tenantSettingsAccess,
  auditLogger("update_tenant_auth_policy", "tenant_settings"),
  settingsController.updateAuthPolicySettings,
);

router.get(
  "/participant-fields",
  ...tenantSettingsAccess,
  settingsController.getParticipantFields,
);
router.patch(
  "/participant-fields",
  ...tenantSettingsAccess,
  auditLogger("update_tenant_participant_fields", "tenant_settings"),
  settingsController.updateParticipantFields,
);

router.get(
  "/feature-access",
  ...tenantSettingsAccess,
  settingsController.getFeatureAccess,
);
router.get(
  "/plan-entitlements",
  ...tenantSettingsAccess,
  settingsController.getPlanEntitlements,
);

/**
 * @swagger
 * /admin/settings/change-password:
 *   patch:
 *     summary: Change admin password
 *     description: Change the authenticated admin's password. Requires old password verification.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [old_password, new_password]
 *             properties:
 *               old_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed
 *       400:
 *         description: New password same as old
 *       401:
 *         description: Current password incorrect
 */
router.patch(
  "/change-password",
  ...tenantSettingsContext,
  auditLogger("change_admin_password", "admin_password"),
  settingsController.changePassword,
);

/**
 * @swagger
 * /admin/settings/dashboard:
 *   get:
 *     summary: Get settings dashboard
 *     description: Get admin settings dashboard with system overview.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Settings dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dashboard:
 *                   type: object
 *                   properties:
 *                     students:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         active:
 *                           type: integer
 *                         inactive:
 *                           type: integer
 *                         with_facial_data:
 *                           type: integer
 *                         facial_registration_rate:
 *                           type: number
 *                     colleges:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         total_departments:
 *                           type: integer
 *                     sessions:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         active:
 *                           type: integer
 *                         completed:
 *                           type: integer
 *                         pending:
 *                           type: integer
 *                     votes:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                     admins:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                     recent_sessions:
 *                       type: array
 *                       items:
 *                         type: object
 *                     recent_audit_logs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AuditLog'
 */
router.get("/dashboard", ...tenantSettingsAccess, settingsController.getDashboard);

/**
 * @swagger
 * /admin/settings/database-stats:
 *   get:
 *     summary: Get database statistics
 *     description: Get MongoDB database statistics including collection sizes, document counts, and storage usage.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Database statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collections:
 *                   type: object
 *                 total_documents:
 *                   type: integer
 *                 storage_size:
 *                   type: string
 */
router.get(
  "/database-stats",
  ...tenantSettingsAccess,
  settingsController.getDatabaseStats,
);

/**
 * @swagger
 * /admin/settings/system:
 *   get:
 *     summary: Get system configuration
 *     description: Get current system configuration including environment variables status, service availability, and feature flags.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 environment:
 *                   type: string
 *                 services:
 *                   type: object
 *                 features:
 *                   type: object
 */
router.get("/system", ...tenantSettingsAccess, settingsController.getSystemConfig);

/**
 * @swagger
 * /admin/settings/health:
 *   get:
 *     summary: Get system health
 *     description: Check health of all connected services (MongoDB, Redis, Face++, email).
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 services:
 *                   type: object
 *                   properties:
 *                     mongodb:
 *                       type: string
 *                     redis:
 *                       type: string
 *                     email:
 *                       type: string
 *                     facepp:
 *                       type: string
 */
router.get("/health", ...tenantSettingsAccess, settingsController.getSystemHealth);

/**
 * @swagger
 * /admin/settings/test-email:
 *   post:
 *     summary: Test email configuration
 *     description: Send a test email to verify SMTP configuration is working correctly.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Recipient email (defaults to admin's email)
 *     responses:
 *       200:
 *         description: Test email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 recipient:
 *                   type: string
 *                   format: email
 *       500:
 *         description: Email configuration error
 */
router.post("/test-email", ...tenantSettingsAccess, settingsController.testEmail);

/**
 * @swagger
 * /admin/settings/test-facepp:
 *   post:
 *     summary: Test Face++ configuration
 *     description: Verify Face++ API credentials and connectivity.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Face++ connection successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 test_result:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     face_detected:
 *                       type: boolean
 *                     face_token:
 *                       type: string
 *                     face_rectangle:
 *                       type: object
 *                     image_id:
 *                       type: string
 *                 configuration:
 *                   type: string
 *       500:
 *         description: Face++ configuration error
 */
router.post("/test-facepp", ...tenantSettingsAccess, settingsController.testFacepp);

/**
 * @swagger
 * /admin/settings/audit-logs:
 *   get:
 *     summary: Get audit logs
 *     description: Retrieve paginated audit logs with optional filters by action, category, admin, and date range.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: admin_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Paginated audit logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get("/audit-logs", ...tenantSettingsAccess, settingsController.getAuditLogs);

/**
 * @swagger
 * /admin/settings/audit-actions:
 *   get:
 *     summary: Get distinct audit actions
 *     description: Get list of all distinct audit log actions and categories for filter dropdowns.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of actions and categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 actions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get(
  "/audit-actions",
  ...tenantSettingsAccess,
  settingsController.getAuditActions,
);

/**
 * @swagger
 * /admin/settings/audit-logs/cleanup:
 *   delete:
 *     summary: Cleanup old audit logs
 *     description: Delete audit logs older than a specified date. Super admin only.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Delete logs before this date
 *     responses:
 *       200:
 *         description: Audit logs cleaned up
 *       403:
 *         description: Super admin access required
 */
router.delete(
  "/audit-logs/cleanup",
  requireSuperAdmin,
  auditLogger("cleanup_audit_logs", "audit_logs"),
  settingsController.cleanupAuditLogs,
);

/**
 * @swagger
 * /admin/settings/export:
 *   post:
 *     summary: Export data
 *     description: Export system data (students, sessions, votes) in CSV or JSON format.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [students, sessions, votes, audit_logs]
 *               format:
 *                 type: string
 *                 enum: [csv, json]
 *                 default: json
 *     responses:
 *       200:
 *         description: Exported data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data_type:
 *                   type: string
 *                 export_date:
 *                   type: string
 *                   format: date-time
 *                 total_records:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.post(
  "/export",
  ...tenantSettingsAccess,
  auditLogger("export_data", "system_data"),
  settingsController.exportData,
);

/**
 * @swagger
 * /admin/settings/notifications:
 *   get:
 *     summary: Get notification preferences
 *     description: Get current admin's notification preferences.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Notification preferences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notification_preferences:
 *                   type: object
 */
router.get(
  "/notifications",
  ...tenantSettingsContext,
  settingsController.getNotificationPreferences,
);

/**
 * @swagger
 * /admin/settings/notifications:
 *   patch:
 *     summary: Update notification preferences
 *     description: Update admin's notification preferences for email alerts and system notifications.
 *     tags: [Settings]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email_notifications:
 *                 type: boolean
 *               session_alerts:
 *                 type: boolean
 *               vote_alerts:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preferences updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 notification_preferences:
 *                   type: object
 */
router.patch(
  "/notifications",
  ...tenantSettingsContext,
  auditLogger("update_notification_preferences", "admin_notifications"),
  settingsController.updateNotificationPreferences,
);

module.exports = router;
