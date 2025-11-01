const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");
const { authenticateAdmin, requireSuperAdmin } = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");

// All routes require admin authentication
router.use(authenticateAdmin);

// Profile management
router.get("/profile", settingsController.getProfile);
router.patch(
  "/profile",
  auditLogger("update_admin_profile", "admin_profile"),
  settingsController.updateProfile
);
router.patch(
  "/change-password",
  auditLogger("change_admin_password", "admin_password"),
  settingsController.changePassword
);

// Dashboard and statistics
router.get("/dashboard", settingsController.getDashboard);
router.get("/database-stats", settingsController.getDatabaseStats);

// System configuration
router.get("/system", settingsController.getSystemConfig);
router.get("/health", settingsController.getSystemHealth);

// Testing endpoints
router.post("/test-email", settingsController.testEmail);
router.post("/test-facepp", settingsController.testFacepp);

// Audit logs
router.get("/audit-logs", settingsController.getAuditLogs);
router.get("/audit-actions", settingsController.getAuditActions);
router.delete(
  "/audit-logs/cleanup",
  requireSuperAdmin,
  auditLogger("cleanup_audit_logs", "audit_logs"),
  settingsController.cleanupAuditLogs
);

// Data export
router.post(
  "/export",
  auditLogger("export_data", "system_data"),
  settingsController.exportData
);

// Notification preferences
router.get("/notifications", settingsController.getNotificationPreferences);
router.patch(
  "/notifications",
  auditLogger("update_notification_preferences", "admin_notifications"),
  settingsController.updateNotificationPreferences
);

module.exports = router;
