const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/sessionController");
const { authenticateStudent } = require("../middleware/auth");
const { apiLimiter } = require("../middleware/rateLimiter");

/**
 * @swagger
 * /sessions:
 *   get:
 *     summary: Get eligible sessions for student
 *     description: Returns all voting sessions the authenticated student is eligible to participate in, based on college, department, and level.
 *     tags: [Sessions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of eligible voting sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VotingSession'
 *                 total:
 *                   type: integer
 */
router.get(
  "/",
  authenticateStudent,
  apiLimiter,
  sessionController.listEligibleSessions,
);

/**
 * @swagger
 * /sessions/{id}:
 *   get:
 *     summary: Get session details
 *     description: Retrieve detailed information about a specific voting session including categories, candidates, and voting status.
 *     tags: [Sessions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Voting session ID
 *     responses:
 *       200:
 *         description: Session details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   $ref: '#/components/schemas/VotingSession'
 *                 has_voted:
 *                   type: boolean
 *       404:
 *         description: Session not found
 */
router.get("/:id", authenticateStudent, sessionController.getSession);

/**
 * @swagger
 * /sessions/{id}/live-results:
 *   get:
 *     summary: Get live results for a session
 *     description: Retrieve real-time vote tallies for an active or ended session. Optimized with Redis caching for high traffic.
 *     tags: [Sessions]
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
 *         description: Live results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session_id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 total_votes:
 *                   type: integer
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       candidates:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             name:
 *                               type: string
 *                             votes:
 *                               type: integer
 *                             percentage:
 *                               type: number
 *       404:
 *         description: Session not found
 */
router.get(
  "/:id/live-results",
  authenticateStudent,
  apiLimiter,
  sessionController.getLiveResults,
);

/**
 * @swagger
 * /sessions/candidates/{id}:
 *   get:
 *     summary: Get candidate details by ID
 *     description: Retrieve full details of a specific candidate including manifesto and photo.
 *     tags: [Sessions]
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
 *         description: Candidate details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 candidate:
 *                   $ref: '#/components/schemas/Candidate'
 *       404:
 *         description: Candidate not found
 */
router.get(
  "/candidates/:id",
  authenticateStudent,
  apiLimiter,
  sessionController.getCandidateById,
);

module.exports = router;
