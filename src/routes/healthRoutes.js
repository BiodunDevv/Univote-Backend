const express = require("express");
const router = express.Router();

/**
 * Health check endpoint for monitoring services
 * This endpoint is used by external cron jobs to keep the server alive
 */

/**
 * GET /api/health
 * Basic health check - returns server status
 */
router.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

/**
 * GET /api/health/ping
 * Simple ping endpoint for keep-alive services
 */
router.get("/ping", (req, res) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/detailed
 * Detailed health check with system information
 */
router.get("/detailed", (req, res) => {
  const memoryUsage = process.memoryUsage();

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(process.uptime()),
      formatted: formatUptime(process.uptime()),
    },
    memory: {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
    },
    node_version: process.version,
    platform: process.platform,
    environment: process.env.NODE_ENV || "development",
  });
});

/**
 * Helper function to format uptime
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(" ");
}

module.exports = router;
