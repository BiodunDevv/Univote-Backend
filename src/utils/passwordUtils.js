const crypto = require("crypto");

/**
 * Generate secure temporary password
 * Requirements: 12 chars, uppercase, lowercase, numbers, special chars
 * @returns {string} Secure temporary password
 */
function generateTemporaryPassword() {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*";
  const all = uppercase + lowercase + numbers + special;

  let password = "";

  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill rest randomly from all characters
  for (let i = password.length; i < 12; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
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
