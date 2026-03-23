const bcrypt = require("bcryptjs");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const Tenant = require("../models/Tenant");
const {
  getActiveAdminMembership,
  getActiveAdminMemberships,
} = require("../services/tenantAccessService");
const {
  generateStudentToken,
  generateAdminToken,
  generateFirstLoginToken,
  verifyToken,
} = require("../utils/jwt");
const emailService = require("../services/emailService");
const cacheService = require("../services/cacheService");
const {
  buildParticipantLookupFilter,
  getTenantEligibilityPolicy,
  getParticipantLabelSet,
  getTenantIdentityMetadata,
  getTenantParticipantFieldMetadata,
  getTenantSettings,
} = require("../utils/tenantSettings");

function serializeTenant(tenant) {
  if (!tenant) return null;

  const settings = getTenantSettings(tenant);

  return {
    id: tenant._id || tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    primary_domain: tenant.primary_domain || null,
    status: tenant.status,
    plan_code: tenant.plan_code,
    branding: tenant.branding || {},
    labels: settings.labels,
    identity: getTenantIdentityMetadata(tenant),
    auth_policy: settings.auth,
    participant_fields: getTenantParticipantFieldMetadata(tenant),
    eligibility_policy: getTenantEligibilityPolicy(tenant),
    onboarding: {
      contact_name: tenant.onboarding?.contact_name || null,
      contact_email: tenant.onboarding?.contact_email || null,
      student_count_estimate: tenant.onboarding?.student_count_estimate ?? null,
      admin_count_estimate: tenant.onboarding?.admin_count_estimate ?? null,
      application_submitted_at:
        tenant.onboarding?.application_submitted_at || null,
      activated_at: tenant.onboarding?.activated_at || null,
      approved_at: tenant.onboarding?.approved_at || null,
      rejected_at: tenant.onboarding?.rejected_at || null,
      rejection_reason: tenant.onboarding?.rejection_reason || null,
      status_timeline: Array.isArray(tenant.onboarding?.status_timeline)
        ? tenant.onboarding.status_timeline
        : [],
    },
  };
}

function serializeStudent(student) {
  const displayIdentifier =
    student.member_id ||
    student.employee_id ||
    student.username ||
    student.matric_no ||
    student.email;

  return {
    id: student._id,
    tenant_id: student.tenant_id || null,
    matric_no: student.matric_no,
    member_id: student.member_id || null,
    employee_id: student.employee_id || null,
    username: student.username || null,
    display_identifier: displayIdentifier || null,
    full_name: student.full_name,
    email: student.email,
    department: student.department,
    department_code: student.department_code,
    college: student.college,
    level: student.level,
    photo_url: student.photo_url,
    last_profile_photo_updated_at: student.last_profile_photo_updated_at || null,
    next_profile_photo_update_at: student.last_profile_photo_updated_at
      ? new Date(
          new Date(student.last_profile_photo_updated_at).setMonth(
            new Date(student.last_profile_photo_updated_at).getMonth() + 6,
          ),
        )
      : null,
    has_facial_data: !!student.face_token,
    photo_review_status: student.photo_review_status || "pending",
    created_at: student.createdAt || student.created_at,
    last_login_at: student.last_login_at,
  };
}

function calculateNextPhotoUpdateAt(value) {
  if (!value) return null;
  const next = new Date(value);
  next.setMonth(next.getMonth() + 6);
  return next;
}

function serializeAdmin(admin, membership = null) {
  return {
    id: admin._id,
    email: admin.email,
    full_name: admin.full_name,
    role: admin.role,
    tenant_role: membership?.role || null,
    permissions: membership?.permissions || [],
  };
}

function isLegacySingleTenantModeEnabled() {
  return process.env.ALLOW_LEGACY_SINGLE_TENANT !== "false";
}

function normalizeStudentEmailInput(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildScopedStudentLookup(req, identifierKey, identifierValue) {
  const lookup = buildParticipantLookupFilter(identifierKey, identifierValue);
  if (!lookup) {
    return null;
  }

  return {
    ...(req.tenantId ? { tenant_id: req.tenantId } : {}),
    ...lookup,
  };
}

function normalizeTenantLookupSlug(slug) {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function isTenantSuspended(tenant) {
  if (!tenant) return false;
  return tenant.status === "suspended";
}

async function resolveTenantChoices(memberships = []) {
  if (!memberships.length) return [];

  const tenantIds = memberships.map((membership) => membership.tenant_id);
  const tenants = await Tenant.find({
    _id: { $in: tenantIds },
    is_active: true,
    status: { $ne: "suspended" },
  })
    .select("_id name slug status plan_code primary_domain")
    .lean();

  const tenantMap = new Map(
    tenants.map((tenant) => [String(tenant._id), tenant]),
  );

  return memberships
    .map((membership) => {
      const tenant = tenantMap.get(String(membership.tenant_id));
      if (!tenant) return null;

      return {
        tenant_id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        role: membership.role,
        status: tenant.status,
        plan_code: tenant.plan_code,
        primary_domain: tenant.primary_domain || null,
      };
    })
    .filter(Boolean);
}

async function findAdminInTenantScope(email, tenantId) {
  const admin = await Admin.findOne({ email: email.toLowerCase() });
  if (!admin) return null;

  if (!tenantId || admin.role === "super_admin") {
    return { admin, membership: null };
  }

  const membership = await getActiveAdminMembership(admin._id, tenantId);
  if (!membership) {
    return null;
  }

  return { admin, membership };
}

class AuthController {
  /**
   * Student login
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      const { password, device_id } = req.body;
      const email = normalizeStudentEmailInput(req.body.email);

      if (req.tenantSlug && !req.tenant) {
        return res.status(404).json({
          error: "Tenant not found",
          code: "TENANT_NOT_FOUND",
        });
      }

      if (isTenantSuspended(req.tenant)) {
        return res.status(403).json({
          error: "Tenant is suspended",
          code: "TENANT_SUSPENDED",
        });
      }

      const lookupFilter = buildScopedStudentLookup(req, "email", email);

      if (!lookupFilter) {
        return res.status(400).json({
          error: "Email address is required",
          code: "EMAIL_REQUIRED",
        });
      }

      const student = await Student.findOne(lookupFilter);

      if (!student) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!student.is_active) {
        return res.status(403).json({
          error: "Account is inactive",
          code: "ACCOUNT_INACTIVE",
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        password,
        student.password_hash,
      );

      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check for device change
      const deviceInfo = device_id || req.headers["user-agent"];
      const isNewDevice =
        student.last_login_device && student.last_login_device !== deviceInfo;

      // Invalidate old session in Redis if it exists
      if (student.active_token) {
        await cacheService.set(
          `blacklist:${student.active_token}`,
          true,
          86400, // 24 hours
        );
      }

      // Generate new token
      const token = generateStudentToken(student);

      // Update student session info
      student.is_logged_in = true;
      student.active_token = token;
      student.last_login_device = deviceInfo;
      student.last_login_at = new Date();
      await student.save();

      // Store session in Redis for fast validation
      await cacheService.set(
        `session:student:${student._id}`,
        {
          token,
          studentId: student._id.toString(),
          deviceInfo,
          loginAt: new Date().toISOString(),
        },
        86400, // 24 hours TTL
      );

      // Cache student profile for faster auth
      await cacheService.set(
        `student:profile:${student._id}`,
        {
          _id: student._id,
          tenant_id: student.tenant_id || null,
          matric_no: student.matric_no,
          full_name: student.full_name,
          email: student.email,
          department: student.department,
          department_code: student.department_code,
          college: student.college,
          level: student.level,
          has_voted_sessions: student.has_voted_sessions,
          face_token: student.face_token,
          is_active: student.is_active,
          active_token: student.active_token,
        },
        900, // 15 minutes TTL
      );

      // Send new device alert if device changed
      if (isNewDevice) {
        emailService
          .sendNewDeviceAlert(student, deviceInfo, req.tenant || null)
          .catch((err) => {
            console.error("Failed to send device alert:", err);
          });
      }

      res.json({
        message: student.first_login
          ? "Login successful. Your temporary password should be changed soon."
          : "Login successful",
        token,
        student: serializeStudent(student),
        tenant: serializeTenant(req.tenant),
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

      if (req.tenantSlug && !req.tenant) {
        return res.status(404).json({
          error: "Tenant not found",
          code: "TENANT_NOT_FOUND",
        });
      }

      if (isTenantSuspended(req.tenant)) {
        return res.status(403).json({
          error: "Tenant is suspended",
          code: "TENANT_SUSPENDED",
        });
      }

      // Find admin
      const admin = await Admin.findOne({ email: email.toLowerCase() });

      if (!admin || !admin.is_active) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        password,
        admin.password_hash,
      );

      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      let membership = null;
      let tenant = req.tenant || null;
      let tenantId = req.tenantId || null;
      let organizations = [];
      if (admin.role !== "super_admin") {
        if (!tenantId) {
          const memberships = await getActiveAdminMemberships(admin._id);

          if (memberships.length === 1) {
            membership = memberships[0];
            tenantId = membership.tenant_id;
            tenant = await Tenant.findById(tenantId);
            if (!tenant) {
              return res.status(403).json({
                error: "Tenant context could not be resolved for this admin",
                code: "TENANT_NOT_FOUND",
              });
            }
            if (isTenantSuspended(tenant)) {
              return res.status(403).json({
                error: "Tenant is suspended",
                code: "TENANT_SUSPENDED",
              });
            }
            organizations = await resolveTenantChoices([membership]);
          } else if (memberships.length > 1) {
            const tenantChoices = await resolveTenantChoices(memberships);
            return res.status(409).json({
              error: "Multiple tenant memberships found for this account",
              code: "TENANT_SELECTION_REQUIRED",
              tenants: tenantChoices,
            });
          } else if (!isLegacySingleTenantModeEnabled()) {
            return res.status(400).json({
              error: "Tenant context is required for tenant admins",
              code: "TENANT_REQUIRED",
            });
          }
        } else {
          membership = await getActiveAdminMembership(admin._id, tenantId);
          if (!membership) {
            return res.status(403).json({
              error: "Tenant admin membership not found",
              code: "TENANT_MEMBERSHIP_REQUIRED",
            });
          }

          if (isTenantSuspended(tenant)) {
            return res.status(403).json({
              error: "Tenant is suspended",
              code: "TENANT_SUSPENDED",
            });
          }

          organizations = await resolveTenantChoices([membership]);
        }
      }

      // Generate token
      const token = generateAdminToken(admin, {
        tenant_id: tenantId || null,
        tenant_role: membership?.role || null,
        permissions: membership?.permissions || [],
      });

      // Update last login
      admin.last_login_at = new Date();
      await admin.save();

      res.json({
        message: "Admin login successful",
        token,
        admin: serializeAdmin(admin, membership),
        tenant: serializeTenant(tenant),
        organizations,
        membership: membership
          ? {
              id: membership._id,
              role: membership.role,
              permissions: membership.permissions || [],
            }
          : null,
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
          student.password_hash,
        );
        if (!isOldPasswordValid) {
          return res.status(401).json({ error: "Invalid old password" });
        }
      }

      // Hash new password
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10),
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
        emailService
          .sendWelcomeEmail(student, req.tenant || null)
          .catch((err) => {
            console.error("Failed to send welcome email:", err);
          });
      }

      res.json({
        message: "Password changed successfully",
        token: newToken,
        student: serializeStudent(student),
        tenant: serializeTenant(req.tenant),
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
        // Blacklist current token in Redis
        if (req.token) {
          await cacheService.set(
            `blacklist:${req.token}`,
            true,
            86400, // 24 hours
          );
        }

        // Clear session and profile from Redis
        await cacheService.del(`session:student:${req.studentId}`);
        await cacheService.del(`student:profile:${req.studentId}`);

        // Update database
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
        "-password_hash -active_token -face_token -embedding_vector",
      );

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // Add computed field for facial data status
      const studentProfile = student.toObject();
      studentProfile.has_facial_data = !!student.face_token;

      res.json({
        student: studentProfile,
        profile: {
          id: student._id,
          tenant_id: student.tenant_id || null,
          matric_no: student.matric_no,
          member_id: student.member_id || null,
          employee_id: student.employee_id || null,
          username: student.username || null,
          full_name: student.full_name,
          email: student.email,
          department: student.department,
          department_code: student.department_code,
          college: student.college,
          level: student.level,
          photo_url: student.photo_url,
          last_profile_photo_updated_at:
            student.last_profile_photo_updated_at || null,
          next_profile_photo_update_at: calculateNextPhotoUpdateAt(
            student.last_profile_photo_updated_at,
          ),
          has_facial_data: !!student.face_token,
          photo_review_status: student.photo_review_status || "pending",
          is_logged_in: student.is_logged_in,
          first_login: student.first_login,
          last_login_at: student.last_login_at,
          created_at: student.created_at,
          has_voted_sessions: student.has_voted_sessions,
        },
        tenant: serializeTenant(req.tenant),
      });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: "Failed to get profile" });
    }
  }

  /**
   * Update current student profile
   * PATCH /api/auth/me
   */
  async updateProfile(req, res) {
    try {
      const { full_name, email, photo_url } = req.body;

      if (
        full_name === undefined &&
        email === undefined &&
        photo_url === undefined
      ) {
        return res.status(400).json({
          error: "At least one profile field is required",
        });
      }

      const student = await Student.findById(req.studentId);

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      if (!student.is_active) {
        return res.status(403).json({
          error: "Account is inactive",
          code: "ACCOUNT_INACTIVE",
        });
      }

      if (full_name !== undefined) {
        student.full_name = full_name.trim();
      }

      if (email !== undefined) {
        const normalizedEmail = email.trim().toLowerCase();
        const existingStudent = await Student.findOne({
          email: normalizedEmail,
          ...(student.tenant_id ? { tenant_id: student.tenant_id } : {}),
          _id: { $ne: student._id },
        }).select("_id");

        if (existingStudent) {
          return res.status(409).json({
            error: "Email is already in use by another student",
          });
        }

        student.email = normalizedEmail;
      }

      if (photo_url !== undefined) {
        const normalizedPhotoUrl = photo_url ? photo_url.trim() : null;
        const isChangingPhoto = normalizedPhotoUrl !== student.photo_url;

        if (isChangingPhoto && normalizedPhotoUrl) {
          const nextAllowedUpdateAt = calculateNextPhotoUpdateAt(
            student.last_profile_photo_updated_at,
          );

          if (nextAllowedUpdateAt && nextAllowedUpdateAt.getTime() > Date.now()) {
            return res.status(409).json({
              error:
                "Your profile photo was updated recently. Submit a support request if you need an early reset.",
              code: "PROFILE_PHOTO_COOLDOWN",
              next_profile_photo_update_at: nextAllowedUpdateAt,
              last_profile_photo_updated_at:
                student.last_profile_photo_updated_at || null,
            });
          }
        }

        if (isChangingPhoto) {
          student.photo_url = normalizedPhotoUrl;
          student.last_profile_photo_updated_at = normalizedPhotoUrl
            ? new Date()
            : null;
          student.photo_review_status = normalizedPhotoUrl ? "pending" : "approved";
          student.photo_reviewed_at = null;
          student.photo_reviewed_by_admin_id = null;
        }
      }

      await student.save();
      await cacheService.del(`student:profile:${student._id}`);
      await cacheService.del(`dashboard:student:${student._id}`);

      res.json({
        message: "Profile updated successfully",
        profile: {
          id: student._id,
          tenant_id: student.tenant_id || null,
          matric_no: student.matric_no,
          member_id: student.member_id || null,
          employee_id: student.employee_id || null,
          username: student.username || null,
          full_name: student.full_name,
          email: student.email,
          department: student.department,
          department_code: student.department_code,
          college: student.college,
          level: student.level,
          photo_url: student.photo_url,
          last_profile_photo_updated_at:
            student.last_profile_photo_updated_at || null,
          next_profile_photo_update_at: calculateNextPhotoUpdateAt(
            student.last_profile_photo_updated_at,
          ),
          has_facial_data: !!student.face_token,
          photo_review_status: student.photo_review_status || "pending",
          is_logged_in: student.is_logged_in,
          first_login: student.first_login,
          last_login_at: student.last_login_at,
          created_at: student.createdAt,
          has_voted_sessions: student.has_voted_sessions,
        },
        tenant: serializeTenant(req.tenant),
      });
    } catch (error) {
      console.error("Update student profile error:", error);
      res.status(500).json({ error: "Failed to update profile" });
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
        user.password_hash,
      );

      if (!isOldPasswordValid) {
        return res.status(401).json({
          error: "Current password is incorrect",
        });
      }

      // Check if new password is same as old password
      const isSamePassword = await bcrypt.compare(
        new_password,
        user.password_hash,
      );

      if (isSamePassword) {
        return res.status(400).json({
          error: "New password cannot be the same as current password",
        });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10),
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
   * Request student password reset (forgot password)
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req, res) {
    try {
      const email = normalizeStudentEmailInput(req.body.email);

      if (req.tenantSlug && !req.tenant) {
        return res.status(404).json({
          error: "Tenant not found",
          code: "TENANT_NOT_FOUND",
        });
      }

      const participantLabels = getParticipantLabelSet(req.tenant);
      const lookupFilter = buildScopedStudentLookup(req, "email", email);

      const student = lookupFilter ? await Student.findOne(lookupFilter) : null;

      const successMessage = `If a ${participantLabels.lowerSingular} account exists for that email address, a reset code has been sent.`;

      // Always return success to avoid account enumeration.
      if (!student || !student.is_active) {
        return res.json({
          message: successMessage,
        });
      }

      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      const salt = await bcrypt.genSalt(10);
      const hashedCode = await bcrypt.hash(resetCode, salt);

      student.reset_password_code = hashedCode;
      student.reset_password_expires = new Date(Date.now() + 60 * 60 * 1000);
      await student.save();

      await emailService.sendPasswordReset(
        student,
        resetCode,
        req.tenant || null,
      );

      return res.json({
        message: successMessage,
      });
    } catch (error) {
      console.error("Student forgot password error:", error);
      return res.status(500).json({ error: "Failed to process request" });
    }
  }

  /**
   * Reset student password using code
   * POST /api/auth/reset-password
   */
  async resetPassword(req, res) {
    try {
      const email = normalizeStudentEmailInput(req.body.email);
      const { reset_code, new_password } = req.body;

      if (req.tenantSlug && !req.tenant) {
        return res.status(404).json({
          error: "Tenant not found",
          code: "TENANT_NOT_FOUND",
        });
      }

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

      const lookupFilter = buildScopedStudentLookup(req, "email", email);

      const student = lookupFilter ? await Student.findOne(lookupFilter) : null;

      if (!student || !student.is_active) {
        return res.status(400).json({
          error: "Invalid reset code or account details",
        });
      }

      if (!student.reset_password_code || !student.reset_password_expires) {
        return res.status(400).json({
          error: "Invalid reset code or account details",
        });
      }

      if (new Date() > student.reset_password_expires) {
        return res.status(400).json({
          error: "Reset code has expired. Please request a new one.",
        });
      }

      const isCodeValid = await bcrypt.compare(
        String(reset_code),
        student.reset_password_code,
      );

      if (!isCodeValid) {
        return res.status(400).json({
          error: "Invalid reset code or account details",
        });
      }

      const isSamePassword = await bcrypt.compare(
        new_password,
        student.password_hash,
      );

      if (isSamePassword) {
        return res.status(400).json({
          error: "New password cannot be the same as the current password",
        });
      }

      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10),
      );
      const hashedPassword = await bcrypt.hash(new_password, salt);

      if (student.active_token) {
        await cacheService.set(
          `blacklist:${student.active_token}`,
          true,
          86400,
        );
      }

      await Promise.all([
        cacheService.del(`session:student:${student._id}`),
        cacheService.del(`student:profile:${student._id}`),
      ]);

      student.password_hash = hashedPassword;
      student.first_login = false;
      student.is_logged_in = false;
      student.active_token = null;
      student.reset_password_code = null;
      student.reset_password_expires = null;
      await student.save();

      return res.json({
        message:
          "Password reset successfully. You can now sign in with your new password.",
      });
    } catch (error) {
      console.error("Student reset password error:", error);
      return res.status(500).json({ error: "Failed to reset password" });
    }
  }

  /**
   * Request admin password reset (forgot password)
   * POST /api/auth/admin-forgot-password
   */
  async adminForgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (req.tenantSlug && !req.tenant) {
        return res.json({
          message:
            "If an admin account exists with this email, a reset code has been sent.",
        });
      }

      const scopedAdmin = await findAdminInTenantScope(email, req.tenantId);
      const admin = scopedAdmin?.admin || null;

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
      await emailService.sendAdminPasswordReset(
        admin,
        resetCode,
        req.tenant || null,
      );

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

      if (req.tenantSlug && !req.tenant) {
        return res.status(400).json({ error: "Invalid reset code or email" });
      }

      if (new_password.length < 8) {
        return res.status(400).json({
          error: "New password must be at least 8 characters long",
        });
      }

      const scopedAdmin = await findAdminInTenantScope(email, req.tenantId);
      const admin = scopedAdmin?.admin || null;

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
        admin.reset_password_code,
      );

      if (!isCodeValid) {
        return res.status(400).json({ error: "Invalid reset code or email" });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10),
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
