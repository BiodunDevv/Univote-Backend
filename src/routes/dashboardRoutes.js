const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const {
  authenticateStudent,
  authenticateAdmin,
  authenticateStudentOrAdmin,
} = require("../middleware/auth");
const { apiLimiter } = require("../middleware/rateLimiter");

/**
 * @route   GET /api/dashboard/admin
 * @desc    Get admin dashboard statistics and data
 * @access  Private (Admin)
 */
router.get(
  "/admin",
  authenticateAdmin,
  apiLimiter,
  dashboardController.getAdminDashboard
);

/**
 * @route   GET /api/dashboard/student
 * @desc    Get student dashboard data
 * @access  Private (Student)
 */
router.get(
  "/student",
  authenticateStudent,
  apiLimiter,
  dashboardController.getStudentDashboard
);

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get quick statistics (works for both admin and student)
 * @access  Private (Student or Admin)
 */
router.get(
  "/stats",
  authenticateStudentOrAdmin,
  apiLimiter,
  dashboardController.getQuickStats
);

/**
 * @route   POST /api/dashboard/invalidate-cache
 * @desc    Invalidate dashboard cache for current user
 * @access  Private (Student or Admin)
 */
router.post(
  "/invalidate-cache",
  authenticateStudentOrAdmin,
  dashboardController.invalidateCache
);

module.exports = router;
