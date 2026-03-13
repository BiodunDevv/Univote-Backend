const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const collegeController = require("../controllers/collegeController");
const { authenticateAdmin, requireSuperAdmin } = require("../middleware/auth");
const validate = require("../middleware/validator");
const auditLogger = require("../middleware/auditLogger");

/**
 * @swagger
 * /admin/colleges/statistics:
 *   get:
 *     summary: Get college statistics
 *     description: Get aggregated statistics across all colleges, including total students, department counts, and activity status.
 *     tags: [Colleges]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: College statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     total_colleges:
 *                       type: integer
 *                     active_colleges:
 *                       type: integer
 *                     inactive_colleges:
 *                       type: integer
 *                     total_departments:
 *                       type: integer
 *                     total_students:
 *                       type: integer
 *                     colleges_breakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           code:
 *                             type: string
 *                           department_count:
 *                             type: integer
 *                           student_count:
 *                             type: integer
 *                           is_active:
 *                             type: boolean
 *                 cached:
 *                   type: boolean
 */
router.get(
  "/colleges/statistics",
  authenticateAdmin,
  collegeController.getCollegeStatistics,
);

/**
 * @swagger
 * /admin/departments/search:
 *   get:
 *     summary: Search departments across all colleges
 *     description: Search for departments by name or code across all colleges.
 *     tags: [Colleges]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query for department name or code
 *     responses:
 *       200:
 *         description: Matching departments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 departments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       college_name:
 *                         type: string
 */
router.get(
  "/departments/search",
  authenticateAdmin,
  collegeController.searchDepartments,
);

router.get(
  "/departments",
  authenticateAdmin,
  collegeController.getAllDepartments,
);

router.get(
  "/departments/overview",
  authenticateAdmin,
  collegeController.getDepartmentOverview,
);

/**
 * @swagger
 * /admin/colleges:
 *   post:
 *     summary: Create a new college
 *     description: Create a college with optional departments. Super admin only.
 *     tags: [Colleges]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code]
 *             properties:
 *               name:
 *                 type: string
 *                 example: College of Science
 *               code:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 10
 *                 example: COS
 *               description:
 *                 type: string
 *               dean_name:
 *                 type: string
 *               dean_email:
 *                 type: string
 *                 format: email
 *               departments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, code]
 *                   properties:
 *                     name:
 *                       type: string
 *                     code:
 *                       type: string
 *                       minLength: 2
 *                       maxLength: 5
 *                     available_levels:
 *                       type: array
 *                       items:
 *                         type: string
 *     responses:
 *       201:
 *         description: College created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 college:
 *                   $ref: '#/components/schemas/College'
 *       400:
 *         description: College code/name already exists
 *       403:
 *         description: Super admin access required
 */
router.post(
  "/colleges",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("name").notEmpty().withMessage("College name is required"),
    body("code")
      .notEmpty()
      .withMessage("College code is required")
      .isLength({ min: 3, max: 10 })
      .withMessage("College code must be 3-10 characters"),
    body("description").optional().isString(),
    body("dean_name").optional().isString(),
    body("dean_email").optional().isEmail().withMessage("Invalid dean email"),
    body("departments").optional().isArray(),
    body("departments.*.name")
      .optional()
      .notEmpty()
      .withMessage("Department name is required"),
    body("departments.*.code")
      .optional()
      .notEmpty()
      .withMessage("Department code is required")
      .isLength({ min: 2, max: 5 })
      .withMessage("Department code must be 2-5 characters"),
    body("departments.*.available_levels")
      .optional()
      .isArray()
      .withMessage("Available levels must be an array"),
    validate,
  ],
  auditLogger("create_college", "colleges"),
  collegeController.createCollege,
);

/**
 * @swagger
 * /admin/colleges:
 *   get:
 *     summary: Get all colleges
 *     description: Retrieve all colleges with their departments.
 *     tags: [Colleges]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: include_inactive
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: List of colleges
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 colleges:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/College'
 */
router.get("/colleges", authenticateAdmin, collegeController.getAllColleges);

/**
 * @swagger
 * /admin/colleges/{id}:
 *   get:
 *     summary: Get college by ID
 *     description: Retrieve a single college with all its departments.
 *     tags: [Colleges]
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
 *         description: College details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 college:
 *                   $ref: '#/components/schemas/College'
 *       404:
 *         description: College not found
 */
router.get(
  "/colleges/:id",
  authenticateAdmin,
  collegeController.getCollegeById,
);

router.get(
  "/colleges/:id/stats",
  authenticateAdmin,
  collegeController.getCollegeDetailStats,
);

/**
 * @swagger
 * /admin/colleges/{id}:
 *   patch:
 *     summary: Update college
 *     description: Update college details. Super admin only.
 *     tags: [Colleges]
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
 *               code:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 10
 *               description:
 *                 type: string
 *               dean_name:
 *                 type: string
 *               dean_email:
 *                 type: string
 *                 format: email
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: College updated
 *       404:
 *         description: College not found
 *       403:
 *         description: Super admin access required
 */
router.patch(
  "/colleges/:id",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("name")
      .optional()
      .notEmpty()
      .withMessage("College name cannot be empty"),
    body("code")
      .optional()
      .isLength({ min: 3, max: 10 })
      .withMessage("College code must be 3-10 characters"),
    body("dean_email").optional().isEmail().withMessage("Invalid dean email"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_college", "colleges"),
  collegeController.updateCollege,
);

/**
 * @swagger
 * /admin/colleges/{id}:
 *   delete:
 *     summary: Delete college
 *     description: Permanently delete a college and all its departments. Super admin only.
 *     tags: [Colleges]
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
 *         description: College deleted
 *       404:
 *         description: College not found
 *       403:
 *         description: Super admin access required
 */
router.delete(
  "/colleges/:id",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("delete_college", "colleges"),
  collegeController.deleteCollege,
);

/**
 * @swagger
 * /admin/colleges/{id}/departments:
 *   post:
 *     summary: Add department to college
 *     description: Add a new department to an existing college. Super admin only.
 *     tags: [Colleges]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: College ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code]
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 5
 *               description:
 *                 type: string
 *               hod_name:
 *                 type: string
 *               hod_email:
 *                 type: string
 *                 format: email
 *               available_levels:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Department added
 *       400:
 *         description: Department code already exists
 *       404:
 *         description: College not found
 *       403:
 *         description: Super admin access required
 */
router.post(
  "/colleges/:id/departments",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("name").notEmpty().withMessage("Department name is required"),
    body("code")
      .notEmpty()
      .withMessage("Department code is required")
      .isLength({ min: 2, max: 5 })
      .withMessage("Department code must be 2-5 characters"),
    body("description").optional().isString(),
    body("hod_name").optional().isString(),
    body("hod_email").optional().isEmail().withMessage("Invalid HOD email"),
    body("available_levels")
      .optional()
      .isArray()
      .withMessage("Available levels must be an array"),
    validate,
  ],
  auditLogger("add_department", "departments"),
  collegeController.addDepartment,
);

/**
 * @swagger
 * /admin/colleges/{id}/departments:
 *   get:
 *     summary: Get all departments in a college
 *     description: Retrieve all departments belonging to a specific college.
 *     tags: [Colleges]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: College ID
 *     responses:
 *       200:
 *         description: List of departments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 departments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Department'
 *       404:
 *         description: College not found
 */
router.get(
  "/colleges/:id/departments",
  authenticateAdmin,
  collegeController.getDepartments,
);

/**
 * @swagger
 * /admin/colleges/{collegeId}/departments/{deptId}:
 *   get:
 *     summary: Get single department
 *     description: Retrieve a single department by its ID within a college.
 *     tags: [Colleges]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collegeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: deptId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Department details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 department:
 *                   $ref: '#/components/schemas/Department'
 *       404:
 *         description: College or department not found
 */
router.get(
  "/colleges/:collegeId/departments/:deptId",
  authenticateAdmin,
  collegeController.getDepartmentById,
);

/**
 * @swagger
 * /admin/colleges/{collegeId}/departments/{deptId}:
 *   patch:
 *     summary: Update department
 *     description: Update department details. Super admin only.
 *     tags: [Colleges]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collegeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: deptId
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
 *               code:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 5
 *               description:
 *                 type: string
 *               hod_name:
 *                 type: string
 *               hod_email:
 *                 type: string
 *                 format: email
 *               available_levels:
 *                 type: array
 *                 items:
 *                   type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Department updated
 *       404:
 *         description: College or department not found
 *       403:
 *         description: Super admin access required
 */
router.patch(
  "/colleges/:collegeId/departments/:deptId",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("name")
      .optional()
      .notEmpty()
      .withMessage("Department name cannot be empty"),
    body("code")
      .optional()
      .isLength({ min: 2, max: 5 })
      .withMessage("Department code must be 2-5 characters"),
    body("hod_email").optional().isEmail().withMessage("Invalid HOD email"),
    body("available_levels")
      .optional()
      .isArray()
      .withMessage("Available levels must be an array"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_department", "departments"),
  collegeController.updateDepartment,
);

/**
 * @swagger
 * /admin/colleges/{collegeId}/departments/{deptId}:
 *   delete:
 *     summary: Delete department
 *     description: Permanently remove a department from a college. Super admin only.
 *     tags: [Colleges]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collegeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: deptId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Department deleted
 *       404:
 *         description: College or department not found
 *       403:
 *         description: Super admin access required
 */
router.delete(
  "/colleges/:collegeId/departments/:deptId",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("delete_department", "departments"),
  collegeController.deleteDepartment,
);

module.exports = router;
