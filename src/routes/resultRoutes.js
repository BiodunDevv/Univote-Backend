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
 * /results/stats/overview:
 *   get:
 *     summary: Get overall election result statistics
 *     description: Retrieve tenant-wide turnout and result overview metrics for admin reporting.
 *     tags: [Results]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Aggregate result statistics
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
 *     summary: Get results for an election
 *     description: Retrieve final or live results for a specific election. Shows vote counts per candidate per category.
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
 *         description: Election results
 *       404:
 *         description: Election not found
 */
router.get(
  "/:session_id",
  authenticateStudent,
  requireTenantAccess,
  apiLimiter,
  resultController.getResults,
);

module.exports = router;
