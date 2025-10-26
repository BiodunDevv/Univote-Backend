require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const connectDB = require("./config/database");

// Load Swagger documentation
const swaggerDocument = YAML.load(path.join(__dirname, "..", "swagger.yaml"));

// Import routes
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const collegeRoutes = require("./routes/collegeRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const voteRoutes = require("./routes/voteRoutes");
const resultRoutes = require("./routes/resultRoutes");

const app = express();

// Connect to MongoDB
connectDB();

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
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", collegeRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/vote", voteRoutes);
app.use("/api/results", resultRoutes);

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
});

module.exports = app;
