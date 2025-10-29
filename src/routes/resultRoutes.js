const express = require("express");
const router = express.Router();
const resultController = require("../controllers/resultController");
const {
  authenticateStudent,
  authenticateAdmin,
} = require("../middleware/auth");
const { apiLimiter } = require("../middleware/rateLimiter");

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
