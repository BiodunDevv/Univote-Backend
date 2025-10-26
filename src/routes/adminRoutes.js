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
 * @route   GET /api/admin/candidates/:id
 * @desc    Get candidate by ID
 * @access  Private (Admin)
 */
router.get(
  "/candidates/:id",
  authenticateAdmin,
  adminController.getCandidateById
);

/**
 * @route   PATCH /api/admin/candidates/:id
 * @desc    Update a candidate
 * @access  Private (Admin)
 */
router.patch(
  "/candidates/:id",
  authenticateAdmin,
  auditLogger("update_candidate", "candidates"),
  adminController.updateCandidate
);

/**
 * @route   DELETE /api/admin/candidates/:id
 * @desc    Delete a candidate
 * @access  Private (Admin)
 */
router.delete(
  "/candidates/:id",
  authenticateAdmin,
  auditLogger("delete_candidate", "candidates"),
  adminController.deleteCandidate
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
 * @route   GET /api/admin/students/:id
 * @desc    Get single student by ID
 * @access  Private (Admin)
 */
router.get("/students/:id", authenticateAdmin, adminController.getStudentById);

/**
 * @route   PATCH /api/admin/students/:id
 * @desc    Update student details
 * @access  Private (Admin)
 */
router.patch(
  "/students/:id",
  authenticateAdmin,
  [
    body("full_name")
      .optional()
      .notEmpty()
      .withMessage("Full name cannot be empty"),
    body("email").optional().isEmail().withMessage("Valid email is required"),
    body("level")
      .optional()
      .isIn(["100", "200", "300", "400", "500", "600"])
      .withMessage("Invalid level"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_student", "students"),
  adminController.updateStudent
);

/**
 * @route   DELETE /api/admin/students/:id
 * @desc    Delete or deactivate student
 * @access  Private (Admin)
 */
router.delete(
  "/students/:id",
  authenticateAdmin,
  auditLogger("delete_student", "students"),
  adminController.deleteStudent
);

/**
 * @route   PATCH /api/admin/students/bulk-update
 * @desc    Bulk update students
 * @access  Private (Admin)
 */
router.patch(
  "/students/bulk-update",
  authenticateAdmin,
  auditLogger("bulk_update_students", "students"),
  adminController.bulkUpdateStudents
);

/**
 * @route   GET /api/admin/colleges/:collegeId/students
 * @desc    Get all students in a college
 * @access  Private (Admin)
 */
router.get(
  "/colleges/:collegeId/students",
  authenticateAdmin,
  adminController.getStudentsByCollege
);

/**
 * @route   GET /api/admin/colleges/:collegeId/students/statistics
 * @desc    Get student statistics for a college
 * @access  Private (Admin)
 */
router.get(
  "/colleges/:collegeId/students/statistics",
  authenticateAdmin,
  adminController.getStudentStatisticsByCollege
);

/**
 * @route   GET /api/admin/colleges/:collegeId/departments/:departmentId/students
 * @desc    Get all students in a department
 * @access  Private (Admin)
 */
router.get(
  "/colleges/:collegeId/departments/:departmentId/students",
  authenticateAdmin,
  adminController.getStudentsByDepartment
);

/**
 * @route   GET /api/admin/sessions
 * @desc    Get all sessions
 * @access  Private (Admin)
 */
router.get("/sessions", authenticateAdmin, adminController.getSessions);

/**
 * @route   GET /api/admin/sessions/:id
 * @desc    Get single session by ID with statistics
 * @access  Private (Admin)
 */
router.get("/sessions/:id", authenticateAdmin, adminController.getSessionById);

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

/**
 * @route   GET /api/admin/admins
 * @desc    Get all admins with pagination and filters
 * @access  Private (Super Admin)
 */
router.get(
  "/admins",
  authenticateAdmin,
  requireSuperAdmin,
  adminController.getAllAdmins
);

/**
 * @route   GET /api/admin/admins/:id
 * @desc    Get single admin by ID
 * @access  Private (Super Admin)
 */
router.get(
  "/admins/:id",
  authenticateAdmin,
  requireSuperAdmin,
  adminController.getAdminById
);

/**
 * @route   PATCH /api/admin/admins/:id
 * @desc    Update admin details
 * @access  Private (Super Admin)
 */
router.patch(
  "/admins/:id",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("full_name")
      .optional()
      .notEmpty()
      .withMessage("Full name cannot be empty"),
    body("role")
      .optional()
      .isIn(["admin", "super_admin"])
      .withMessage("Invalid role"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_admin", "admins"),
  adminController.updateAdmin
);

/**
 * @route   DELETE /api/admin/admins/:id
 * @desc    Delete or deactivate admin
 * @access  Private (Super Admin)
 */
router.delete(
  "/admins/:id",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("delete_admin", "admins"),
  adminController.deleteAdmin
);

/**
 * @route   GET /api/admin/admin-stats
 * @desc    Get admin statistics
 * @access  Private (Super Admin)
 */
router.get(
  "/admin-stats",
  authenticateAdmin,
  requireSuperAdmin,
  adminController.getAdminStats
);

module.exports = router;
