const express = require("express");
const { body } = require("express-validator");
const publicController = require("../controllers/publicController");
const { apiLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validator");

const router = express.Router();

/**
 * @swagger
 * /public/landing:
 *   get:
 *     summary: Get public landing page data
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Public landing data retrieved successfully
 */
router.get("/landing", apiLimiter, publicController.getLandingData);

/**
 * @swagger
 * /public/organizations:
 *   get:
 *     summary: List active organizations for portal selection
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional organization search term
 *     responses:
 *       200:
 *         description: Organization discovery payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OrganizationDiscoveryItem'
 */
router.get("/organizations", apiLimiter, publicController.listOrganizations);

/**
 * @swagger
 * /public/organizations/{slug}:
 *   get:
 *     summary: Get a single organization by slug
 *     tags: [Public]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organization discovery payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organization:
 *                   $ref: '#/components/schemas/OrganizationDiscoveryItem'
 *       404:
 *         description: Organization not found
 */
router.get(
  "/organizations/:slug",
  apiLimiter,
  publicController.getOrganizationBySlug,
);

/**
 * @swagger
 * /public/testimonials:
 *   get:
 *     summary: Get published testimonials
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Published testimonials retrieved successfully
 */
router.get("/testimonials", apiLimiter, publicController.listTestimonials);
router.post(
  "/testimonials/submissions",
  apiLimiter,
  [
    body("author_name").notEmpty().withMessage("Author name is required"),
    body("author_role").notEmpty().withMessage("Author role is required"),
    body("institution_name")
      .notEmpty()
      .withMessage("Institution name is required"),
    body("quote")
      .isLength({ min: 20, max: 600 })
      .withMessage("Quote must be between 20 and 600 characters"),
    body("rating")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("source")
      .optional()
      .isIn(["public", "tenant"])
      .withMessage("Valid testimonial source is required"),
    validate,
  ],
  publicController.submitTestimonial,
);

/**
 * @swagger
 * /public/tenant-applications:
 *   post:
 *     summary: Submit tenant application
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [institution_name, slug, contact_name, contact_email]
 *             properties:
 *               institution_name:
 *                 type: string
 *               slug:
 *                 type: string
 *               primary_domain:
 *                 type: string
 *               contact_name:
 *                 type: string
 *               contact_email:
 *                 type: string
 *                 format: email
 *               contact_phone:
 *                 type: string
 *               student_count_estimate:
 *                 type: integer
 *               admin_count_estimate:
 *                 type: integer
 *               notes:
 *                 type: string
 *               demo_requested:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Tenant application submitted successfully
 */
router.post(
  "/applications",
  apiLimiter,
  [
    body("institution_name")
      .notEmpty()
      .withMessage("Institution name is required"),
    body("slug")
      .matches(/^[a-z0-9-]+$/)
      .withMessage(
        "Tenant slug must contain only lowercase letters, numbers, and hyphens",
      ),
    body("contact_name").notEmpty().withMessage("Contact name is required"),
    body("contact_email").isEmail().withMessage("Contact email must be valid"),
    body("student_count_estimate")
      .optional({ nullable: true, checkFalsy: true })
      .isInt({ min: 0 })
      .withMessage("Student estimate must be zero or greater"),
    body("admin_count_estimate")
      .optional({ nullable: true, checkFalsy: true })
      .isInt({ min: 0 })
      .withMessage("Admin estimate must be zero or greater"),
    body("demo_requested")
      .optional()
      .isBoolean()
      .withMessage("demo_requested must be boolean"),
    validate,
  ],
  publicController.submitTenantApplication,
);

router.patch(
  "/applications/:reference",
  apiLimiter,
  [
    body("institution_name")
      .notEmpty()
      .withMessage("Institution name is required"),
    body("slug")
      .matches(/^[a-z0-9-]+$/)
      .withMessage(
        "Tenant slug must contain only lowercase letters, numbers, and hyphens",
      ),
    body("contact_name").notEmpty().withMessage("Contact name is required"),
    body("contact_email").isEmail().withMessage("Contact email must be valid"),
    validate,
  ],
  publicController.updateTenantApplication,
);

router.get(
  "/applications/status",
  apiLimiter,
  publicController.getTenantApplicationStatus,
);

module.exports = router;
