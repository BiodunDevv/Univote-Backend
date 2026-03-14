const express = require("express");
const notificationController = require("../controllers/notificationController");
const { authenticateStudentOrAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateStudentOrAdmin);

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List notifications
 *     description: Returns tenant-scoped or platform-scoped notifications for the authenticated student, tenant admin, or super admin.
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unread_only
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification list
 */
router.get("/", notificationController.listNotifications);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications marked as read
 */
router.patch("/read-all", notificationController.markAllAsRead);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.patch("/:id/read", notificationController.markAsRead);

module.exports = router;
