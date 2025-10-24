const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/sessionController");
const { authenticateStudent } = require("../middleware/auth");
const { apiLimiter } = require("../middleware/rateLimiter");

/**
 * @route   GET /api/sessions
 * @desc    Get all eligible sessions for student
 * @access  Private (Student)
 */
router.get(
  "/",
  authenticateStudent,
  apiLimiter,
  sessionController.listEligibleSessions
);

/**
 * @route   GET /api/sessions/:id
 * @desc    Get specific session details
 * @access  Private (Student)
 */
router.get("/:id", authenticateStudent, sessionController.getSession);

module.exports = router;
