const rateLimit = require("express-rate-limit");

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || 100), // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: "Too many login attempts, please try again after 15 minutes.",
  skipSuccessfulRequests: true,
});

// Limiter for voting endpoint
const voteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 vote attempts per minute
  message: "Too many vote attempts, please slow down.",
});

// Limiter for admin operations
const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Limit each IP to 50 requests per 5 minutes
  message: "Too many admin requests, please try again later.",
});

// Limiter for Azure Face API calls
const faceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit to 20 face API calls per minute (Azure quota consideration)
  message: "Face verification rate limit exceeded, please try again later.",
});

module.exports = {
  apiLimiter,
  authLimiter,
  voteLimiter,
  adminLimiter,
  faceLimiter,
};
