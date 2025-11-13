// Use Redis-backed rate limiters
const {
  apiLimiter,
  authLimiter,
  voteLimiter,
  adminLimiter,
  faceLimiter,
} = require("../services/redisRateLimiter");

module.exports = {
  apiLimiter,
  authLimiter,
  voteLimiter,
  adminLimiter,
  faceLimiter,
};
