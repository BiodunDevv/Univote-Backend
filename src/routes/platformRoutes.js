const express = require("express");
const { body } = require("express-validator");
const platformController = require("../controllers/platformController");
const platformTestimonialController = require("../controllers/platformTestimonialController");
const billingController = require("../controllers/billingController");
const { authenticateAdmin, requireSuperAdmin } = require("../middleware/auth");
const validate = require("../middleware/validator");
const auditLogger = require("../middleware/auditLogger");

const router = express.Router();

/**
 * @swagger
 * /platform/overview:
 *   get:
 *     summary: Get platform overview
 *     tags: [Platform]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Platform overview retrieved successfully
 */
router.get(
  "/overview",
  authenticateAdmin,
  requireSuperAdmin,
  platformController.getOverview,
);

router.get(
  "/settings/defaults",
  authenticateAdmin,
  requireSuperAdmin,
  platformController.getPlatformSettings,
);

router.patch(
  "/settings/defaults",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("update_platform_settings", "platform_settings"),
  platformController.updatePlatformSettings,
);
router.post(
  "/settings/biometrics/providers",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("create_biometric_provider", "platform_settings"),
  platformController.createBiometricProvider,
);
router.delete(
  "/settings/biometrics/providers/:providerKey",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("delete_biometric_provider", "platform_settings"),
  platformController.deleteBiometricProvider,
);
router.post(
  "/settings/biometrics/test",
  authenticateAdmin,
  requireSuperAdmin,
  platformController.testBiometricProvider,
);

router.get(
  "/billing",
  authenticateAdmin,
  requireSuperAdmin,
  billingController.getPlatformBillingOverview,
);

router.get(
  "/plans",
  authenticateAdmin,
  requireSuperAdmin,
  billingController.getPlatformPlans,
);

router.patch(
  "/plans/:code",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("name").optional().notEmpty().withMessage("Plan name cannot be empty"),
    body("rank").optional().isInt({ min: 1 }).withMessage("Rank must be at least 1"),
    body("monthly_price_ngn")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Monthly price must be zero or greater"),
    body("support_sla")
      .optional()
      .notEmpty()
      .withMessage("Support SLA cannot be empty"),
    body("limits.admins")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Admin limit must be zero or greater"),
    body("limits.students")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Participant limit must be zero or greater"),
    body("limits.active_sessions")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Active session limit must be zero or greater"),
    body("features").optional().isArray().withMessage("Features must be an array"),
    validate,
  ],
  auditLogger("update_platform_plan", "platform_billing"),
  billingController.updatePlatformPlan,
);

router.get(
  "/coupons",
  authenticateAdmin,
  requireSuperAdmin,
  platformController.listCoupons,
);

router.post(
  "/coupons",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("code").notEmpty().withMessage("Coupon code is required"),
    body("name").notEmpty().withMessage("Coupon name is required"),
    body("discount_type")
      .isIn(["percentage", "fixed_amount"])
      .withMessage("Valid discount type is required"),
    body("discount_value")
      .isFloat({ min: 0 })
      .withMessage("Discount value must be zero or greater"),
    validate,
  ],
  auditLogger("create_coupon", "billing"),
  platformController.createCoupon,
);

router.patch(
  "/coupons/:id",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("discount_type")
      .optional()
      .isIn(["percentage", "fixed_amount"])
      .withMessage("Valid discount type is required"),
    body("discount_value")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Discount value must be zero or greater"),
    validate,
  ],
  auditLogger("update_coupon", "billing"),
  platformController.updateCoupon,
);

/**
 * @swagger
 * /platform/tenants:
 *   get:
 *     summary: List tenants
 *     tags: [Platform]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant list retrieved successfully
 */
router.get(
  "/tenants",
  authenticateAdmin,
  requireSuperAdmin,
  platformController.listTenants,
);

/**
 * @swagger
 * /platform/tenants/{id}:
 *   get:
 *     summary: Get tenant detail
 *     tags: [Platform]
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
 *         description: Tenant detail retrieved successfully
 *       404:
 *         description: Tenant not found
 *   patch:
 *     summary: Update tenant
 *     tags: [Platform]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               primary_domain:
 *                 type: string
 *               contact_name:
 *                 type: string
 *               contact_email:
 *                 type: string
 *                 format: email
 *               support_email:
 *                 type: string
 *                 format: email
 *               plan_code:
 *                 type: string
 *                 enum: [pro, pro_plus, enterprise]
 *               status:
 *                 type: string
 *                 enum: [draft, pending_payment, pending_approval, active, suspended]
 *               subscription_status:
 *                 type: string
 *                 enum: [trial, active, grace, expired, suspended]
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Tenant updated successfully
 *       404:
 *         description: Tenant not found
 */
router.get(
  "/tenants/:id",
  authenticateAdmin,
  requireSuperAdmin,
  platformController.getTenantById,
);

router.patch(
  "/tenants/:id",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("contact_email")
      .optional({ nullable: true, checkFalsy: true })
      .isEmail()
      .withMessage("Contact email must be valid"),
    body("support_email")
      .optional({ nullable: true, checkFalsy: true })
      .isEmail()
      .withMessage("Support email must be valid"),
    body("plan_code")
      .optional()
      .isIn(["pro", "pro_plus", "enterprise"])
      .withMessage("Valid plan code is required"),
    body("status")
      .optional()
      .isIn(["draft", "pending_payment", "pending_approval", "active", "suspended"])
      .withMessage("Valid tenant status is required"),
    body("subscription_status")
      .optional()
      .isIn(["trial", "active", "grace", "expired", "suspended"])
      .withMessage("Valid subscription status is required"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_tenant", "tenant"),
  platformController.updateTenant,
);

/**
 * @swagger
 * /platform/tenants:
 *   post:
 *     summary: Create tenant
 *     tags: [Platform]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               primary_domain:
 *                 type: string
 *               plan_code:
 *                 type: string
 *               contact_name:
 *                 type: string
 *               contact_email:
 *                 type: string
 *                 format: email
 *               owner_admin_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tenant created successfully
 */
router.post(
  "/tenants",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("name").notEmpty().withMessage("Tenant name is required"),
    body("slug")
      .matches(/^[a-z0-9-]+$/)
      .withMessage("Tenant slug must contain only lowercase letters, numbers, and hyphens"),
    body("contact_email")
      .optional()
      .isEmail()
      .withMessage("Contact email must be valid"),
    validate,
  ],
  auditLogger("create_tenant", "tenant"),
  platformController.createTenant,
);

/**
 * @swagger
 * /platform/tenants/{id}/status:
 *   patch:
 *     summary: Update tenant status
 *     tags: [Platform]
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
 *         description: Tenant updated successfully
 */
router.patch(
  "/tenants/:id/status",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("update_tenant_status", "tenant"),
  platformController.updateTenantStatus,
);

router.get(
  "/tenants/:id/billing",
  authenticateAdmin,
  requireSuperAdmin,
  billingController.getPlatformTenantBilling,
);

/**
 * @swagger
 * /platform/testimonials:
 *   get:
 *     summary: List testimonials for moderation
 *     tags: [Platform]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Testimonials retrieved successfully
 *   post:
 *     summary: Create testimonial
 *     tags: [Platform]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Testimonial created successfully
 */
router.get(
  "/testimonials",
  authenticateAdmin,
  requireSuperAdmin,
  platformTestimonialController.listTestimonials,
);

router.post(
  "/testimonials",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("author_name").notEmpty().withMessage("Author name is required"),
    body("author_role").notEmpty().withMessage("Author role is required"),
    body("institution_name").notEmpty().withMessage("Institution name is required"),
    body("quote").notEmpty().withMessage("Quote is required"),
    body("rating")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("status")
      .optional()
      .isIn(["draft", "pending_review", "published", "rejected"])
      .withMessage("Valid testimonial status is required"),
    validate,
  ],
  auditLogger("create_testimonial", "testimonials"),
  platformTestimonialController.createTestimonial,
);

/**
 * @swagger
 * /platform/testimonials/{id}:
 *   patch:
 *     summary: Update testimonial
 *     tags: [Platform]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Testimonial updated successfully
 */
router.patch(
  "/testimonials/:id",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("rating")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("status")
      .optional()
      .isIn(["draft", "pending_review", "published", "rejected"])
      .withMessage("Valid testimonial status is required"),
    validate,
  ],
  auditLogger("update_testimonial", "testimonials"),
  platformTestimonialController.updateTestimonial,
);

module.exports = router;
