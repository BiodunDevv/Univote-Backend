const express = require("express");
const router = express.Router();
const resultController = require("../controllers/resultController");
const {
  authenticateStudent,
  authenticateAdmin,
} = require("../middleware/auth");
const { apiLimiter } = require("../middleware/rateLimiter");
const auditLogger = require("../middleware/auditLogger");

/**
 * @route   GET /api/results/:session_id
 * @desc    Get results for a voting session
 * @access  Private (Student)
 */
router.get(
  "/:session_id",
  authenticateStudent,
  apiLimiter,
  resultController.getResults
);

/**
 * @route   POST /api/results/:session_id/publish
 * @desc    Publish results and notify students
 * @access  Private (Admin)
 */
router.post(
  "/:session_id/publish",
  authenticateAdmin,
  auditLogger("publish_results", "results"),
  resultController.publishResults
);

/**
 * @route   GET /api/results/stats/overview
 * @desc    Get overall statistics
 * @access  Private (Admin)
 */
router.get(
  "/stats/overview",
  authenticateAdmin,
  resultController.getOverallStats
);

module.exports = router;
