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

/**
 * @route   GET /api/sessions/:id/live-results
 * @desc    Get live results for a session (optimized for high traffic)
 * @access  Private (Student)
 */
router.get(
  "/:id/live-results",
  authenticateStudent,
  apiLimiter,
  sessionController.getLiveResults
);

/**
 * @route   GET /api/candidates/:id
 * @desc    Get candidate details by ID
 * @access  Private (Student)
 */
router.get(
  "/candidates/:id",
  authenticateStudent,
  apiLimiter,
  sessionController.getCandidateById
);

module.exports = router;
