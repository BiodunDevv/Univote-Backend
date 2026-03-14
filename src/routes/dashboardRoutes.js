const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const {
  authenticateStudent,
  authenticateAdmin,
  requireTenantAdmin,
  authenticateStudentOrAdmin,
} = require("../middleware/auth");
const { requireTenantAccess } = require("../middleware/tenantContext");
const { apiLimiter } = require("../middleware/rateLimiter");

/**
 * @swagger
 * /dashboard/admin:
 *   get:
 *     summary: Get admin dashboard
 *     description: Retrieve comprehensive admin dashboard with session stats, recent activity, voter turnout charts, and system overview.
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Admin dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total_students:
 *                       type: integer
 *                     total_sessions:
 *                       type: integer
 *                     active_sessions:
 *                       type: integer
 *                     total_votes:
 *                       type: integer
 *                 recent_sessions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VotingSession'
 *                 recent_activity:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get(
  "/admin",
  authenticateAdmin,
  requireTenantAdmin,
  requireTenantAccess,
  apiLimiter,
  dashboardController.getAdminDashboard,
);

/**
 * @swagger
 * /dashboard/student:
 *   get:
 *     summary: Get student dashboard
 *     description: Retrieve student dashboard showing eligible sessions, voting status, and recent activity.
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Student dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 eligible_sessions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VotingSession'
 *                 voted_sessions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total_eligible:
 *                       type: integer
 *                     total_voted:
 *                       type: integer
 */
router.get(
  "/student",
  authenticateStudent,
  requireTenantAccess,
  apiLimiter,
  dashboardController.getStudentDashboard,
);

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     summary: Get quick statistics
 *     description: Get quick overview statistics. Works for both admin and student roles.
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Quick stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_students:
 *                   type: integer
 *                   description: Admin view only
 *                 active_sessions:
 *                   type: integer
 *                 total_votes:
 *                   type: integer
 *                   description: Admin view — total system votes
 *                 votes_cast:
 *                   type: integer
 *                   description: Student view — personal vote count
 *                 total_eligible_sessions:
 *                   type: integer
 *                   description: Student view only
 *                 pending_actions:
 *                   type: integer
 *                   description: Admin view only
 *                 fetch_time_ms:
 *                   type: number
 */
router.get(
  "/stats",
  authenticateStudentOrAdmin,
  requireTenantAccess,
  apiLimiter,
  dashboardController.getQuickStats,
);

/**
 * @swagger
 * /dashboard/invalidate-cache:
 *   post:
 *     summary: Invalidate dashboard cache
 *     description: Clear cached dashboard data for the authenticated user. Forces fresh data on next dashboard load.
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cache invalidated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post(
  "/invalidate-cache",
  authenticateStudentOrAdmin,
  requireTenantAccess,
  dashboardController.invalidateCache,
);

module.exports = router;
