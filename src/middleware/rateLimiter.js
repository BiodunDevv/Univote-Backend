const rateLimit = require("express-rate-limit");

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || 300), // Limit each IP to 300 requests per windowMs (increased from 100)
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 login requests per 15 minutes (increased from 5)
  message: "Too many login attempts, please try again after 15 minutes.",
  skipSuccessfulRequests: true,
});

// Limiter for voting endpoint
const voteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 vote attempts per minute (increased from 10)
  message: "Too many vote attempts, please slow down.",
});

// Limiter for admin operations
const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Limit each IP to 100 requests per 5 minutes (increased from 50)
  message: "Too many admin requests, please try again later.",
});

// Limiter for Face++ API calls
const faceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // Limit to 50 face API calls per minute (increased from 20)
  message: "Face verification rate limit exceeded, please try again later.",
});

module.exports = {
  apiLimiter,
  authLimiter,
  voteLimiter,
  adminLimiter,
  faceLimiter,
};
