const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const adminController = require("../controllers/adminController");
const tenantAdminController = require("../controllers/tenantAdminController");
const {
  authenticateAdmin,
  requireSuperAdmin,
  requireTenantAdmin,
  requirePermission,
} = require("../middleware/auth");
const {
  requireTenantAccess,
  requireTenantContext,
  requireTenantFeature,
} = require("../middleware/tenantContext");
const { adminLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validator");
const auditLogger = require("../middleware/auditLogger");

const tenantAdminMiddlewares = [
  authenticateAdmin,
  requireTenantAccess,
  requireTenantAdmin,
];

/**
 * @swagger
 * /admin/upload-students:
 *   post:
 *     summary: Upload students from CSV
 *     description: Bulk upload students from parsed CSV data. Creates student records with automatic college/department assignment.
 *     tags: [Admin - Students]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [csv_data]
 *             properties:
 *               csv_data:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     matric_no:
 *                       type: string
 *                     full_name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     college:
 *                       type: string
 *                     department:
 *                       type: string
 *                     level:
 *                       type: string
 *     responses:
 *       200:
 *         description: Upload results with created, skipped, and failed counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 results:
 *                   type: object
 *                   properties:
 *                     created:
 *                       type: integer
 *                     skipped:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Validation error
 */
router.post(
  "/upload-students",
  ...tenantAdminMiddlewares,
  adminLimiter,
  [
    body("csv_data").isArray().withMessage("CSV data must be an array"),
    validate,
  ],
  auditLogger("upload_students", "students"),
  adminController.uploadStudents,
);

/**
 * @swagger
 * /admin/create-session:
 *   post:
 *     summary: Create a new voting session
 *     description: Create a voting session with category names, top-level candidates, eligibility rules, location bounds, and time range.
 *     tags: [Admin - Sessions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, start_time, end_time, categories, location]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Student Union Election 2025
 *               description:
 *                 type: string
 *               start_time:
 *                 type: string
 *                 format: date-time
 *               end_time:
 *                 type: string
 *                 format: date-time
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *               location:
 *                 $ref: '#/components/schemas/Location'
 *               eligible_college:
 *                 type: string
 *               eligible_departments:
 *                 type: array
 *                 items:
 *                   type: string
 *               eligible_levels:
 *                 type: array
 *                 items:
 *                   type: string
 *               is_off_campus_allowed:
 *                 type: boolean
 *                 default: false
 *               candidates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, position, photo_url]
 *                   properties:
 *                     name:
 *                       type: string
 *                     position:
 *                       type: string
 *                     photo_url:
 *                       type: string
 *                     bio:
 *                       type: string
 *                     manifesto:
 *                       type: string
 *     responses:
 *       201:
 *         description: Session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 session:
 *                   $ref: '#/components/schemas/VotingSession'
 *       400:
 *         description: Validation error
 */
router.post(
  "/create-session",
  ...tenantAdminMiddlewares,
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("start_time").isISO8601().withMessage("Valid start time is required"),
    body("end_time").isISO8601().withMessage("Valid end time is required"),
    body("categories").isArray().withMessage("Categories must be an array"),
    body("location").isObject().withMessage("Location is required"),
    validate,
  ],
  auditLogger("create_session", "sessions"),
  adminController.createSession,
);

/**
 * @swagger
 * /admin/update-session/{id}:
 *   patch:
 *     summary: Update a voting session
 *     description: Update session details. Only allowed before the session starts or for limited fields during active session.
 *     tags: [Admin - Sessions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Voting session ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               start_time:
 *                 type: string
 *                 format: date-time
 *               end_time:
 *                 type: string
 *                 format: date-time
 *               categories:
 *                 type: array
 *                 items:
 *                   type: object
 *               location:
 *                 $ref: '#/components/schemas/Location'
 *               is_off_campus_allowed:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Session updated successfully
 *       400:
 *         description: Cannot modify active/ended session
 *       404:
 *         description: Session not found
 */
router.patch(
  "/update-session/:id",
  ...tenantAdminMiddlewares,
  auditLogger("update_session", "sessions"),
  adminController.updateSession,
);

/**
 * @swagger
 * /admin/delete-session/{id}:
 *   delete:
 *     summary: Delete a voting session
 *     description: Permanently delete a voting session and all associated votes. Only allowed for sessions that haven't started.
 *     tags: [Admin - Sessions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Voting session ID
 *     responses:
 *       200:
 *         description: Session deleted successfully
 *       400:
 *         description: Cannot delete active session
 *       404:
 *         description: Session not found
 */
router.delete(
  "/delete-session/:id",
  ...tenantAdminMiddlewares,
  auditLogger("delete_session", "sessions"),
  adminController.deleteSession,
);

/**
 * @swagger
 * /admin/sessions/{id}/candidates:
 *   post:
 *     summary: Create a candidate for a session
 *     description: Create a new candidate inside an upcoming voting session.
 *     tags: [Admin - Candidates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Voting session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, position, photo_url]
 *             properties:
 *               name:
 *                 type: string
 *               position:
 *                 type: string
 *               photo_url:
 *                 type: string
 *               bio:
 *                 type: string
 *               manifesto:
 *                 type: string
 *     responses:
 *       201:
 *         description: Candidate created
 *       403:
 *         description: Candidate mutations are locked for active or ended sessions
 *       404:
 *         description: Session not found
 */
router.post(
  "/sessions/:id/candidates",
  ...tenantAdminMiddlewares,
  [
    body("name").notEmpty().withMessage("Candidate name is required"),
    body("position").notEmpty().withMessage("Candidate position is required"),
    body("photo_url").notEmpty().withMessage("Candidate photo is required"),
    validate,
  ],
  auditLogger("create_candidate", "candidates"),
  adminController.createCandidate,
);

/**
 * @swagger
 * /admin/candidates:
 *   get:
 *     summary: List candidates
 *     description: Retrieve candidates across sessions with optional filters for session, search, category, session status, and pagination.
 *     tags: [Admin - Candidates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: session_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: position
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, active, ended]
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
 *         description: Candidate directory response
 */
router.get(
  "/candidates",
  ...tenantAdminMiddlewares,
  adminController.listCandidates,
);

/**
 * @swagger
 * /admin/candidates/{id}:
 *   get:
 *     summary: Get candidate by ID
 *     description: Retrieve a single candidate's details including vote count and session info.
 *     tags: [Admin - Candidates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Candidate ID (ObjectId within session categories)
 *     responses:
 *       200:
 *         description: Candidate details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 candidate:
 *                   $ref: '#/components/schemas/Candidate'
 *       404:
 *         description: Candidate not found
 */
router.get(
  "/candidates/:id",
  ...tenantAdminMiddlewares,
  adminController.getCandidateById,
);

/**
 * @swagger
 * /admin/candidates/{id}:
 *   patch:
 *     summary: Update a candidate
 *     description: Update candidate details such as name, photo, or manifesto.
 *     tags: [Admin - Candidates]
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
 *               photo_url:
 *                 type: string
 *               manifesto:
 *                 type: string
 *     responses:
 *       200:
 *         description: Candidate updated
 *       404:
 *         description: Candidate not found
 */
router.patch(
  "/candidates/:id",
  ...tenantAdminMiddlewares,
  auditLogger("update_candidate", "candidates"),
  adminController.updateCandidate,
);

/**
 * @swagger
 * /admin/candidates/{id}:
 *   delete:
 *     summary: Delete a candidate
 *     description: Remove a candidate from a voting session category.
 *     tags: [Admin - Candidates]
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
 *         description: Candidate deleted
 *       404:
 *         description: Candidate not found
 */
router.delete(
  "/candidates/:id",
  ...tenantAdminMiddlewares,
  auditLogger("delete_candidate", "candidates"),
  adminController.deleteCandidate,
);

/**
 * @swagger
 * /admin/remove-department:
 *   delete:
 *     summary: Remove students by department
 *     description: Delete or deactivate all students belonging to specified departments.
 *     tags: [Admin - Students]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [departments]
 *             properties:
 *               departments:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of department names to remove
 *     responses:
 *       200:
 *         description: Students removed
 *       400:
 *         description: Departments list required
 */
router.delete(
  "/remove-department",
  ...tenantAdminMiddlewares,
  [
    body("departments").notEmpty().withMessage("Departments required"),
    validate,
  ],
  auditLogger("remove_department", "students"),
  adminController.removeDepartment,
);

/**
 * @swagger
 * /admin/cleanup-all:
 *   delete:
 *     summary: Cleanup all sessions and votes
 *     description: Permanently delete all voting sessions and votes from the system. Super admin only. Irreversible operation.
 *     tags: [Admin - System]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions and votes cleaned up
 *       403:
 *         description: Super admin access required
 */
router.delete(
  "/cleanup-all",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("cleanup_all", "system"),
  adminController.cleanupAll,
);

/**
 * @swagger
 * /admin/create-admin:
 *   post:
 *     summary: Create a new admin
 *     description: Register a new admin account. Super admin only.
 *     tags: [Admin - Admins]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, full_name]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               full_name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, super_admin]
 *                 default: admin
 *     responses:
 *       201:
 *         description: Admin created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 admin:
 *                   $ref: '#/components/schemas/Admin'
 *       400:
 *         description: Email already in use
 *       403:
 *         description: Super admin access required
 */
router.post(
  "/create-admin",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("full_name").notEmpty().withMessage("Full name is required"),
    validate,
  ],
  auditLogger("create_admin", "admins"),
  adminController.createAdmin,
);

/**
 * @swagger
 * /admin/students:
 *   get:
 *     summary: Get all students with filters
 *     description: Retrieve paginated list of students with optional filters by college, department, level, search query.
 *     tags: [Admin - Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or matric number
 *       - in: query
 *         name: college
 *         schema:
 *           type: string
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Paginated list of students
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 students:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Student'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get("/students", ...tenantAdminMiddlewares, adminController.getStudents);
router.get(
  "/participants",
  ...tenantAdminMiddlewares,
  adminController.getStudents,
);
router.get(
  "/students/overview",
  ...tenantAdminMiddlewares,
  adminController.getStudentsOverview,
);
router.get(
  "/participants/overview",
  ...tenantAdminMiddlewares,
  adminController.getStudentsOverview,
);

router.patch(
  "/participants/bulk-update",
  ...tenantAdminMiddlewares,
  auditLogger("bulk_update_students", "students"),
  adminController.bulkUpdateStudents,
);

/**
 * @swagger
 * /admin/students/{id}:
 *   get:
 *     summary: Get single student by ID
 *     description: Retrieve detailed student information including voting history.
 *     tags: [Admin - Students]
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
 *         description: Student details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 student:
 *                   $ref: '#/components/schemas/Student'
 *       404:
 *         description: Student not found
 */
router.get(
  "/students/:id",
  ...tenantAdminMiddlewares,
  adminController.getStudentById,
);
router.get(
  "/participants/:id",
  ...tenantAdminMiddlewares,
  adminController.getStudentById,
);

/**
 * @swagger
 * /admin/students/{id}:
 *   patch:
 *     summary: Update student details
 *     description: Update student profile information.
 *     tags: [Admin - Students]
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
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               level:
 *                 type: string
 *                 enum: ['100', '200', '300', '400', '500', '600']
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Student updated
 *       404:
 *         description: Student not found
 */
router.patch(
  "/students/:id",
  ...tenantAdminMiddlewares,
  [
    body("full_name")
      .optional()
      .notEmpty()
      .withMessage("Full name cannot be empty"),
    body("email").optional().isEmail().withMessage("Valid email is required"),
    body("level")
      .optional()
      .isIn(["100", "200", "300", "400", "500", "600"])
      .withMessage("Invalid level"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_student", "students"),
  adminController.updateStudent,
);
router.patch(
  "/participants/:id",
  ...tenantAdminMiddlewares,
  [
    body("full_name")
      .optional()
      .notEmpty()
      .withMessage("Full name cannot be empty"),
    body("email").optional().isEmail().withMessage("Valid email is required"),
    body("level")
      .optional()
      .isIn(["100", "200", "300", "400", "500", "600"])
      .withMessage("Invalid level"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_student", "students"),
  adminController.updateStudent,
);

/**
 * @swagger
 * /admin/students/{id}/activate:
 *   patch:
 *     summary: Mark student active
 *     description: Set a student's active status to true.
 *     tags: [Admin - Students]
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
 *         description: Student marked active
 *       404:
 *         description: Student not found
 */
router.patch(
  "/students/:id/activate",
  ...tenantAdminMiddlewares,
  auditLogger("activate_student", "students"),
  adminController.activateStudent,
);
router.patch(
  "/participants/:id/activate",
  ...tenantAdminMiddlewares,
  auditLogger("activate_student", "students"),
  adminController.activateStudent,
);

/**
 * @swagger
 * /admin/students/{id}/deactivate:
 *   patch:
 *     summary: Mark student inactive
 *     description: Set a student's active status to false.
 *     tags: [Admin - Students]
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
 *         description: Student marked inactive
 *       404:
 *         description: Student not found
 */
router.patch(
  "/students/:id/deactivate",
  ...tenantAdminMiddlewares,
  auditLogger("deactivate_student", "students"),
  adminController.deactivateStudent,
);
router.patch(
  "/participants/:id/deactivate",
  ...tenantAdminMiddlewares,
  auditLogger("deactivate_student", "students"),
  adminController.deactivateStudent,
);

/**
 * @swagger
 * /admin/students/{id}:
 *   delete:
 *     summary: Delete or deactivate student
 *     description: Soft-delete (deactivate) or permanently remove a student.
 *     tags: [Admin - Students]
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
 *         description: Student deleted/deactivated
 *       404:
 *         description: Student not found
 */
router.delete(
  "/students/:id",
  ...tenantAdminMiddlewares,
  auditLogger("delete_student", "students"),
  adminController.deleteStudent,
);
router.delete(
  "/participants/:id",
  ...tenantAdminMiddlewares,
  auditLogger("delete_student", "students"),
  adminController.deleteStudent,
);

/**
 * @swagger
 * /admin/students/bulk-update:
 *   patch:
 *     summary: Bulk update students
 *     description: Update multiple student records at once (activate/deactivate, change level, etc.).
 *     tags: [Admin - Students]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               student_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               update:
 *                 type: object
 *                 properties:
 *                   is_active:
 *                     type: boolean
 *                   level:
 *                     type: string
 *     responses:
 *       200:
 *         description: Bulk update results
 *       400:
 *         description: Invalid request
 */
router.patch(
  "/students/bulk-update",
  ...tenantAdminMiddlewares,
  auditLogger("bulk_update_students", "students"),
  adminController.bulkUpdateStudents,
);

/**
 * @swagger
 * /admin/colleges/{collegeId}/students:
 *   get:
 *     summary: Get all students in a college
 *     description: Retrieve paginated students filtered by college.
 *     tags: [Admin - Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collegeId
 *         required: true
 *         schema:
 *           type: string
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
 *         description: List of students in the college
 *       404:
 *         description: College not found
 */
router.get(
  "/colleges/:collegeId/students",
  ...tenantAdminMiddlewares,
  adminController.getStudentsByCollege,
);

/**
 * @swagger
 * /admin/colleges/{collegeId}/students/statistics:
 *   get:
 *     summary: Get student statistics for a college
 *     description: Get statistics about students grouped by department, level, and status for a specific college.
 *     tags: [Admin - Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collegeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student statistics for the college
 *       404:
 *         description: College not found
 */
router.get(
  "/colleges/:collegeId/students/statistics",
  ...tenantAdminMiddlewares,
  adminController.getStudentStatisticsByCollege,
);

/**
 * @swagger
 * /admin/colleges/{collegeId}/departments/{departmentId}/students:
 *   get:
 *     summary: Get all students in a department
 *     description: Retrieve paginated students for a specific department within a college.
 *     tags: [Admin - Students]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collegeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema:
 *           type: string
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
 *         description: List of students in the department
 *       404:
 *         description: College or department not found
 */
router.get(
  "/colleges/:collegeId/departments/:departmentId/students",
  ...tenantAdminMiddlewares,
  adminController.getStudentsByDepartment,
);

/**
 * @swagger
 * /admin/sessions:
 *   get:
 *     summary: Get all sessions
 *     description: Retrieve all voting sessions with pagination and optional status filter.
 *     tags: [Admin - Sessions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [upcoming, active, ended]
 *     responses:
 *       200:
 *         description: List of voting sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VotingSession'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get("/sessions", ...tenantAdminMiddlewares, adminController.getSessions);

router.get(
  "/sessions/summary",
  ...tenantAdminMiddlewares,
  adminController.getSessionsSummary,
);

/**
 * @swagger
 * /admin/analytics/overview:
 *   get:
 *     summary: Get advanced analytics overview
 *     description: Retrieve turnout, participation, top voter, and recent activity analytics. Requires a plan with advanced analytics.
 *     tags: [Admin - Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Advanced analytics overview
 *       403:
 *         description: Feature not enabled for the tenant plan
 */
router.get(
  "/analytics/overview",
  ...tenantAdminMiddlewares,
  requireTenantFeature("advanced_analytics"),
  adminController.getAnalyticsOverview,
);

/**
 * @swagger
 * /admin/sessions/{id}:
 *   get:
 *     summary: Get session by ID with statistics
 *     description: Retrieve detailed session information including vote counts, category stats, and participation metrics.
 *     tags: [Admin - Sessions]
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
 *         description: Session details with statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   $ref: '#/components/schemas/VotingSession'
 *                 statistics:
 *                   type: object
 *       404:
 *         description: Session not found
 */
router.get(
  "/sessions/:id",
  ...tenantAdminMiddlewares,
  adminController.getSessionById,
);

/**
 * @swagger
 * /admin/session-stats/{id}:
 *   get:
 *     summary: Get session statistics
 *     description: Get detailed statistics for a voting session including turnout, per-category breakdowns, and demographic analysis.
 *     tags: [Admin - Sessions]
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
 *         description: Session statistics
 *       404:
 *         description: Session not found
 */
router.get(
  "/session-stats/:id",
  ...tenantAdminMiddlewares,
  adminController.getSessionStats,
);

/**
 * @swagger
 * /admin/analytics/sessions/{id}:
 *   get:
 *     summary: Get advanced analytics for a session
 *     description: Retrieve detailed per-session analytics and candidate breakdown for advanced analytics tenants.
 *     tags: [Admin - Analytics]
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
 *         description: Advanced session analytics
 *       403:
 *         description: Feature not enabled for the tenant plan
 */
router.get(
  "/analytics/sessions/:id",
  ...tenantAdminMiddlewares,
  requireTenantFeature("advanced_analytics"),
  adminController.getAdvancedSessionAnalytics,
);

/**
 * @swagger
 * /admin/admin-users/roles-catalog:
 *   get:
 *     summary: Get tenant admin role catalog
 *     description: Returns the supported tenant admin roles and their default permission bundles for the active tenant.
 *     tags: [Admin - Tenant Admin Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant admin role catalog
 */
router.get(
  "/admin-users/roles-catalog",
  ...tenantAdminMiddlewares,
  tenantAdminController.getRoleCatalog,
);

/**
 * @swagger
 * /admin/admin-users/onboarding:
 *   get:
 *     summary: Get tenant onboarding details
 *     description: Returns tenant contact name and email for auto-populating admin invitation forms.
 *     tags: [Admin - Tenant Admin Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant onboarding details
 */
router.get(
  "/admin-users/onboarding",
  ...tenantAdminMiddlewares,
  tenantAdminController.getOnboardingDetails,
);

/**
 * @swagger
 * /admin/admin-users/overview:
 *   get:
 *     summary: Get tenant admin overview
 *     description: Returns tenant-scoped admin membership totals and current role distribution.
 *     tags: [Admin - Tenant Admin Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant admin overview
 */
router.get(
  "/admin-users/overview",
  ...tenantAdminMiddlewares,
  tenantAdminController.getOverview,
);

/**
 * @swagger
 * /admin/admin-users:
 *   get:
 *     summary: List tenant admin users
 *     description: Returns tenant-scoped admin memberships with optional search, role, active state, and pagination filters.
 *     tags: [Admin - Tenant Admin Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [owner, admin, support, analyst]
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenant admin membership list
 *   post:
 *     summary: Create or attach a tenant admin user
 *     description: Creates a new global admin identity if the email does not exist, then attaches it to the active tenant with the chosen role and permissions.
 *     tags: [Admin - Tenant Admin Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, full_name]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               full_name:
 *                 type: string
 *               password:
 *                 type: string
 *                 description: Required when creating a brand-new admin identity.
 *               role:
 *                 type: string
 *                 enum: [owner, admin, support, analyst]
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Tenant admin user created
 *       409:
 *         description: Admin already assigned to the active tenant
 */
router.get(
  "/admin-users",
  ...tenantAdminMiddlewares,
  tenantAdminController.listMembers,
);

router.get(
  "/admin-users/:id",
  ...tenantAdminMiddlewares,
  tenantAdminController.getMemberById,
);

router.post(
  "/admin-users",
  ...tenantAdminMiddlewares,
  requirePermission("admins.manage", "tenant.manage"),
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .optional()
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("full_name").notEmpty().withMessage("Full name is required"),
    body("role")
      .optional()
      .isIn(["owner", "admin", "support", "analyst"])
      .withMessage("Valid tenant role is required"),
    body("permissions").optional().isArray(),
    validate,
  ],
  auditLogger("create_tenant_admin_member", "admin_users"),
  tenantAdminController.createMember,
);

/**
 * @swagger
 * /admin/admin-users/{id}:
 *   get:
 *     summary: Get tenant admin user by membership ID
 *     description: Returns a single tenant-scoped admin membership and its linked admin identity data.
 *     tags: [Admin - Tenant Admin Users]
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
 *         description: Tenant admin membership details
 *       404:
 *         description: Membership not found
 *   patch:
 *     summary: Update tenant admin membership
 *     description: Updates tenant role, permissions, activation state, or linked admin full name for the active tenant.
 *     tags: [Admin - Tenant Admin Users]
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
 *               full_name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [owner, admin, support, analyst]
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Tenant admin membership updated
 *       404:
 *         description: Membership not found
 *   delete:
 *     summary: Remove tenant admin membership
 *     description: Removes tenant access for the linked admin identity within the active tenant.
 *     tags: [Admin - Tenant Admin Users]
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
 *         description: Tenant admin membership removed
 *       404:
 *         description: Membership not found
 */
router.patch(
  "/admin-users/:id",
  ...tenantAdminMiddlewares,
  requirePermission("admins.manage", "tenant.manage"),
  [
    body("full_name")
      .optional()
      .notEmpty()
      .withMessage("Full name cannot be empty"),
    body("role")
      .optional()
      .isIn(["owner", "admin", "support", "analyst"])
      .withMessage("Valid tenant role is required"),
    body("permissions").optional().isArray(),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_tenant_admin_member", "admin_users"),
  tenantAdminController.updateMember,
);

router.delete(
  "/admin-users/:id",
  ...tenantAdminMiddlewares,
  requirePermission("admins.manage", "tenant.manage"),
  auditLogger("delete_tenant_admin_member", "admin_users"),
  tenantAdminController.deleteMember,
);

/**
 * @swagger
 * /admin/admins:
 *   get:
 *     summary: Get all admins
 *     description: Retrieve paginated list of admin accounts with optional filters. Super admin only.
 *     tags: [Admin - Admins]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, super_admin]
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of admins
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 admins:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Admin'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       403:
 *         description: Super admin access required
 */
router.get(
  "/admins",
  authenticateAdmin,
  requireSuperAdmin,
  adminController.getAllAdmins,
);

/**
 * @swagger
 * /admin/admins/{id}:
 *   get:
 *     summary: Get admin by ID
 *     description: Retrieve single admin details. Super admin only.
 *     tags: [Admin - Admins]
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
 *         description: Admin details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 admin:
 *                   $ref: '#/components/schemas/Admin'
 *       403:
 *         description: Super admin access required
 *       404:
 *         description: Admin not found
 */
router.get(
  "/admins/:id",
  authenticateAdmin,
  requireSuperAdmin,
  adminController.getAdminById,
);

/**
 * @swagger
 * /admin/admins/{id}:
 *   patch:
 *     summary: Update admin details
 *     description: Update admin profile, role, or status. Super admin only. Cannot demote yourself.
 *     tags: [Admin - Admins]
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
 *               full_name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, super_admin]
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Admin updated
 *       403:
 *         description: Super admin access required
 *       404:
 *         description: Admin not found
 */
router.patch(
  "/admins/:id",
  authenticateAdmin,
  requireSuperAdmin,
  [
    body("full_name")
      .optional()
      .notEmpty()
      .withMessage("Full name cannot be empty"),
    body("role")
      .optional()
      .isIn(["admin", "super_admin"])
      .withMessage("Invalid role"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be boolean"),
    validate,
  ],
  auditLogger("update_admin", "admins"),
  adminController.updateAdmin,
);

/**
 * @swagger
 * /admin/admins/{id}:
 *   delete:
 *     summary: Delete or deactivate admin
 *     description: Soft-delete or permanently remove an admin. Cannot delete yourself. Super admin only.
 *     tags: [Admin - Admins]
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
 *         description: Admin deleted/deactivated
 *       403:
 *         description: Cannot delete yourself or insufficient permissions
 *       404:
 *         description: Admin not found
 */
router.delete(
  "/admins/:id",
  authenticateAdmin,
  requireSuperAdmin,
  auditLogger("delete_admin", "admins"),
  adminController.deleteAdmin,
);

/**
 * @swagger
 * /admin/admin-stats:
 *   get:
 *     summary: Get admin statistics
 *     description: Get aggregated statistics about admin accounts (total, active, by role). Super admin only.
 *     tags: [Admin - Admins]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Admin statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 active:
 *                   type: integer
 *                 by_role:
 *                   type: object
 *       403:
 *         description: Super admin access required
 */
router.get(
  "/admin-stats",
  authenticateAdmin,
  requireSuperAdmin,
  adminController.getAdminStats,
);

module.exports = router;
