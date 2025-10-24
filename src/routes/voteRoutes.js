const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const voteController = require("../controllers/voteController");
const { authenticateStudent } = require("../middleware/auth");
const { voteLimiter, faceLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validator");
const auditLogger = require("../middleware/auditLogger");

/**
 * @route   POST /api/vote
 * @desc    Submit a vote
 * @access  Private (Student)
 */
router.post(
  "/",
  authenticateStudent,
  voteLimiter,
  faceLimiter,
  [
    body("session_id").notEmpty().withMessage("Session ID is required"),
    body("choices")
      .isArray({ min: 1 })
      .withMessage("At least one choice is required"),
    body("image_url").isURL().withMessage("Valid image URL is required"),
    body("lat")
      .isFloat({ min: -90, max: 90 })
      .withMessage("Valid latitude is required"),
    body("lng")
      .isFloat({ min: -180, max: 180 })
      .withMessage("Valid longitude is required"),
    validate,
  ],
  auditLogger("submit_vote", "votes"),
  voteController.submitVote
);

/**
 * @route   GET /api/vote/history
 * @desc    Get student's voting history
 * @access  Private (Student)
 */
router.get("/history", authenticateStudent, voteController.getVotingHistory);

module.exports = router;
