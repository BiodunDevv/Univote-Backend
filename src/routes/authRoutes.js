const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const {
  authenticateAdmin,
  authenticateStudent,
  authenticateForPasswordChange,
  authenticateStudentOrAdmin,
} = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validator");
const auditLogger = require("../middleware/auditLogger");

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Student login
 *     description: Authenticate a tenant participant with the tenant-configured primary identifier and password. Returns JWT token. Handles first-login password change flow and new-device detection.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier:
 *                 type: string
 *                 example: BU22CSC1005
 *               password:
 *                 type: string
 *                 example: "1234"
 *               device_id:
 *                 type: string
 *                 description: Device identifier for session tracking
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 student:
 *                   $ref: '#/components/schemas/Student'
 *                 new_device:
 *                   type: boolean
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: First login — password change required (code FIRST_LOGIN)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 code:
 *                   type: string
 *                   example: FIRST_LOGIN
 *                 token:
 *                   type: string
 *                   description: Temporary token for password change
 */
router.post(
  "/login",
  authLimiter,
  [
    body("identifier").notEmpty().withMessage("Identifier is required"),
    body("password").notEmpty().withMessage("Password is required"),
    validate,
  ],
  auditLogger("login", "auth"),
  authController.login,
);

/**
 * @swagger
 * /auth/admin-login:
 *   post:
 *     summary: Admin login
 *     description: Authenticate an admin with email and password. Tenant admins can sign in from the root host; if the account belongs to exactly one tenant, Univote resolves the tenant automatically. If it belongs to multiple tenants, the client should prompt the admin to choose a tenant slug and retry.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@univote.com
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Admin login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 admin:
 *                   $ref: '#/components/schemas/Admin'
 *       401:
 *         description: Invalid credentials
 *       409:
 *         description: Multiple tenant memberships require explicit tenant selection
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
  authController.adminLogin,
);

/**
 * @swagger
 * /auth/switch-tenant:
 *   post:
 *     summary: Switch tenant workspace for a logged-in tenant admin
 *     description: Issues a fresh tenant-scoped admin token for another tenant the current admin belongs to.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenant_slug]
 *             properties:
 *               tenant_slug:
 *                 type: string
 *                 example: bowen-demo
 *     responses:
 *       200:
 *         description: Tenant switched successfully
 *       403:
 *         description: Admin does not belong to the requested tenant
 */
router.post(
  "/switch-tenant",
  authenticateAdmin,
  [body("tenant_slug").notEmpty().withMessage("tenant_slug is required"), validate],
  auditLogger("switch_tenant", "auth"),
  authController.switchTenant,
);

/**
 * @swagger
 * /auth/change-password:
 *   patch:
 *     summary: Change password
 *     description: Change student password. Used for first-login forced password change (with first_login token) or regular password update (with session token).
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [new_password]
 *             properties:
 *               new_password:
 *                 type: string
 *                 minLength: 6
 *               old_password:
 *                 type: string
 *                 description: Required if not first login
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                   description: New session token
 *                 student:
 *                   $ref: '#/components/schemas/Student'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid old password or no token
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
  authController.changePassword,
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Student logout
 *     description: Invalidate the current session. Blacklists the JWT token and clears Redis session data.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Not authenticated
 */
router.post(
  "/logout",
  authenticateStudent,
  auditLogger("logout", "auth"),
  authController.logout,
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current student profile
 *     description: Returns the authenticated student's full profile information including voting history flags.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Student profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 student:
 *                   $ref: '#/components/schemas/Student'
 *                 profile:
 *                   $ref: '#/components/schemas/Student'
 *       404:
 *         description: Student not found
 */
router.get("/me", authenticateStudent, authController.getProfile);

/**
 * @swagger
 * /auth/me:
 *   patch:
 *     summary: Update current student profile
 *     description: Update the authenticated student's editable profile fields.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
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
 *               photo_url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Student profile updated successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already exists
 */
router.patch(
  "/me",
  authenticateStudent,
  [
    body("full_name")
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Full name cannot be empty"),
    body("email").optional().isEmail().withMessage("Valid email is required"),
    body("photo_url")
      .optional({ nullable: true })
      .isString()
      .withMessage("Photo URL must be a string"),
    validate,
  ],
  auditLogger("update_profile", "auth"),
  authController.updateProfile,
);

/**
 * @swagger
 * /auth/update-password:
 *   patch:
 *     summary: Update password (student or admin)
 *     description: Update password for a currently logged-in student or admin. Requires current password verification.
 *     tags: [Auth]
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
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: New password same as old or too short
 *       401:
 *         description: Current password incorrect
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
  authController.updatePassword,
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request student password reset
 *     description: Sends a 6-digit reset code to the student's email. Accepts either email or matric number and always returns success to prevent account enumeration.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier]
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Student email or matric number
 *     responses:
 *       200:
 *         description: Reset code sent (if account exists)
 */
router.post(
  "/forgot-password",
  authLimiter,
  [
    body("identifier")
      .notEmpty()
      .withMessage("Email or matric number is required"),
    validate,
  ],
  auditLogger("student_forgot_password", "auth"),
  authController.forgotPassword,
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset student password with code
 *     description: Reset a student's password using the 6-digit code received by email. Accepts email or matric number as the identifier.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, reset_code, new_password]
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Student email or matric number
 *               reset_code:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired reset code
 */
router.post(
  "/reset-password",
  authLimiter,
  [
    body("identifier")
      .notEmpty()
      .withMessage("Email or matric number is required"),
    body("reset_code")
      .isLength({ min: 6, max: 6 })
      .withMessage("Reset code must be 6 digits"),
    body("new_password")
      .isLength({ min: 8 })
      .withMessage("New password must be at least 8 characters long"),
    validate,
  ],
  auditLogger("student_reset_password", "auth"),
  authController.resetPassword,
);

/**
 * @swagger
 * /auth/admin-forgot-password:
 *   post:
 *     summary: Request admin password reset
 *     description: Sends a 6-digit reset code to the admin's email. Always returns success to prevent email enumeration.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset code sent (if account exists)
 */
router.post(
  "/admin-forgot-password",
  authLimiter,
  [body("email").isEmail().withMessage("Valid email is required"), validate],
  auditLogger("admin_forgot_password", "auth"),
  authController.adminForgotPassword,
);

/**
 * @swagger
 * /auth/admin-reset-password:
 *   post:
 *     summary: Reset admin password with code
 *     description: Reset an admin's password using the 6-digit code received via email. Code expires after 1 hour.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, reset_code, new_password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               reset_code:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *                 example: "123456"
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired reset code
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
  authController.adminResetPassword,
);

module.exports = router;
