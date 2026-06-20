const crypto = require("crypto");

/**
 * Generate secure temporary password
 * Requirements: 14 chars drawn from uppercase, lowercase, numbers, and symbols
 * @returns {string} Secure temporary password
 */
function generateTemporaryPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.randomBytes(14);
  let password = "";

  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length];
  }

  return password;
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
