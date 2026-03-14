require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const connectDB = require("./config/database");
const { createRedisClient, pingRedis } = require("./config/redis");

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
const platformRoutes = require("./routes/platformRoutes");
const supportRoutes = require("./routes/supportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const publicRoutes = require("./routes/publicRoutes");
const billingRoutes = require("./routes/billingRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const { resolveTenantContext } = require("./middleware/tenantContext");
const { initializeSocketServer } = require("./services/socketService");
const { hydratePlanCatalogFromStore } = require("./config/billingPlans");

const app = express();
const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || "development";
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

app.set("trust proxy", 1);

// ── Services ────────────────────────────────────────────
createRedisClient();
pingRedis()
  .then((ok) => {
    if (!ok)
      console.warn("⚠  Redis unavailable — running with reduced caching");
  })
  .catch((err) => console.warn("⚠  Redis:", err.message));

connectDB()
  .then(async () => {
    await hydratePlanCatalogFromStore();
    require("./utils/sessionScheduler").start();
  })
  .catch((err) => console.error("✗ MongoDB failed:", err.message));

// ── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(resolveTenantContext);

if (ENV === "development") {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ── Docs ─────────────────────────────────────────────────
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Univote API Documentation",
  }),
);

app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

app.get("/", (req, res) => res.redirect("/api-docs"));

// ── Health (root-level) ──────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// ── API Routes ───────────────────────────────────────────
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", collegeRoutes);
app.use("/api/admin/settings", settingsRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/vote", voteRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ── Error Handling ───────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Error:", err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || "Internal Server Error",
    ...(ENV === "development" && { stack: err.stack }),
  });
});

// ── Start Server ─────────────────────────────────────────
const server = http.createServer(app);
initializeSocketServer(server);

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║         UNIVOTE API  ·  v1.0.0          ║
  ╠══════════════════════════════════════════╣
  ║  Server   ${SERVER_URL.padEnd(30)}║
  ║  Docs     ${(SERVER_URL + "/api-docs").padEnd(30)}║
  ║  Env      ${ENV.padEnd(30)}║
  ╚══════════════════════════════════════════╝
  `);

  // Keep-alive self-ping (works in all environments)
  const KeepAlive = require("./utils/keepAlive");
  const keepAlive = new KeepAlive(
    `${SERVER_URL}/api/health/ping`,
    14 * 60 * 1000,
  );
  keepAlive.start();
});

module.exports = app;
module.exports.server = server;
