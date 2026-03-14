const express = require("express");
const announcementController = require("../controllers/announcementController");
const { authenticateAdmin } = require("../middleware/auth");
const {
  requireTenantAccess,
  requireTenantContext,
} = require("../middleware/tenantContext");

const router = express.Router();

router.use(authenticateAdmin);

router.get("/", announcementController.list);

router.post(
  "/",
  (req, res, next) => {
    if (req.admin?.role === "super_admin") {
      return next();
    }
    return requireTenantContext(req, res, () =>
      requireTenantAccess(req, res, next),
    );
  },
  announcementController.create,
);

module.exports = router;
