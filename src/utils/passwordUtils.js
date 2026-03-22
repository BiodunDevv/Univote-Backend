const crypto = require("crypto");
const constants = require("../config/constants");

/**
 * Generate secure temporary password
 * Requirements: 12 chars, uppercase, lowercase, numbers, special chars
 * @returns {string} Secure temporary password
 */
function generateTemporaryPassword() {
  return constants.defaultPassword;
}

/**
 * Generate secure reset code (6 digit numeric)
 * @returns {string} 6-digit reset code
 */
function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate secure token for password reset/email verification
 * @param {number} length - Token length
 * @returns {string} Secure random token (hex)
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

module.exports = {
  generateTemporaryPassword,
  generateResetCode,
  generateSecureToken,
};
