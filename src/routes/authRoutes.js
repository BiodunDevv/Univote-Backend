const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const {
  authenticateStudent,
  authenticateForPasswordChange,
  authenticateStudentOrAdmin,
} = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validator");
const auditLogger = require("../middleware/auditLogger");

/**
 * @route   POST /api/auth/login
 * @desc    Student login
 * @access  Public
 */
router.post(
  "/login",
  authLimiter,
  [
    body("matric_no").notEmpty().withMessage("Matric number is required"),
    body("password").notEmpty().withMessage("Password is required"),
    validate,
  ],
  auditLogger("login", "auth"),
  authController.login
);

/**
 * @route   POST /api/auth/admin-login
 * @desc    Admin login
 * @access  Public
 */
router.post(
  "/admin-login",
  authLimiter,
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
    validate,
  ],
  auditLogger("admin_login", "auth"),
  authController.adminLogin
);

/**
 * @route   PATCH /api/auth/change-password
 * @desc    Change password (first login or regular)
 * @access  Private
 */
router.patch(
  "/change-password",
  authenticateForPasswordChange,
  [
    body("new_password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long"),
    validate,
  ],
  auditLogger("change_password", "auth"),
  authController.changePassword
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout student
 * @access  Private
 */
router.post(
  "/logout",
  authenticateStudent,
  auditLogger("logout", "auth"),
  authController.logout
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get("/me", authenticateStudent, authController.getProfile);

/**
 * @route   PATCH /api/auth/update-password
 * @desc    Update password for logged-in students or admins
 * @access  Private (Student or Admin)
 */
router.patch(
  "/update-password",
  authenticateStudentOrAdmin,
  authLimiter,
  [
    body("old_password").notEmpty().withMessage("Current password is required"),
    body("new_password")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters long"),
    validate,
  ],
  auditLogger("update_password", "auth"),
  authController.updatePassword
);

/**
 * @route   POST /api/auth/admin-forgot-password
 * @desc    Request admin password reset code
 * @access  Public
 */
router.post(
  "/admin-forgot-password",
  authLimiter,
  [body("email").isEmail().withMessage("Valid email is required"), validate],
  auditLogger("admin_forgot_password", "auth"),
  authController.adminForgotPassword
);

/**
 * @route   POST /api/auth/admin-reset-password
 * @desc    Reset admin password using code
 * @access  Public
 */
router.post(
  "/admin-reset-password",
  authLimiter,
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("reset_code")
      .isLength({ min: 6, max: 6 })
      .withMessage("Reset code must be 6 digits"),
    body("new_password")
      .isLength({ min: 8 })
      .withMessage("New password must be at least 8 characters long"),
    validate,
  ],
  auditLogger("admin_reset_password", "auth"),
  authController.adminResetPassword
);

module.exports = router;
