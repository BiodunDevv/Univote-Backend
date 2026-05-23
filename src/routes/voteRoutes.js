const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const voteController = require("../controllers/voteController");
const { authenticateStudent } = require("../middleware/auth");
const { requireTenantAccess } = require("../middleware/tenantContext");
const { voteLimiter, faceLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validator");
const auditLogger = require("../middleware/auditLogger");

/**
 * @swagger
 * /vote:
 *   post:
 *     summary: Submit a vote
 *     description: |
 *       Submit votes for an election. Requires facial verification and location data.
 *       The vote flow includes:
 *       1. Redis-based atomic lock to prevent double voting
 *       2. Session status and eligibility verification
 *       3. Geofence check (if session requires on-campus voting)
 *       4. AWS liveness verification and Rekognition face comparison
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
 *             required: [session_id, choices, lat, lng]
 *             properties:
 *               session_id:
 *                 type: string
 *                 description: ID of the election
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
 *               liveness_session_id:
 *                 type: string
 *                 description: AWS liveness session identifier when liveness is required
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
 *         description: Election not found
 *       429:
 *         description: Rate limit exceeded
 */
/**
 * @swagger
 * /vote/liveness/session:
 *   post:
 *     summary: Start a live face verification session
 *     tags: [Voting]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Liveness session created
 *       503:
 *         description: Biometric provider unavailable
 */
router.post(
  "/liveness/session",
  authenticateStudent,
  requireTenantAccess,
  faceLimiter,
  auditLogger("create_vote_liveness_session", "votes"),
  voteController.createLivenessSession,
);

/**
 * @swagger
 * /vote/liveness/session/{id}:
 *   get:
 *     summary: Resolve a live face verification session result
 *     tags: [Voting]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Liveness session result
 */
router.get(
  "/liveness/session/:id",
  authenticateStudent,
  requireTenantAccess,
  faceLimiter,
  voteController.getLivenessSessionResult,
);

/**
 * @swagger
 * /vote/session/{sessionId}/submitted:
 *   get:
 *     summary: Get the authenticated student's submitted ballot for an election
 *     tags: [Voting]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Submitted ballot receipt
 *       404:
 *         description: Submitted ballot not found
 */
router.get(
  "/session/:sessionId/submitted",
  authenticateStudent,
  requireTenantAccess,
  voteController.getSubmittedBallotBySession,
);

/**
 * @swagger
 * /vote/location-check:
 *   post:
 *     summary: Verify whether the student's current location is allowed for voting
 *     tags: [Voting]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [session_id, lat, lng]
 *             properties:
 *               session_id:
 *                 type: string
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location is accepted for voting
 *       403:
 *         description: Location or eligibility denied
 */
router.post(
  "/location-check",
  authenticateStudent,
  requireTenantAccess,
  voteLimiter,
  voteController.checkLocation,
);

router.post(
  "/",
  authenticateStudent,
  requireTenantAccess,
  voteLimiter,
  faceLimiter,
  [
    body("session_id").notEmpty().withMessage("Session ID is required"),
    body("choices")
      .isArray({ min: 1 })
      .withMessage("At least one choice is required"),
    body("image_url")
      .optional({ nullable: true, checkFalsy: true })
      .isURL()
      .withMessage("Valid image URL is required"),
    body("lat")
      .isFloat({ min: -90, max: 90 })
      .withMessage("Valid latitude is required"),
    body("lng")
      .isFloat({ min: -180, max: 180 })
      .withMessage("Valid longitude is required"),
    body("liveness_session_id")
      .optional({ nullable: true, checkFalsy: true })
      .isString()
      .withMessage("Liveness session must be a string"),
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
router.get("/history", authenticateStudent, requireTenantAccess, voteController.getVotingHistory);

module.exports = router;
