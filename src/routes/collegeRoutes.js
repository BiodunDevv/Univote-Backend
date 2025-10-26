const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const collegeController = require("../controllers/collegeController");
const { authenticateAdmin, requireSuperAdmin } = require("../middleware/auth");
const validate = require("../middleware/validator");
const auditLogger = require("../middleware/auditLogger");

/**
 * @route   GET /api/admin/colleges/statistics
 * @desc    Get college statistics
 * @access  Private (Admin)
 */
router.get(
  "/colleges/statistics",
  authenticateAdmin,
  collegeController.getCollegeStatistics
);

/**
 * @route   GET /api/admin/departments/search
 * @desc    Search departments across all colleges
 * @access  Private (Admin)
 */
router.get(
  "/departments/search",
  authenticateAdmin,
  collegeController.searchDepartments
);

/**
 * @route   POST /api/admin/colleges
 * @desc    Create a new college
 * @access  Private (Super Admin)
 */
router.post(
  "/colleges",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("name").notEmpty().withMessage("College name is required"),
    body("code")
      .notEmpty()
      .withMessage("College code is required")
      .isLength({ min: 3, max: 10 })
      .withMessage("College code must be 3-10 characters"),
    body("description").optional().isString(),
    body("dean_name").optional().isString(),
    body("dean_email").optional().isEmail().withMessage("Invalid dean email"),
    body("departments").optional().isArray(),
    body("departments.*.name")
      .optional()
      .notEmpty()
      .withMessage("Department name is required"),
    body("departments.*.code")
      .optional()
      .notEmpty()
      .withMessage("Department code is required")
      .isLength({ min: 2, max: 5 })
      .withMessage("Department code must be 2-5 characters"),
    body("departments.*.available_levels")
      .optional()
      .isArray()
      .withMessage("Available levels must be an array"),
    validate,
  ],
  auditLogger("create_college", "colleges"),
  collegeController.createCollege
);

/**
 * @route   GET /api/admin/colleges
 * @desc    Get all colleges
 * @access  Private (Admin)
 */
router.get("/colleges", authenticateAdmin, collegeController.getAllColleges);

/**
 * @route   GET /api/admin/colleges/:id
 * @desc    Get single college by ID
 * @access  Private (Admin)
 */
router.get(
  "/colleges/:id",
  authenticateAdmin,
  collegeController.getCollegeById
);

/**
 * @route   PATCH /api/admin/colleges/:id
 * @desc    Update college
 * @access  Private (Super Admin)
 */
router.patch(
  "/colleges/:id",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("name")
      .optional()
      .notEmpty()
      .withMessage("College name cannot be empty"),
    body("code")
      .optional()
      .isLength({ min: 3, max: 10 })
      .withMessage("College code must be 3-10 characters"),
    body("dean_email").optional().isEmail().withMessage("Invalid dean email"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_college", "colleges"),
  collegeController.updateCollege
);

/**
 * @route   DELETE /api/admin/colleges/:id
 * @desc    Delete college
 * @access  Private (Super Admin)
 */
router.delete(
  "/colleges/:id",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("delete_college", "colleges"),
  collegeController.deleteCollege
);

/**
 * @route   POST /api/admin/colleges/:id/departments
 * @desc    Add department to college
 * @access  Private (Super Admin)
 */
router.post(
  "/colleges/:id/departments",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("name").notEmpty().withMessage("Department name is required"),
    body("code")
      .notEmpty()
      .withMessage("Department code is required")
      .isLength({ min: 2, max: 5 })
      .withMessage("Department code must be 2-5 characters"),
    body("description").optional().isString(),
    body("hod_name").optional().isString(),
    body("hod_email").optional().isEmail().withMessage("Invalid HOD email"),
    body("available_levels")
      .optional()
      .isArray()
      .withMessage("Available levels must be an array"),
    validate,
  ],
  auditLogger("add_department", "departments"),
  collegeController.addDepartment
);

/**
 * @route   GET /api/admin/colleges/:id/departments
 * @desc    Get all departments in a college
 * @access  Private (Admin)
 */
router.get(
  "/colleges/:id/departments",
  authenticateAdmin,
  collegeController.getDepartments
);

/**
 * @route   GET /api/admin/colleges/:collegeId/departments/:deptId
 * @desc    Get single department
 * @access  Private (Admin)
 */
router.get(
  "/colleges/:collegeId/departments/:deptId",
  authenticateAdmin,
  collegeController.getDepartmentById
);

/**
 * @route   PATCH /api/admin/colleges/:collegeId/departments/:deptId
 * @desc    Update department
 * @access  Private (Super Admin)
 */
router.patch(
  "/colleges/:collegeId/departments/:deptId",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("name")
      .optional()
      .notEmpty()
      .withMessage("Department name cannot be empty"),
    body("code")
      .optional()
      .isLength({ min: 2, max: 5 })
      .withMessage("Department code must be 2-5 characters"),
    body("hod_email").optional().isEmail().withMessage("Invalid HOD email"),
    body("available_levels")
      .optional()
      .isArray()
      .withMessage("Available levels must be an array"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_department", "departments"),
  collegeController.updateDepartment
);

/**
 * @route   DELETE /api/admin/colleges/:collegeId/departments/:deptId
 * @desc    Delete department
 * @access  Private (Super Admin)
 */
router.delete(
  "/colleges/:collegeId/departments/:deptId",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("delete_department", "departments"),
  collegeController.deleteDepartment
);

module.exports = router;
