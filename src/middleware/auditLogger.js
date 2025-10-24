const AuditLog = require("../models/AuditLog");

/**
 * Middleware to log audit events
 */
const auditLogger = (action, resource) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json;

    // Override json method to capture response
    res.json = function (data) {
      // Determine user info
      let userType = null;
      let userId = null;

      if (req.student) {
        userType = "student";
        userId = req.studentId;
      } else if (req.admin) {
        userType = "admin";
        userId = req.adminId;
      }

      // Log the action
      if (userType && userId) {
        const logEntry = {
          user_type: userType,
          user_id: userId,
          action,
          resource,
          resource_id: req.params.id || req.body.session_id || null,
          details: {
            method: req.method,
            path: req.path,
            body: sanitizeBody(req.body),
            query: req.query,
          },
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.headers["user-agent"],
          status: res.statusCode < 400 ? "success" : "failure",
        };

        // Async log without blocking response
        AuditLog.create(logEntry).catch((err) => {
          console.error("Audit log error:", err);
        });
      }

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Remove sensitive data from body before logging
 */
function sanitizeBody(body) {
  const sanitized = { ...body };

  // Remove sensitive fields
  delete sanitized.password;
  delete sanitized.password_hash;
  delete sanitized.image_url;
  delete sanitized.token;

  return sanitized;
}

module.exports = auditLogger;
