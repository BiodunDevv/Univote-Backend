const express = require("express");
const announcementController = require("../controllers/announcementController");
const { authenticateAdmin } = require("../middleware/auth");
const {
  requireTenantAccess,
  requireTenantContext,
} = require("../middleware/tenantContext");

const router = express.Router();

router.use(authenticateAdmin);

/**
 * @swagger
 * /announcements:
 *   get:
 *     summary: List tenant or platform announcements
 *     tags: [Announcements]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Announcement list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 announcements:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Announcement'
 */
router.get("/", announcementController.list);

/**
 * @swagger
 * /announcements:
 *   post:
 *     summary: Create and publish an announcement
 *     tags: [Announcements]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body, audience_scope]
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               audience_scope:
 *                 type: string
 *               channels:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [in_app, email]
 *               cta_link:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Announcement created successfully
 *       403:
 *         description: Audience or tenant scope not allowed for this admin
 */
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
