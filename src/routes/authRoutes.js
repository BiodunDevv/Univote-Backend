const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const {
  authenticateStudent,
  authenticateForPasswordChange,
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
 * @desc    Update password for logged-in students
 * @access  Private (Student)
 */
router.patch(
  "/update-password",
  authenticateStudent,
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

module.exports = router;
