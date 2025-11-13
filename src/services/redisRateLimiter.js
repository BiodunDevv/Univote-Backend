const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis");
const { getRedisClient } = require("../config/redis");

/**
 * Create a rate limiter with Redis store
 * Lazily connects to Redis to avoid initialization timing issues
 */
const createRedisRateLimiter = (options) => {
  const {
    windowMs,
    max,
    message,
    skipSuccessfulRequests = false,
    keyGenerator = null,
  } = options;

  const limiterConfig = {
    windowMs,
    max,
    message,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
  };

  // Add custom key generator if provided
  if (keyGenerator) {
    limiterConfig.keyGenerator = keyGenerator;
  }

  // Try to use Redis store with lazy initialization
  try {
    const redisClient = getRedisClient();
    limiterConfig.store = new RedisStore({
      // @ts-expect-error - Known issue with rate-limit-redis types
      sendCommand: (...args) => redisClient.call(...args),
      prefix: "rl:", // Rate limit prefix
    });
  } catch (error) {
    // Redis not ready yet, will use in-memory store
    // This is fine - rate limiting still works, just not distributed
  }

  return rateLimit(limiterConfig);
};

// General API rate limiter
const apiLimiter = createRedisRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || 300), // 300 requests per window
  message: "Too many requests from this IP, please try again later.",
});

// Strict limiter for authentication endpoints
const authLimiter = createRedisRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login attempts per 15 minutes
  message: "Too many login attempts, please try again after 15 minutes.",
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    // Use matric_no or email for student/admin login attempts
    return req.body.matric_no || req.body.email || req.ip;
  },
});

// Limiter for voting endpoint
const voteLimiter = createRedisRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 vote attempts per minute
  message: "Too many vote attempts, please slow down.",
  keyGenerator: (req) => {
    // Use studentId if authenticated, otherwise IP
    return req.studentId ? `student:${req.studentId}` : req.ip;
  },
});

// Limiter for admin operations
const adminLimiter = createRedisRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 requests per 5 minutes
  message: "Too many admin requests, please try again later.",
  keyGenerator: (req) => {
    // Use adminId if authenticated, otherwise IP
    return req.adminId ? `admin:${req.adminId}` : req.ip;
  },
});

// Limiter for Face++ API calls
const faceLimiter = createRedisRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // 50 face API calls per minute
  message: "Face verification rate limit exceeded, please try again later.",
  keyGenerator: (req) => {
    // Use studentId for face verification attempts
    return req.studentId ? `face:${req.studentId}` : req.ip;
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
  voteLimiter,
  adminLimiter,
  faceLimiter,
  createRedisRateLimiter,
};
