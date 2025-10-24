const jwt = require("jsonwebtoken");

/**
 * Generate JWT token for student
 * @param {Object} student - Student object
 * @returns {string} JWT token
 */
function generateStudentToken(student) {
  const payload = {
    id: student._id,
    matric_no: student.matric_no,
    type: "student",
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY || "24h",
  });
}

/**
 * Generate JWT token for admin
 * @param {Object} admin - Admin object
 * @returns {string} JWT token
 */
function generateAdminToken(admin) {
  const payload = {
    id: admin._id,
    email: admin.email,
    role: admin.role,
    type: "admin",
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY || "24h",
  });
}

/**
 * Generate a temporary token for first-time password change
 * @param {Object} student - Student object
 * @returns {string} JWT token
 */
function generateFirstLoginToken(student) {
  const payload = {
    id: student._id,
    matric_no: student.matric_no,
    type: "first_login",
    purpose: "password_change",
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "30m", // Short expiry for security
  });
}

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
  generateStudentToken,
  generateAdminToken,
  generateFirstLoginToken,
  verifyToken,
};
