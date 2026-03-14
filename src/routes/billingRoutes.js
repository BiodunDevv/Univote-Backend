const express = require("express");
const billingController = require("../controllers/billingController");

const router = express.Router();

/**
 * @swagger
 * /billing/webhooks/paystack:
 *   post:
 *     summary: Handle Paystack billing webhook
 *     tags: [Billing]
 *     description: Verifies Paystack signatures and applies invoice/payment state changes for tenant billing.
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post("/webhooks/paystack", billingController.handlePaystackWebhook);

module.exports = router;
