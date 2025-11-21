require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const connectDB = require("./config/database");
const { createRedisClient, pingRedis } = require("./config/redis");

// Load Swagger documentation
const swaggerDocument = YAML.load(path.join(__dirname, "..", "swagger.yaml"));

// Import routes
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const collegeRoutes = require("./routes/collegeRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const voteRoutes = require("./routes/voteRoutes");
const resultRoutes = require("./routes/resultRoutes");
const healthRoutes = require("./routes/healthRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();

app.set("trust proxy", 1);

// Initialize Redis connection
console.log("🔄 Initializing Redis...");
createRedisClient();

// Test Redis connection
pingRedis()
  .then((connected) => {
    if (connected) {
      console.log("✅ Redis ping successful");
    } else {
      console.warn(
        "⚠️  Redis ping failed, app will continue with reduced functionality"
      );
    }
  })
  .catch((err) => {
    console.warn("⚠️  Redis connection warning:", err.message);
  });

// Connect to MongoDB (async)
connectDB()
  .then(() => {
    // Start session scheduler only after DB is connected
    const sessionScheduler = require("./utils/sessionScheduler");
    sessionScheduler.start();
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB, scheduler not started:", err);
  });

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Swagger API Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Univote API Documentation",
    customfavIcon: "/favicon.ico",
  })
);

// Root endpoint - redirect to API docs
app.get("/", (req, res) => {
  res.redirect("/api-docs");
});

// API Routes
app.use("/api/health", healthRoutes); // Keep-alive health check endpoint
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", collegeRoutes);
app.use("/api/admin/settings", settingsRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/vote", voteRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/dashboard", dashboardRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);

  // Session scheduler is started after MongoDB connects (see line 24)

  // Initialize keep-alive service for production (Render)
  if (process.env.NODE_ENV === "production") {
    const KeepAlive = require("./utils/keepAlive");
    const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;

    // Create keep-alive instance (pings every 14 minutes)
    const keepAlive = new KeepAlive(
      `${serverUrl}/api/health/ping`,
      14 * 60 * 1000
    );

    // Start the keep-alive service
    keepAlive.start();

    console.log("✓ Keep-alive service started");
    console.log(`  Pinging: ${serverUrl}/api/health/ping every 14 minutes`);
  }
});

module.exports = app;
