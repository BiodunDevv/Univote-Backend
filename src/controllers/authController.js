const bcrypt = require("bcryptjs");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const {
  generateStudentToken,
  generateAdminToken,
  generateFirstLoginToken,
  verifyToken,
} = require("../utils/jwt");
const emailService = require("../services/emailService");

class AuthController {
  /**
   * Student login
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      const { matric_no, password, device_id } = req.body;

      // Find student
      const student = await Student.findOne({
        matric_no: matric_no.toUpperCase(),
      });

      if (!student) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        password,
        student.password_hash
      );

      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check if first login
      if (student.first_login) {
        const firstLoginToken = generateFirstLoginToken(student);
        return res.status(403).json({
          error: "Password change required",
          message: "You must change your password on first login",
          code: "FIRST_LOGIN",
          token: firstLoginToken,
        });
      }

      // Check for device change
      const deviceInfo = device_id || req.headers["user-agent"];
      const isNewDevice =
        student.last_login_device && student.last_login_device !== deviceInfo;

      // Generate new token
      const token = generateStudentToken(student);

      // Update student session info
      student.is_logged_in = true;
      student.active_token = token;
      student.last_login_device = deviceInfo;
      student.last_login_at = new Date();
      await student.save();

      // Send new device alert if device changed
      if (isNewDevice) {
        emailService.sendNewDeviceAlert(student, deviceInfo).catch((err) => {
          console.error("Failed to send device alert:", err);
        });
      }

      res.json({
        message: "Login successful",
        token,
        student: {
          id: student._id,
          matric_no: student.matric_no,
          full_name: student.full_name,
          email: student.email,
          department: student.department,
          college: student.college,
          level: student.level,
        },
        new_device: isNewDevice,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  }

  /**
   * Admin login
   * POST /api/auth/admin-login
   */
  async adminLogin(req, res) {
    try {
      const { email, password } = req.body;

      // Find admin
      const admin = await Admin.findOne({ email: email.toLowerCase() });

      if (!admin || !admin.is_active) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        password,
        admin.password_hash
      );

      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Generate token
      const token = generateAdminToken(admin);

      // Update last login
      admin.last_login_at = new Date();
      await admin.save();

      res.json({
        message: "Admin login successful",
        token,
        admin: {
          id: admin._id,
          email: admin.email,
          full_name: admin.full_name,
          role: admin.role,
        },
      });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  }

  /**
   * Change password (for first login or regular change)
   * PATCH /api/auth/change-password
   */
  async changePassword(req, res) {
    try {
      const { new_password, old_password } = req.body;

      let student;

      // Check if this is first login (using first_login token) or regular change (using JWT)
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No token provided" });
      }

      const token = authHeader.substring(7);
      const decoded = verifyToken(token);

      student = await Student.findById(decoded.id);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // If not first login, verify old password
      if (!student.first_login) {
        if (!old_password) {
          return res.status(400).json({ error: "Old password required" });
        }

        const isOldPasswordValid = await bcrypt.compare(
          old_password,
          student.password_hash
        );
        if (!isOldPasswordValid) {
          return res.status(401).json({ error: "Invalid old password" });
        }
      }

      // Hash new password
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10)
      );
      const hashedPassword = await bcrypt.hash(new_password, salt);

      // Check if this is first login to send welcome email after password change
      const isFirstLogin = student.first_login;

      // Update password and first_login flag
      student.password_hash = hashedPassword;
      student.first_login = false;
      await student.save();

      // Generate new regular token
      const newToken = generateStudentToken(student);
      student.active_token = newToken;
      student.is_logged_in = true;
      await student.save();

      // Send welcome email after first password change
      if (isFirstLogin) {
        emailService.sendWelcomeEmail(student).catch((err) => {
          console.error("Failed to send welcome email:", err);
        });
      }

      res.json({
        message: "Password changed successfully",
        token: newToken,
      });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  }

  /**
   * Logout
   * POST /api/auth/logout
   */
  async logout(req, res) {
    try {
      const student = await Student.findById(req.studentId);

      if (student) {
        student.is_logged_in = false;
        student.active_token = null;
        await student.save();
      }

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  async getProfile(req, res) {
    try {
      const student = await Student.findById(req.studentId).select(
        "-password_hash -active_token"
      );

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      res.json({ student });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: "Failed to get profile" });
    }
  }

  /**
   * Update password (for logged-in students)
   * PATCH /api/auth/update-password
   */
  async updatePassword(req, res) {
    try {
      const { old_password, new_password } = req.body;

      // Validate input
      if (!old_password || !new_password) {
        return res.status(400).json({
          error: "Both old password and new password are required",
        });
      }

      if (new_password.length < 6) {
        return res.status(400).json({
          error: "New password must be at least 6 characters long",
        });
      }

      // Check if request is from admin or student
      const isAdmin = req.adminId !== undefined;
      let user;

      if (isAdmin) {
        user = await Admin.findById(req.adminId);
        if (!user) {
          return res.status(404).json({ error: "Admin not found" });
        }
      } else {
        user = await Student.findById(req.studentId);
        if (!user) {
          return res.status(404).json({ error: "Student not found" });
        }
      }

      // Verify old password
      const isOldPasswordValid = await bcrypt.compare(
        old_password,
        user.password_hash
      );

      if (!isOldPasswordValid) {
        return res.status(401).json({
          error: "Current password is incorrect",
        });
      }

      // Check if new password is same as old password
      const isSamePassword = await bcrypt.compare(
        new_password,
        user.password_hash
      );

      if (isSamePassword) {
        return res.status(400).json({
          error: "New password cannot be the same as current password",
        });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10)
      );
      const hashedPassword = await bcrypt.hash(new_password, salt);

      // Update password (keep the same token to avoid logging out the user)
      user.password_hash = hashedPassword;
      await user.save();

      res.json({
        message: "Password updated successfully",
        // Don't return a new token - user stays logged in with their current session
      });
    } catch (error) {
      console.error("Update password error:", error);
      res.status(500).json({ error: "Failed to update password" });
    }
  }

  /**
   * Request admin password reset (forgot password)
   * POST /api/auth/admin-forgot-password
   */
  async adminForgotPassword(req, res) {
    try {
      const { email } = req.body;

      // Find admin
      const admin = await Admin.findOne({ email: email.toLowerCase() });

      // Always return success to prevent email enumeration
      if (!admin || !admin.is_active) {
        return res.json({
          message:
            "If an admin account exists with this email, a reset code has been sent.",
        });
      }

      // Generate 6-digit code
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Hash the code before storing
      const salt = await bcrypt.genSalt(10);
      const hashedCode = await bcrypt.hash(resetCode, salt);

      // Save reset code with 1 hour expiry
      admin.reset_password_code = hashedCode;
      admin.reset_password_expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await admin.save();

      // Send email with reset code
      await emailService.sendAdminPasswordReset(admin, resetCode);

      res.json({
        message:
          "If an admin account exists with this email, a reset code has been sent.",
      });
    } catch (error) {
      console.error("Admin forgot password error:", error);
      res.status(500).json({ error: "Failed to process request" });
    }
  }

  /**
   * Reset admin password using code
   * POST /api/auth/admin-reset-password
   */
  async adminResetPassword(req, res) {
    try {
      const { email, reset_code, new_password } = req.body;

      // Validate input
      if (!email || !reset_code || !new_password) {
        return res.status(400).json({
          error: "Email, reset code, and new password are required",
        });
      }

      if (new_password.length < 8) {
        return res.status(400).json({
          error: "New password must be at least 8 characters long",
        });
      }

      // Find admin
      const admin = await Admin.findOne({ email: email.toLowerCase() });

      if (!admin || !admin.is_active) {
        return res.status(400).json({ error: "Invalid reset code or email" });
      }

      // Check if reset code exists and hasn't expired
      if (!admin.reset_password_code || !admin.reset_password_expires) {
        return res.status(400).json({ error: "Invalid reset code or email" });
      }

      if (new Date() > admin.reset_password_expires) {
        return res.status(400).json({
          error: "Reset code has expired. Please request a new one.",
        });
      }

      // Verify reset code
      const isCodeValid = await bcrypt.compare(
        reset_code,
        admin.reset_password_code
      );

      if (!isCodeValid) {
        return res.status(400).json({ error: "Invalid reset code or email" });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10)
      );
      const hashedPassword = await bcrypt.hash(new_password, salt);

      // Update password and clear reset fields
      admin.password_hash = hashedPassword;
      admin.reset_password_code = null;
      admin.reset_password_expires = null;
      await admin.save();

      res.json({
        message:
          "Password reset successfully. You can now login with your new password.",
      });
    } catch (error) {
      console.error("Admin reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  }
}

module.exports = new AuthController();
