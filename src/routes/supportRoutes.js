const express = require("express");
const { body } = require("express-validator");
const supportController = require("../controllers/supportController");
const { authenticateStudentOrAdmin } = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const validate = require("../middleware/validator");

const router = express.Router();

router.use(authenticateStudentOrAdmin);

/**
 * @swagger
 * /support/overview:
 *   get:
 *     summary: Get support overview
 *     description: Returns support queue metrics for the current student, tenant admin, or super admin.
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Super admin only tenant filter
 *     responses:
 *       200:
 *         description: Support overview retrieved successfully
 */
router.get("/overview", supportController.getOverview);

/**
 * @swagger
 * /support/tickets:
 *   get:
 *     summary: List support tickets
 *     description: Returns support tickets scoped to the current actor. Students see their own tickets, tenant admins see their tenant queue, and super admins can inspect all tenants.
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, closed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [general, account, voting, billing, technical]
 *       - in: query
 *         name: requester_type
 *         schema:
 *           type: string
 *           enum: [student, admin]
 *       - in: query
 *         name: assigned_to_me
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Super admin only tenant filter
 *     responses:
 *       200:
 *         description: Support ticket list
 *   post:
 *     summary: Create support ticket
 *     description: Creates a new tenant-scoped support ticket and the first conversation message.
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, description]
 *             properties:
 *               subject:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [general, account, voting, billing, technical]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *     responses:
 *       201:
 *         description: Support ticket created successfully
 */
router.get("/tickets", supportController.listTickets);

router.post(
  "/tickets",
  [
    body("subject").notEmpty().withMessage("Subject is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("category")
      .optional()
      .isIn(["general", "account", "voting", "billing", "technical"])
      .withMessage("Valid category is required"),
    body("priority")
      .optional()
      .isIn(["low", "medium", "high", "urgent"])
      .withMessage("Valid priority is required"),
    validate,
  ],
  auditLogger("create_support_ticket", "support"),
  supportController.createTicket,
);

/**
 * @swagger
 * /support/tickets/{id}:
 *   get:
 *     summary: Get support ticket
 *     tags: [Support]
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
 *         description: Support ticket detail
 *   patch:
 *     summary: Update support ticket
 *     description: Updates support ticket status, priority, category, or assignment. Students can only close their own tickets.
 *     tags: [Support]
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
 *         description: Support ticket updated successfully
 */
router.get("/tickets/:id", supportController.getTicketById);

router.patch(
  "/tickets/:id",
  [
    body("status")
      .optional()
      .isIn(["open", "in_progress", "resolved", "closed"])
      .withMessage("Valid status is required"),
    body("priority")
      .optional()
      .isIn(["low", "medium", "high", "urgent"])
      .withMessage("Valid priority is required"),
    body("category")
      .optional()
      .isIn(["general", "account", "voting", "billing", "technical"])
      .withMessage("Valid category is required"),
    body("assigned_admin_id")
      .optional({ nullable: true })
      .isString()
      .withMessage("assigned_admin_id must be a string"),
    validate,
  ],
  auditLogger("update_support_ticket", "support"),
  supportController.updateTicket,
);

/**
 * @swagger
 * /support/tickets/{id}/messages:
 *   get:
 *     summary: Get support ticket conversation
 *     tags: [Support]
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
 *         description: Support conversation retrieved successfully
 *   post:
 *     summary: Create support ticket message
 *     tags: [Support]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Support message sent successfully
 */
router.get("/tickets/:id/messages", supportController.getMessages);

router.post(
  "/tickets/:id/messages",
  [
    body("body").notEmpty().withMessage("Message body is required"),
    body("attachments").optional().isArray().withMessage("Attachments must be an array"),
    validate,
  ],
  auditLogger("create_support_message", "support"),
  supportController.createMessage,
);

module.exports = router;
