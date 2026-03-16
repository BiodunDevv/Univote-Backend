const jwt = require("jsonwebtoken");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const {
  getActiveAdminMembership,
  hasPermission,
} = require("../services/tenantAccessService");
const cacheService = require("../services/cacheService");

function toId(value) {
  if (!value) return null;
  return value.toString();
}

function isTenantMismatch(requestTenantId, tokenTenantId) {
  if (!requestTenantId || !tokenTenantId) return false;
  return toId(requestTenantId) !== toId(tokenTenantId);
}

function isLegacySingleTenantModeEnabled() {
  return process.env.ALLOW_LEGACY_SINGLE_TENANT !== "false";
}

async function resolveActiveAdminFromToken(decoded) {
  if (!decoded?.id) {
    return null;
  }

  let admin = await Admin.findById(decoded.id);

  // Support tokens minted before admin records were recreated/migrated.
  if (!admin && decoded.email) {
    admin = await Admin.findOne({ email: String(decoded.email).toLowerCase() });
  }

  if (!admin || !admin.is_active) {
    return null;
  }

  return admin;
}

/**
 * Middleware to authenticate students using JWT
 */
const authenticateStudent = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if token type is student
      if (decoded.type !== "student") {
        return res.status(403).json({ error: "Invalid token type" });
      }

      if (isTenantMismatch(req.tenantId, decoded.tenant_id)) {
        return res.status(403).json({
          error: "Token does not belong to this tenant",
          code: "TENANT_MISMATCH",
        });
      }

      // Check Redis session first (fast path)
      const sessionKey = `session:student:${decoded.id}`;
      const cachedSession = await cacheService.get(sessionKey);

      if (cachedSession) {
        // Verify token matches cached session
        if (cachedSession.token !== token) {
          return res.status(401).json({
            error:
              "Session expired. You have been logged in from another device.",
            code: "SESSION_INVALIDATED",
          });
        }

        // Check if token is blacklisted
        const blacklisted = await cacheService.exists(`blacklist:${token}`);
        if (blacklisted) {
          return res.status(401).json({
            error: "Token has been invalidated",
            code: "TOKEN_BLACKLISTED",
          });
        }

        // Use cached student profile for faster auth
        const cachedProfile = await cacheService.get(
          `student:profile:${decoded.id}`,
        );
        if (cachedProfile) {
          if (!cachedProfile.is_active) {
            return res.status(403).json({
              error: "Student account is inactive",
              code: "ACCOUNT_INACTIVE",
            });
          }

          req.student = cachedProfile;
          req.studentId = decoded.id;
          req.token = token;
          return next();
        }
      }

      // Cache miss - Query database (slow path)
      const student = await Student.findOne({
        _id: decoded.id,
        ...(decoded.tenant_id ? { tenant_id: decoded.tenant_id } : {}),
      });

      if (!student) {
        return res.status(401).json({ error: "Student not found" });
      }

      if (!student.is_active) {
        return res.status(403).json({
          error: "Student account is inactive",
          code: "ACCOUNT_INACTIVE",
        });
      }

      // Check if this is the active token (single session enforcement)
      if (student.active_token && student.active_token !== token) {
        return res.status(401).json({
          error:
            "Session expired. You have been logged in from another device.",
          code: "SESSION_INVALIDATED",
        });
      }

      // Cache session and profile for future requests
      await cacheService.set(
        sessionKey,
        {
          token: student.active_token,
          studentId: student._id.toString(),
          loginAt: student.last_login_at,
        },
        86400, // 24 hours TTL
      );

      await cacheService.set(
        `student:profile:${student._id}`,
        {
          _id: student._id,
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

      // Attach student to request
      req.student = student;
      req.studentId = student._id;
      req.tenantId = req.tenantId || student.tenant_id || null;
      req.token = token;

      next();
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({ error: "Token expired", code: "TOKEN_EXPIRED" });
      }
      return res.status(401).json({ error: "Invalid token" });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

/**
 * Middleware to authenticate admins using JWT
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if token type is admin
      if (decoded.type !== "admin") {
        return res.status(403).json({ error: "Invalid token type" });
      }

      // Find admin by token id and fallback to email for stale token ids.
      const admin = await resolveActiveAdminFromToken(decoded);

      if (!admin || !admin.is_active) {
        return res.status(401).json({ error: "Admin not found or inactive" });
      }

      if (admin.role !== "super_admin") {
        const tenantId = req.tenantId || decoded.tenant_id;

        if (!tenantId) {
          if (!isLegacySingleTenantModeEnabled()) {
            return res.status(400).json({
              error: "Tenant context is required for tenant admins",
              code: "TENANT_REQUIRED",
            });
          }

          req.adminMembership = {
            role: "owner",
            permissions: ["legacy.full_access"],
            is_legacy: true,
          };
        } else {
          if (isTenantMismatch(req.tenantId, decoded.tenant_id)) {
            return res.status(403).json({
              error: "Token does not belong to this tenant",
              code: "TENANT_MISMATCH",
            });
          }

          const membership = await getActiveAdminMembership(
            admin._id,
            tenantId,
          );
          if (!membership) {
            return res.status(403).json({
              error: "Tenant admin membership not found",
              code: "TENANT_MEMBERSHIP_REQUIRED",
            });
          }

          req.adminMembership = membership;
          req.tenantId = tenantId;
        }
      }

      // Attach admin to request
      req.admin = admin;
      req.adminId = admin._id;

      next();
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token expired" });
      }
      return res.status(401).json({ error: "Invalid token" });
    }
  } catch (error) {
    console.error("Admin authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

/**
 * Middleware to check if admin has super_admin role
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.admin.role !== "super_admin") {
    return res.status(403).json({ error: "Super admin privileges required" });
  }

  next();
};

/**
 * Middleware to authenticate students for password change (accepts both student and first_login tokens)
 */
const authenticateForPasswordChange = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Accept both student and first_login token types
      if (decoded.type !== "student" && decoded.type !== "first_login") {
        return res.status(403).json({ error: "Invalid token type" });
      }

      if (isTenantMismatch(req.tenantId, decoded.tenant_id)) {
        return res.status(403).json({
          error: "Token does not belong to this tenant",
          code: "TENANT_MISMATCH",
        });
      }

      // Find student
      const student = await Student.findOne({
        _id: decoded.id,
        ...(decoded.tenant_id ? { tenant_id: decoded.tenant_id } : {}),
      });

      if (!student) {
        return res.status(401).json({ error: "Student not found" });
      }

      if (!student.is_active) {
        return res.status(403).json({
          error: "Student account is inactive",
          code: "ACCOUNT_INACTIVE",
        });
      }

      // Attach student to request
      req.student = student;
      req.studentId = student._id;
      req.tenantId = req.tenantId || student.tenant_id || null;
      req.token = token;
      req.tokenType = decoded.type;

      next();
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({ error: "Token expired", code: "TOKEN_EXPIRED" });
      }
      return res.status(401).json({ error: "Invalid token" });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

/**
 * Middleware to authenticate both students and admins for password update
 */
const authenticateStudentOrAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if it's a student
      if (decoded.type === "student") {
        if (isTenantMismatch(req.tenantId, decoded.tenant_id)) {
          return res.status(403).json({
            error: "Token does not belong to this tenant",
            code: "TENANT_MISMATCH",
          });
        }

        const student = await Student.findOne({
          _id: decoded.id,
          ...(decoded.tenant_id ? { tenant_id: decoded.tenant_id } : {}),
        });
        if (!student) {
          return res.status(401).json({ error: "Student not found" });
        }

        if (!student.is_active) {
          return res.status(403).json({
            error: "Student account is inactive",
            code: "ACCOUNT_INACTIVE",
          });
        }

        // Check active token for students
        if (student.active_token && student.active_token !== token) {
          return res.status(401).json({
            error:
              "Session expired. You have been logged in from another device.",
          });
        }

        req.studentId = student._id;
        req.student = student;
        req.tenantId = req.tenantId || student.tenant_id || null;
        return next();
      }

      // Check if it's an admin
      if (decoded.type === "admin") {
        const admin = await resolveActiveAdminFromToken(decoded);
        if (!admin || !admin.is_active) {
          return res.status(401).json({ error: "Admin not found or inactive" });
        }

        if (admin.role !== "super_admin") {
          const tenantId = req.tenantId || decoded.tenant_id;
          if (!tenantId) {
            if (!isLegacySingleTenantModeEnabled()) {
              return res.status(400).json({
                error: "Tenant context is required for tenant admins",
                code: "TENANT_REQUIRED",
              });
            }

            req.adminMembership = {
              role: "owner",
              permissions: ["legacy.full_access"],
              is_legacy: true,
            };
          } else {
            const membership = await getActiveAdminMembership(
              admin._id,
              tenantId,
            );
            if (!membership) {
              return res.status(403).json({
                error: "Tenant admin membership not found",
                code: "TENANT_MEMBERSHIP_REQUIRED",
              });
            }

            req.adminMembership = membership;
            req.tenantId = tenantId;
          }
        }

        req.adminId = admin._id;
        req.admin = admin;
        return next();
      }

      return res.status(403).json({ error: "Invalid token type" });
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token expired" });
      }
      return res.status(401).json({ error: "Invalid token" });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

const requireTenantAdmin = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.admin.role === "super_admin") {
    return next();
  }

  if (!req.adminMembership) {
    return res.status(403).json({
      error: "Tenant admin membership required",
      code: "TENANT_MEMBERSHIP_REQUIRED",
    });
  }

  next();
};

const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (req.admin.role === "super_admin") {
      return next();
    }

    if (!req.adminMembership) {
      return res.status(403).json({
        error: "Tenant admin membership required",
        code: "TENANT_MEMBERSHIP_REQUIRED",
      });
    }

    const allowed = permissions.some((permission) =>
      hasPermission(req.adminMembership, permission),
    );

    if (!allowed) {
      return res.status(403).json({
        error: "You do not have permission for this action",
        code: "INSUFFICIENT_PERMISSIONS",
      });
    }

    next();
  };
};

module.exports = {
  authenticateStudent,
  authenticateAdmin,
  requireSuperAdmin,
  requireTenantAdmin,
  requirePermission,
  authenticateForPasswordChange,
  authenticateStudentOrAdmin,
};
