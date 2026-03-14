const express = require("express");
const router = express.Router();
const resultController = require("../controllers/resultController");
const {
  authenticateStudent,
  authenticateAdmin,
  requireTenantAdmin,
} = require("../middleware/auth");
const { requireTenantAccess } = require("../middleware/tenantContext");
const { apiLimiter } = require("../middleware/rateLimiter");

/**
 * @swagger
 * /results/{session_id}:
 *   get:
 *     summary: Get results for a voting session
 *     description: Retrieve final or live results for a specific voting session. Shows vote counts per candidate per category.
 *     tags: [Results]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     status:
 *                       type: string
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       category:
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
 *                 total_votes:
 *                   type: integer
 *                 total_eligible:
 *                   type: integer
 *       404:
 *         description: Session not found
 */
router.get(
  "/stats/overview",
  authenticateAdmin,
  requireTenantAdmin,
  requireTenantAccess,
  resultController.getOverallStats,
);

/**
 * @swagger
 * /results/{session_id}:
 *   get:
 *     summary: Get results for a voting session
 *     description: Retrieve final or live results for a specific voting session. Shows vote counts per candidate per category.
 *     tags: [Results]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session results
 *       404:
 *         description: Session not found
 */
router.get(
  "/:session_id",
  authenticateStudent,
  requireTenantAccess,
  apiLimiter,
  resultController.getResults,
);

module.exports = router;
