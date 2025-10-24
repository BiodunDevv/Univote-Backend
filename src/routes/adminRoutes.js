const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const adminController = require("../controllers/adminController");
const { authenticateAdmin, requireSuperAdmin } = require("../middleware/auth");
const { adminLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validator");
const auditLogger = require("../middleware/auditLogger");

/**
 * @route   POST /api/admin/upload-students
 * @desc    Upload students from CSV
 * @access  Private (Admin)
 */
router.post(
  "/upload-students",
  authenticateAdmin,
  adminLimiter,
  [
    body("csv_data").isArray().withMessage("CSV data must be an array"),
    validate,
  ],
  auditLogger("upload_students", "students"),
  adminController.uploadStudents
);

/**
 * @route   POST /api/admin/create-session
 * @desc    Create a new voting session
 * @access  Private (Admin)
 */
router.post(
  "/create-session",
  authenticateAdmin,
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("start_time").isISO8601().withMessage("Valid start time is required"),
    body("end_time").isISO8601().withMessage("Valid end time is required"),
    body("categories").isArray().withMessage("Categories must be an array"),
    body("location").isObject().withMessage("Location is required"),
    validate,
  ],
  auditLogger("create_session", "sessions"),
  adminController.createSession
);

/**
 * @route   PATCH /api/admin/update-session/:id
 * @desc    Update a voting session
 * @access  Private (Admin)
 */
router.patch(
  "/update-session/:id",
  authenticateAdmin,
  auditLogger("update_session", "sessions"),
  adminController.updateSession
);

/**
 * @route   DELETE /api/admin/delete-session/:id
 * @desc    Delete a voting session
 * @access  Private (Admin)
 */
router.delete(
  "/delete-session/:id",
  authenticateAdmin,
  auditLogger("delete_session", "sessions"),
  adminController.deleteSession
);

/**
 * @route   DELETE /api/admin/remove-department
 * @desc    Remove students by department
 * @access  Private (Admin)
 */
router.delete(
  "/remove-department",
  authenticateAdmin,
  [
    body("departments").notEmpty().withMessage("Departments required"),
    validate,
  ],
  auditLogger("remove_department", "students"),
  adminController.removeDepartment
);

/**
 * @route   DELETE /api/admin/cleanup-all
 * @desc    Cleanup all sessions and votes
 * @access  Private (Super Admin)
 */
router.delete(
  "/cleanup-all",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("cleanup_all", "system"),
  adminController.cleanupAll
);

/**
 * @route   POST /api/admin/create-admin
 * @desc    Create a new admin
 * @access  Private (Super Admin)
 */
router.post(
  "/create-admin",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("full_name").notEmpty().withMessage("Full name is required"),
    validate,
  ],
  auditLogger("create_admin", "admins"),
  adminController.createAdmin
);

/**
 * @route   GET /api/admin/students
 * @desc    Get all students with filters
 * @access  Private (Admin)
 */
router.get("/students", authenticateAdmin, adminController.getStudents);

/**
 * @route   GET /api/admin/sessions
 * @desc    Get all sessions
 * @access  Private (Admin)
 */
router.get("/sessions", authenticateAdmin, adminController.getSessions);

/**
 * @route   GET /api/admin/session-stats/:id
 * @desc    Get session statistics
 * @access  Private (Admin)
 */
router.get(
  "/session-stats/:id",
  authenticateAdmin,
  adminController.getSessionStats
);

module.exports = router;
