const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const voteController = require("../controllers/voteController");
const { authenticateStudent } = require("../middleware/auth");
const { voteLimiter, faceLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validator");
const auditLogger = require("../middleware/auditLogger");

/**
 * @swagger
 * /vote:
 *   post:
 *     summary: Submit a vote
 *     description: |
 *       Submit votes for a voting session. Requires facial verification and location data.
 *       The vote flow includes:
 *       1. Redis-based atomic lock to prevent double voting
 *       2. Session status and eligibility verification
 *       3. Geofence check (if session requires on-campus voting)
 *       4. Face++ facial verification against student photo
 *       5. Atomic vote recording in MongoDB transaction
 *     tags: [Voting]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [session_id, choices, image_url, lat, lng]
 *             properties:
 *               session_id:
 *                 type: string
 *                 description: ID of the voting session
 *               choices:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   properties:
 *                     category_id:
 *                       type: string
 *                     candidate_id:
 *                       type: string
 *                 description: Array of vote choices per category
 *               image_url:
 *                 type: string
 *                 format: uri
 *                 description: URL of selfie for facial verification
 *               lat:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 description: User latitude
 *               lng:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 description: User longitude
 *     responses:
 *       200:
 *         description: Vote submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 vote:
 *                   $ref: '#/components/schemas/Vote'
 *       400:
 *         description: Already voted, session not active, or invalid choices
 *       403:
 *         description: Not eligible, geofence violation, or face verification failed
 *       404:
 *         description: Session not found
 *       429:
 *         description: Rate limit exceeded
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
  voteController.submitVote,
);

/**
 * @swagger
 * /vote/history:
 *   get:
 *     summary: Get student voting history
 *     description: Retrieve the authenticated student's complete voting history across all sessions.
 *     tags: [Voting]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Voting history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 votes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Vote'
 *                 total:
 *                   type: integer
 */
router.get("/history", authenticateStudent, voteController.getVotingHistory);

module.exports = router;
