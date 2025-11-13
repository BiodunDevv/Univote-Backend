const bcrypt = require("bcryptjs");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const VotingSession = require("../models/VotingSession");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const faceppService = require("../services/faceppService");
const emailService = require("../services/emailService");
const constants = require("../config/constants");
const mongoose = require("mongoose");
const cacheService = require("../services/cacheService");

class AdminController {
  /**
   * Upload students from CSV
   * POST /api/admin/upload-students
   * Can be targeted to specific college/department/level or general upload
   */
  async uploadStudents(req, res) {
    try {
      const { csv_data, target_college, target_department, target_level } =
        req.body;

      if (!csv_data || !Array.isArray(csv_data)) {
        return res.status(400).json({ error: "Invalid CSV data format" });
      }

      // Validate target college and department if specified
      if (target_college || target_department) {
        const College = require("../models/College");

        if (target_college) {
          const collegeDoc = await College.findOne({ name: target_college });
          if (!collegeDoc) {
            return res.status(400).json({
              error: `College '${target_college}' not found`,
            });
          }

          if (target_department) {
            const deptExists = collegeDoc.departments.some(
              (d) => d.name === target_department
            );
            if (!deptExists) {
              return res.status(400).json({
                error: `Department '${target_department}' does not exist in ${target_college}`,
              });
            }
          }
        }
      }

      const results = {
        total: csv_data.length,
        created: 0,
        failed: 0,
        errors: [],
        target: {
          college: target_college || "all",
          department: target_department || "all",
          level: target_level || "all",
        },
      };

      // Hash default password once
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10)
      );
      const defaultPasswordHash = await bcrypt.hash(
        constants.defaultPassword,
        salt
      );

      for (const row of csv_data) {
        try {
          // Use target values if not provided in CSV
          const matric_no = row.matric_no;
          const full_name = row.full_name;
          const email = row.email;
          const department = row.department || target_department;
          const college = row.college || target_college;
          const level = row.level || target_level;

          // Validate required fields
          if (
            !matric_no ||
            !full_name ||
            !email ||
            !department ||
            !college ||
            !level
          ) {
            results.failed++;
            results.errors.push({
              matric_no: matric_no || "unknown",
              full_name: full_name || "unknown",
              error:
                "Missing required fields (matric_no, full_name, email, department, college, level)",
            });
            continue;
          }

          // Validate college and department exist
          const College = require("../models/College");
          const collegeDoc = await College.findOne({ name: college });

          if (!collegeDoc) {
            results.failed++;
            results.errors.push({
              matric_no,
              full_name,
              error: `College '${college}' not found`,
            });
            continue;
          }

          const deptDoc = collegeDoc.departments.find(
            (d) => d.name === department
          );
          if (!deptDoc) {
            results.failed++;
            results.errors.push({
              matric_no,
              full_name,
              error: `Department '${department}' does not exist in ${college}`,
            });
            continue;
          }

          // Validate level format first
          if (!["100", "200", "300", "400", "500", "600"].includes(level)) {
            results.failed++;
            results.errors.push({
              matric_no,
              full_name,
              error: `Invalid level '${level}'. Must be one of: 100, 200, 300, 400, 500, 600`,
            });
            continue;
          }

          // Check if department has available levels configured
          if (
            !deptDoc.available_levels ||
            deptDoc.available_levels.length === 0
          ) {
            results.failed++;
            results.errors.push({
              matric_no,
              full_name,
              error: `Department '${department}' in ${college} does not have available levels configured`,
            });
            continue;
          }

          // Debug: Log what we're checking
          console.log(`Checking level ${level} for ${department}:`, {
            availableLevels: deptDoc.available_levels,
            includes: deptDoc.available_levels.includes(level),
            levelType: typeof level,
            availableTypes: deptDoc.available_levels.map((l) => typeof l),
          });

          // Validate level is within department's available levels
          // Convert both to strings for comparison to avoid type mismatch
          if (
            !deptDoc.available_levels
              .map((l) => String(l))
              .includes(String(level))
          ) {
            const availableLevels = deptDoc.available_levels.sort(
              (a, b) => parseInt(a) - parseInt(b)
            );
            const minLevel = availableLevels[0];
            const maxLevel = availableLevels[availableLevels.length - 1];
            results.failed++;
            results.errors.push({
              matric_no,
              full_name,
              error: `Level ${level} is NOT available in ${department} (${college}). Available levels: ${availableLevels.join(
                ", "
              )}. Highest level: ${maxLevel}`,
            });
            continue;
          }

          // Check if student already exists (by matric_no, email, or both)
          const existingStudent = await Student.findOne({
            $or: [
              { matric_no: matric_no.toUpperCase() },
              { email: email.toLowerCase() },
            ],
          });

          if (existingStudent) {
            // Student already exists - return error with full details
            results.failed++;
            results.errors.push({
              matric_no,
              full_name,
              error: `Student already exists: ${existingStudent.full_name} (${existingStudent.matric_no}) in ${existingStudent.department}, ${existingStudent.college}, Level ${existingStudent.level}. Cannot upload duplicate student.`,
            });
            continue;
          }

          // Optional: Process facial registration if photo_url is provided
          let faceToken = null;
          let photoUrl = row.photo_url || null;

          if (photoUrl) {
            const faceDetection = await faceppService.detectFace(photoUrl);

            if (faceDetection.success) {
              faceToken = faceDetection.face_token;
            } else {
              // Face detection failed - log warning but continue without face data
              console.warn(
                `Face detection failed for ${matric_no}: ${faceDetection.error}`
              );
              results.errors.push({
                matric_no,
                full_name,
                warning: `Student created but face registration failed: ${faceDetection.error}`,
              });
            }
          }

          // Create new student (only if not exists)
          const student = new Student({
            matric_no: matric_no.toUpperCase(),
            full_name,
            email: email.toLowerCase(),
            password_hash: defaultPasswordHash,
            department,
            department_code: deptDoc.code,
            college,
            level,
            first_login: true,
            photo_url: photoUrl,
            face_token: faceToken,
          });

          await student.save();
          results.created++;

          // Welcome email will be sent after first login and password change
        } catch (error) {
          console.error("Error processing student:", error);
          results.failed++;
          results.errors.push({
            matric_no: row.matric_no || "unknown",
            full_name: row.full_name || "unknown",
            error: error.message,
          });
        }
      }

      res.json({
        message: "Student upload completed",
        results,
      });
    } catch (error) {
      console.error("Upload students error:", error);
      res.status(500).json({ error: "Failed to upload students" });
    }
  }

  /**
   * Create a new voting session
   * POST /api/admin/create-session
   */
  async createSession(req, res) {
    try {
      const {
        title,
        description,
        start_time,
        end_time,
        eligible_college,
        eligible_departments,
        eligible_levels,
        categories,
        location,
        is_off_campus_allowed,
        candidates,
      } = req.body;

      // Validate required fields
      if (!title || !start_time || !end_time || !categories || !location) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Create session (Face++ uses stateless verification, no pre-session setup needed)
      const session = new VotingSession({
        title,
        description,
        start_time: new Date(start_time),
        end_time: new Date(end_time),
        eligible_college: eligible_college || null,
        eligible_departments: eligible_departments || null,
        eligible_levels: eligible_levels || null,
        categories: categories || [],
        location: {
          lat: location.lat,
          lng: location.lng,
          radius_meters: location.radius_meters || 5000,
        },
        is_off_campus_allowed: is_off_campus_allowed || false,
        created_by: req.adminId,
      });

      await session.save();

      // Create candidates if provided
      if (candidates && Array.isArray(candidates)) {
        const candidateDocs = candidates.map((c) => ({
          session_id: session._id,
          name: c.name,
          position: c.position,
          photo_url: c.photo_url,
          bio: c.bio || "",
          manifesto: c.manifesto || "",
        }));

        const createdCandidates = await Candidate.insertMany(candidateDocs);
        session.candidates = createdCandidates.map((c) => c._id);
        await session.save();
      }

      // Invalidate cached session data
      await cacheService.del("admin:sessions:all");

      res.status(201).json({
        message: "Voting session created successfully",
        session,
      });
    } catch (error) {
      console.error("Create session error:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  }

  /**
   * Update an existing voting session
   * PATCH /api/admin/update-session/:id
   */
  async updateSession(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const session = await VotingSession.findById(id);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Update session status based on current time
      await session.updateStatus();

      // Prevent editing active or ended sessions
      if (session.status === "active") {
        return res.status(403).json({
          error: "Cannot edit active session",
          message:
            "Session is currently active and cannot be modified. Wait until it ends or delete it.",
        });
      }

      if (session.status === "ended") {
        return res.status(403).json({
          error: "Cannot edit ended session",
          message: "Session has already ended and cannot be modified.",
        });
      }

      // Update allowed fields
      const allowedUpdates = [
        "title",
        "description",
        "start_time",
        "end_time",
        "eligible_college",
        "eligible_departments",
        "eligible_levels",
        "categories",
        "location",
        "is_off_campus_allowed",
      ];

      allowedUpdates.forEach((field) => {
        if (updates[field] !== undefined) {
          session[field] = updates[field];
        }
      });

      await session.save();

      // Invalidate cached session data
      await cacheService.del("admin:sessions:all");
      await cacheService.del(`admin:session_stats:${id}`);
      await cacheService.del(`live_results:${id}`);
      await cacheService.del(`session:${id}`);

      res.json({
        message: "Session updated successfully",
        session,
      });
    } catch (error) {
      console.error("Update session error:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  }

  /**
   * Delete a voting session
   * DELETE /api/admin/delete-session/:id
   */
  async deleteSession(req, res) {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();

    try {
      const { id } = req.params;

      const session = await VotingSession.findById(id);

      if (!session) {
        await mongoSession.abortTransaction();
        return res.status(404).json({ error: "Session not found" });
      }

      // Face++ uses stateless verification - no cleanup needed

      // Delete all votes for this session
      await Vote.deleteMany({ session_id: id }, { session: mongoSession });

      // Delete all candidates for this session
      await Candidate.deleteMany({ session_id: id }, { session: mongoSession });

      // Remove session from students' has_voted_sessions
      await Student.updateMany(
        { has_voted_sessions: id },
        { $pull: { has_voted_sessions: id } },
        { session: mongoSession }
      );

      // Delete the session
      await VotingSession.findByIdAndDelete(id, { session: mongoSession });

      await mongoSession.commitTransaction();

      // Invalidate all cached session data
      await cacheService.del("admin:sessions:all");
      await cacheService.del(`admin:session_stats:${id}`);
      await cacheService.del(`live_results:${id}`);
      await cacheService.del(`session:${id}`);
      await cacheService.delPattern(`vote_count:${id}:*`);
      await cacheService.del(`total_votes:${id}`);

      res.json({
        message: "Session deleted successfully",
        deleted_session_id: id,
      });
    } catch (error) {
      await mongoSession.abortTransaction();
      console.error("Delete session error:", error);
      res.status(500).json({ error: "Failed to delete session" });
    } finally {
      mongoSession.endSession();
    }
  }

  /**
   * Update a candidate
   * PATCH /api/admin/candidates/:id
   */
  async updateCandidate(req, res) {
    try {
      const { id } = req.params;
      const { name, position, photo_url, bio, manifesto } = req.body;

      const candidate = await Candidate.findById(id);

      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      // Update fields
      if (name !== undefined) candidate.name = name;
      if (position !== undefined) candidate.position = position;
      if (photo_url !== undefined) candidate.photo_url = photo_url;
      if (bio !== undefined) candidate.bio = bio;
      if (manifesto !== undefined) candidate.manifesto = manifesto;

      await candidate.save();

      res.json({
        message: "Candidate updated successfully",
        candidate: {
          id: candidate._id,
          name: candidate.name,
          position: candidate.position,
          photo_url: candidate.photo_url,
          bio: candidate.bio,
          manifesto: candidate.manifesto,
          vote_count: candidate.vote_count,
          session_id: candidate.session_id,
        },
      });
    } catch (error) {
      console.error("Update candidate error:", error);
      res.status(500).json({ error: "Failed to update candidate" });
    }
  }

  /**
   * Delete a candidate
   * DELETE /api/admin/candidates/:id
   */
  async deleteCandidate(req, res) {
    try {
      const { id } = req.params;

      const candidate = await Candidate.findById(id);

      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      const sessionId = candidate.session_id;

      // Delete the candidate
      await Candidate.findByIdAndDelete(id);

      // Remove candidate reference from session
      await VotingSession.findByIdAndUpdate(sessionId, {
        $pull: { candidates: id },
      });

      res.json({
        message: "Candidate deleted successfully",
        deleted_candidate: {
          id: candidate._id,
          name: candidate.name,
          position: candidate.position,
        },
      });
    } catch (error) {
      console.error("Delete candidate error:", error);
      res.status(500).json({ error: "Failed to delete candidate" });
    }
  }

  /**
   * Get candidate by ID
   * GET /api/admin/candidates/:id
   */
  async getCandidateById(req, res) {
    try {
      const { id } = req.params;

      const candidate = await Candidate.findById(id)
        .populate("session_id", "title start_time end_time status")
        .lean();

      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      res.json({ candidate });
    } catch (error) {
      console.error("Get candidate by ID error:", error);
      res.status(500).json({ error: "Failed to get candidate" });
    }
  }

  /**
   * Remove students by department (single or bulk)
   * DELETE /api/admin/remove-department
   */
  async removeDepartment(req, res) {
    try {
      const { departments } = req.body; // Array of department names or single department

      if (!departments) {
        return res.status(400).json({ error: "Department(s) required" });
      }

      const deptArray = Array.isArray(departments)
        ? departments
        : [departments];

      // Delete students in specified departments
      const result = await Student.deleteMany({
        department: { $in: deptArray },
      });

      res.json({
        message: "Department(s) removed successfully",
        deleted_count: result.deletedCount,
      });
    } catch (error) {
      console.error("Remove department error:", error);
      res.status(500).json({ error: "Failed to remove department" });
    }
  }

  /**
   * Cleanup all sessions and votes (super admin only)
   * DELETE /api/admin/cleanup-all
   */
  async cleanupAll(req, res) {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();

    try {
      // Face++ uses stateless verification - no cleanup needed

      // Delete all votes
      await Vote.deleteMany({}, { session: mongoSession });

      // Delete all candidates
      await Candidate.deleteMany({}, { session: mongoSession });

      // Delete all sessions
      await VotingSession.deleteMany({}, { session: mongoSession });

      // Clear has_voted_sessions from all students
      await Student.updateMany(
        {},
        { $set: { has_voted_sessions: [] } },
        { session: mongoSession }
      );

      await mongoSession.commitTransaction();

      res.json({
        message: "All sessions and votes cleaned up successfully",
      });
    } catch (error) {
      await mongoSession.abortTransaction();
      console.error("Cleanup error:", error);
      res.status(500).json({ error: "Failed to cleanup" });
    } finally {
      mongoSession.endSession();
    }
  }

  /**
   * Create a new admin (super admin only)
   * POST /api/admin/create-admin
   */
  async createAdmin(req, res) {
    try {
      const { email, password, full_name, role } = req.body;

      // Validate required fields
      if (!email || !password || !full_name) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if admin exists
      const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
      if (existingAdmin) {
        return res.status(409).json({ error: "Admin already exists" });
      }

      // Hash password
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS || 10)
      );
      const passwordHash = await bcrypt.hash(password, salt);

      // Create admin
      const admin = new Admin({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        full_name,
        role: role || "admin",
      });

      await admin.save();

      res.status(201).json({
        message: "Admin created successfully",
        admin: {
          id: admin._id,
          email: admin.email,
          full_name: admin.full_name,
          role: admin.role,
        },
      });
    } catch (error) {
      console.error("Create admin error:", error);
      res.status(500).json({ error: "Failed to create admin" });
    }
  }

  /**
   * Get all students with filters
   * GET /api/admin/students
   */
  async getStudents(req, res) {
    try {
      const {
        college,
        department,
        level,
        search,
        page = 1,
        limit = 50,
      } = req.query;

      const filter = {};

      // College filter is now required or can be omitted for all
      if (college) filter.college = college;
      if (department) filter.department = department;
      if (level) filter.level = level;

      // Search by name, email, or matric number using text index
      if (search) {
        filter.$text = { $search: search };
      }

      const [students, count] = await Promise.all([
        Student.find(filter)
          .select("-password_hash -active_token -embedding_vector")
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .sort(search ? { score: { $meta: "textScore" } } : { matric_no: 1 })
          .lean(),
        Student.countDocuments(filter),
      ]);

      // Add computed field for facial data status
      const studentsWithFaceStatus = students.map((student) => ({
        ...student,
        has_facial_data: !!student.face_token,
        face_token: undefined, // Remove face_token from response
      }));

      res.json({
        students: studentsWithFaceStatus,
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit),
        filter: {
          college: college || "all",
          department: department || "all",
          level: level || "all",
        },
      });
    } catch (error) {
      console.error("Get students error:", error);
      res.status(500).json({ error: "Failed to get students" });
    }
  }

  /**
   * Get students by college
   * GET /api/admin/colleges/:collegeId/students
   */
  async getStudentsByCollege(req, res) {
    try {
      const { collegeId } = req.params;
      const { department, level, search, page = 1, limit = 50 } = req.query;

      // First, get the college to get its name
      const College = require("../models/College");
      const college = await College.findById(collegeId).lean();

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      const filter = { college: college.name };

      if (department) filter.department = department;
      if (level) filter.level = level;

      // Search using text index
      if (search) {
        filter.$text = { $search: search };
      }

      const [students, total, departmentBreakdown] = await Promise.all([
        Student.find(filter)
          .select("-password_hash -active_token -embedding_vector")
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .sort(search ? { score: { $meta: "textScore" } } : { matric_no: 1 })
          .lean(),
        Student.countDocuments(filter),
        Student.aggregate([
          { $match: { college: college.name } },
          {
            $group: {
              _id: "$department",
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ]),
      ]);

      // Add computed field for facial data status
      const studentsWithFaceStatus = students.map((student) => ({
        ...student,
        has_facial_data: !!student.face_token,
        face_token: undefined, // Remove face_token from response
      }));

      res.json({
        college: {
          id: college._id,
          name: college.name,
          code: college.code,
        },
        students: studentsWithFaceStatus,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        department_breakdown: departmentBreakdown.map((d) => ({
          department: d._id,
          count: d.count,
        })),
      });
    } catch (error) {
      console.error("Get students by college error:", error);
      res.status(500).json({ error: "Failed to get students" });
    }
  }

  /**
   * Get students by department
   * GET /api/admin/colleges/:collegeId/departments/:departmentId/students
   */
  async getStudentsByDepartment(req, res) {
    try {
      const { collegeId, departmentId } = req.params;
      const { level, search, page = 1, limit = 50 } = req.query;

      // Get college and department
      const College = require("../models/College");
      const college = await College.findById(collegeId).lean();

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      const department = college.departments.find(
        (d) => d._id.toString() === departmentId
      );

      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      const filter = {
        college: college.name,
        department: department.name,
      };

      if (level) filter.level = level;

      // Search using text index
      if (search) {
        filter.$text = { $search: search };
      }

      const [students, total, levelBreakdown] = await Promise.all([
        Student.find(filter)
          .select("-password_hash -active_token -embedding_vector")
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .sort(search ? { score: { $meta: "textScore" } } : { matric_no: 1 })
          .lean(),
        Student.countDocuments(filter),
        Student.aggregate([
          {
            $match: {
              college: college.name,
              department: department.name,
            },
          },
          {
            $group: {
              _id: "$level",
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

      // Add computed field for facial data status
      const studentsWithFaceStatus = students.map((student) => ({
        ...student,
        has_facial_data: !!student.face_token,
        face_token: undefined, // Remove face_token from response
      }));

      res.json({
        college: {
          id: college._id,
          name: college.name,
          code: college.code,
        },
        department: {
          id: department._id,
          name: department.name,
          code: department.code,
        },
        students: studentsWithFaceStatus,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        level_breakdown: levelBreakdown.map((l) => ({
          level: l._id,
          count: l.count,
        })),
      });
    } catch (error) {
      console.error("Get students by department error:", error);
      res.status(500).json({ error: "Failed to get students" });
    }
  }

  /**
   * Get single student by ID
   * GET /api/admin/students/:id
   */
  async getStudentById(req, res) {
    try {
      const { id } = req.params;

      // Get student data and face_token status separately
      const [student, studentWithFaceToken] = await Promise.all([
        Student.findById(id)
          .select("-password_hash -active_token -face_token -embedding_vector")
          .lean(),
        Student.findById(id).select("face_token").lean(),
      ]);

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // Add computed field for facial data status
      student.has_facial_data = !!(
        studentWithFaceToken && studentWithFaceToken.face_token
      );

      // Get voting history
      const votes = await Vote.find({ student_id: id })
        .populate("session_id", "title start_time end_time")
        .select("session_id voted_at status")
        .lean();

      res.json({
        student,
        voting_history: votes,
      });
    } catch (error) {
      console.error("Get student by ID error:", error);
      res.status(500).json({ error: "Failed to get student" });
    }
  }

  /**
   * Update student
   * PATCH /api/admin/students/:id
   */
  async updateStudent(req, res) {
    try {
      const { id } = req.params;
      const {
        full_name,
        email,
        department,
        college,
        level,
        is_active,
        photo_url,
      } = req.body;

      const student = await Student.findById(id);

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // Validate college and department if changing
      if (college || department || level) {
        const College = require("../models/College");
        const collegeDoc = await College.findOne({
          name: college || student.college,
        });

        if (!collegeDoc) {
          return res.status(400).json({ error: "Invalid college" });
        }

        const targetDepartment = department || student.department;
        const deptDoc = collegeDoc.departments.find(
          (d) => d.name === targetDepartment
        );

        if (!deptDoc) {
          return res.status(400).json({
            error: `Department '${targetDepartment}' does not exist in ${collegeDoc.name}`,
          });
        }

        // Validate level is within department's available levels
        if (level) {
          if (
            !deptDoc.available_levels ||
            deptDoc.available_levels.length === 0
          ) {
            return res.status(400).json({
              error: `Department '${targetDepartment}' does not have available levels configured`,
            });
          }

          if (!deptDoc.available_levels.includes(level)) {
            const minLevel = Math.min(
              ...deptDoc.available_levels.map((l) => parseInt(l))
            );
            const maxLevel = Math.max(
              ...deptDoc.available_levels.map((l) => parseInt(l))
            );
            return res.status(400).json({
              error: `Level ${level} is not offered by ${targetDepartment}. Available levels: ${deptDoc.available_levels.join(
                ", "
              )} (${minLevel}-${maxLevel})`,
            });
          }
        }
      }

      // Update fields
      if (full_name !== undefined) student.full_name = full_name;
      if (email !== undefined) student.email = email.toLowerCase();
      if (department !== undefined) {
        student.department = department;
        // If department is changing, get the department code
        if (college || department) {
          const College = require("../models/College");
          const collegeDoc = await College.findOne({
            name: college || student.college,
          });
          const deptDoc = collegeDoc.departments.find(
            (d) => d.name === department
          );
          if (deptDoc) {
            student.department_code = deptDoc.code;
          }
        }
      }
      if (college !== undefined) student.college = college;
      if (level !== undefined) student.level = level;
      if (is_active !== undefined) student.is_active = is_active;

      // Handle photo_url update with Face++ re-registration
      let faceUpdateWarning = null;
      if (photo_url !== undefined && photo_url !== student.photo_url) {
        student.photo_url = photo_url;

        // If photo URL is provided, re-register face with Face++
        if (photo_url) {
          try {
            const faceDetection = await faceppService.detectFace(photo_url);

            if (faceDetection.success) {
              student.face_token = faceDetection.face_token;
            } else {
              // Face detection failed - keep old face_token and warn admin
              faceUpdateWarning = `Photo URL updated but face registration failed: ${faceDetection.error}. Old facial data retained.`;
              console.warn(
                `Face re-registration failed for student ${student.matric_no}: ${faceDetection.error}`
              );
            }
          } catch (error) {
            faceUpdateWarning = `Photo URL updated but face registration encountered an error. Old facial data retained.`;
            console.error(
              `Face re-registration error for student ${student.matric_no}:`,
              error
            );
          }
        } else {
          // Photo URL removed - clear face_token
          student.face_token = null;
        }
      }

      await student.save();

      const response = {
        message: "Student updated successfully",
        student: {
          id: student._id,
          matric_no: student.matric_no,
          full_name: student.full_name,
          email: student.email,
          college: student.college,
          department: student.department,
          department_code: student.department_code,
          level: student.level,
          photo_url: student.photo_url,
          has_facial_data: !!student.face_token,
          is_active: student.is_active,
        },
      };

      // Add warning if face registration failed
      if (faceUpdateWarning) {
        response.warning = faceUpdateWarning;
      }

      res.json(response);
    } catch (error) {
      console.error("Update student error:", error);
      res.status(500).json({ error: "Failed to update student" });
    }
  }

  /**
   * Delete student
   * DELETE /api/admin/students/:id
   * Default: Permanent deletion (removes from database and all votes)
   * Use ?soft=true for soft delete (deactivate only)
   */
  async deleteStudent(req, res) {
    try {
      const { id } = req.params;
      const { soft = "false" } = req.query;

      const student = await Student.findById(id);

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      if (soft === "true") {
        // Soft delete (deactivate)
        student.is_active = false;
        await student.save();

        res.json({
          message: "Student deactivated successfully",
          student: {
            id: student._id,
            matric_no: student.matric_no,
            is_active: false,
          },
        });
      } else {
        // Permanent deletion - also delete votes
        await Vote.deleteMany({ student_id: id });
        await Student.findByIdAndDelete(id);

        res.json({
          message: "Student permanently deleted",
          deleted_student: {
            id: student._id,
            matric_no: student.matric_no,
            name: student.full_name,
          },
        });
      }
    } catch (error) {
      console.error("Delete student error:", error);
      res.status(500).json({ error: "Failed to delete student" });
    }
  }

  /**
   * Bulk update students
   * PATCH /api/admin/students/bulk-update
   */
  async bulkUpdateStudents(req, res) {
    try {
      const { student_ids, updates } = req.body;

      if (
        !student_ids ||
        !Array.isArray(student_ids) ||
        student_ids.length === 0
      ) {
        return res.status(400).json({ error: "student_ids array is required" });
      }

      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "updates object is required" });
      }

      // Validate allowed fields
      const allowedFields = ["level", "is_active", "college", "department"];
      const updateFields = {};

      Object.keys(updates).forEach((key) => {
        if (allowedFields.includes(key)) {
          updateFields[key] = updates[key];
        }
      });

      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({
          error: "No valid update fields provided",
          allowed_fields: allowedFields,
        });
      }

      const result = await Student.updateMany(
        { _id: { $in: student_ids } },
        { $set: updateFields }
      );

      res.json({
        message: "Students updated successfully",
        updated_count: result.modifiedCount,
        matched_count: result.matchedCount,
      });
    } catch (error) {
      console.error("Bulk update students error:", error);
      res.status(500).json({ error: "Failed to bulk update students" });
    }
  }

  /**
   * Get student statistics by college
   * GET /api/admin/colleges/:collegeId/students/statistics
   */
  async getStudentStatisticsByCollege(req, res) {
    try {
      const { collegeId } = req.params;

      // Try cache first (10 minute TTL for college stats)
      const cacheKey = `admin:college_stats:${collegeId}`;
      const cachedStats = await cacheService.get(cacheKey);

      if (cachedStats) {
        return res.json({
          ...cachedStats,
          cached: true,
        });
      }

      // Cache miss - query database
      // Get college
      const College = require("../models/College");
      const college = await College.findById(collegeId)
        .select("name code")
        .lean();

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Run all queries in parallel for speed
      const [totalStudents, activeStudents, departmentStats, levelStats] =
        await Promise.all([
          Student.countDocuments({ college: college.name }),
          Student.countDocuments({ college: college.name, is_active: true }),
          Student.aggregate([
            { $match: { college: college.name } },
            {
              $group: {
                _id: "$department",
                total: { $sum: 1 },
                active: {
                  $sum: { $cond: [{ $eq: ["$is_active", true] }, 1, 0] },
                },
              },
            },
            { $sort: { total: -1 } },
          ]),
          Student.aggregate([
            { $match: { college: college.name } },
            {
              $group: {
                _id: "$level",
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ]),
        ]);

      const responseData = {
        college: {
          id: college._id,
          name: college.name,
          code: college.code,
        },
        statistics: {
          total_students: totalStudents,
          active_students: activeStudents,
          inactive_students: totalStudents - activeStudents,
          departments: departmentStats.map((d) => ({
            name: d._id,
            total: d.total,
            active: d.active,
            inactive: d.total - d.active,
          })),
          levels: levelStats.map((l) => ({
            level: l._id,
            count: l.count,
          })),
        },
        cached: false,
      };

      // Cache for 10 minutes
      await cacheService.set(cacheKey, responseData, 600);

      res.json(responseData);
    } catch (error) {
      console.error("Get student statistics by college error:", error);
      res.status(500).json({ error: "Failed to get statistics" });
    }
  }

  /**
   * Get all sessions
   * GET /api/admin/sessions
   */
  async getSessions(req, res) {
    try {
      // Try cache first (5 minute TTL)
      const cacheKey = "admin:sessions:all";
      const cachedSessions = await cacheService.get(cacheKey);

      if (cachedSessions) {
        return res.json({
          sessions: cachedSessions,
          cached: true,
        });
      }

      // Cache miss - query database
      const sessions = await VotingSession.find({})
        .populate("candidates", "name position photo_url vote_count")
        .sort({ createdAt: -1 })
        .lean();

      // Get accurate vote counts and student participation for each session
      for (const session of sessions) {
        // Get vote counts by candidate and unique student count
        const [votesByCandidate, uniqueVoters] = await Promise.all([
          Vote.aggregate([
            {
              $match: {
                session_id: new mongoose.Types.ObjectId(session._id),
                status: "valid",
              },
            },
            {
              $group: {
                _id: "$candidate_id",
                count: { $sum: 1 },
              },
            },
          ]),
          Vote.distinct("student_id", {
            session_id: new mongoose.Types.ObjectId(session._id),
            status: "valid",
          }),
        ]);

        // Add vote participation stats
        session.total_votes = uniqueVoters.length;
        session.students_voted = uniqueVoters.length;

        // Update each candidate with accurate vote count
        if (session.candidates && session.candidates.length > 0) {
          session.candidates = session.candidates.map((candidate) => {
            const voteData = votesByCandidate.find(
              (v) => v._id.toString() === candidate._id.toString()
            );
            return {
              ...candidate,
              vote_count: voteData ? voteData.count : 0,
            };
          });
        }
      }

      // Cache the result (5 minutes)
      await cacheService.set(cacheKey, sessions, 300);

      res.json({
        sessions,
        cached: false,
      });
    } catch (error) {
      console.error("Get sessions error:", error);
      res.status(500).json({ error: "Failed to get sessions" });
    }
  }

  /**
   * Get single session by ID
   * GET /api/admin/sessions/:id
   */
  async getSessionById(req, res) {
    try {
      const { id } = req.params;

      const session = await VotingSession.findById(id)
        .populate("candidates", "name position photo_url bio manifesto")
        .lean();

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Get vote statistics for this session - run in parallel
      const [
        totalVotes,
        duplicateAttempts,
        rejectedVotes,
        eligibleStudents,
        votesByCandidate,
      ] = await Promise.all([
        Vote.countDocuments({ session_id: id, status: "valid" }),
        Vote.countDocuments({ session_id: id, status: "duplicate" }),
        Vote.countDocuments({ session_id: id, status: "rejected" }),
        (async () => {
          const eligibilityFilter = { is_active: true };

          if (session.eligible_college) {
            eligibilityFilter.college = session.eligible_college;
          }

          // Convert department IDs to department names
          if (
            session.eligible_departments &&
            session.eligible_departments.length > 0
          ) {
            const College = require("../models/College");
            const colleges = await College.find({})
              .select("departments")
              .lean();
            const departmentNames = [];

            colleges.forEach((college) => {
              college.departments.forEach((dept) => {
                if (
                  session.eligible_departments.includes(dept._id.toString())
                ) {
                  departmentNames.push(dept.name);
                }
              });
            });

            if (departmentNames.length > 0) {
              eligibilityFilter.department = { $in: departmentNames };
            }
          }

          if (session.eligible_levels && session.eligible_levels.length > 0) {
            eligibilityFilter.level = { $in: session.eligible_levels };
          }

          return await Student.countDocuments(eligibilityFilter);
        })(),
        Vote.aggregate([
          {
            $match: {
              session_id: new mongoose.Types.ObjectId(id),
              status: "valid",
            },
          },
          {
            $group: {
              _id: "$candidate_id",
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      // Add vote counts to candidates
      const candidatesWithVotes = session.candidates.map((candidate) => {
        const voteData = votesByCandidate.find(
          (v) => v._id.toString() === candidate._id.toString()
        );
        return {
          ...candidate,
          vote_count: voteData ? voteData.count : 0,
        };
      });

      res.json({
        session: {
          ...session,
          candidates: candidatesWithVotes,
        },
        stats: {
          eligible_students: eligibleStudents,
          total_votes: totalVotes,
          duplicate_attempts: duplicateAttempts,
          rejected_votes: rejectedVotes,
          turnout_percentage:
            eligibleStudents > 0
              ? ((totalVotes / eligibleStudents) * 100).toFixed(2)
              : 0,
        },
      });
    } catch (error) {
      console.error("Get session by ID error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  }

  /**
   * Get session statistics
   * GET /api/admin/session-stats/:id
   */
  async getSessionStats(req, res) {
    try {
      const { id } = req.params;

      // Try cache first (2 minute TTL for session stats)
      const cacheKey = `admin:session_stats:${id}`;
      const cachedStats = await cacheService.get(cacheKey);

      if (cachedStats) {
        return res.json({
          ...cachedStats,
          cached: true,
        });
      }

      // Cache miss - query database
      const session = await VotingSession.findById(id)
        .populate("candidates", "name position photo_url")
        .lean();

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Run all stat queries in parallel
      const [totalVotes, duplicateAttempts, rejectedVotes, eligibleStudents] =
        await Promise.all([
          Vote.countDocuments({ session_id: id, status: "valid" }),
          Vote.countDocuments({ session_id: id, status: "duplicate" }),
          Vote.countDocuments({ session_id: id, status: "rejected" }),
          (async () => {
            const eligibilityFilter = { is_active: true };

            if (session.eligible_college) {
              eligibilityFilter.college = session.eligible_college;
            }

            // Convert department IDs to department names
            if (
              session.eligible_departments &&
              session.eligible_departments.length > 0
            ) {
              const College = require("../models/College");
              const colleges = await College.find({})
                .select("departments")
                .lean();
              const departmentNames = [];

              colleges.forEach((college) => {
                college.departments.forEach((dept) => {
                  if (
                    session.eligible_departments.includes(dept._id.toString())
                  ) {
                    departmentNames.push(dept.name);
                  }
                });
              });

              if (departmentNames.length > 0) {
                eligibilityFilter.department = { $in: departmentNames };
              }
            }

            if (session.eligible_levels && session.eligible_levels.length > 0) {
              eligibilityFilter.level = { $in: session.eligible_levels };
            }

            return await Student.countDocuments(eligibilityFilter);
          })(),
        ]);

      const responseData = {
        session: {
          id: session._id,
          title: session.title,
          status: session.status,
        },
        stats: {
          eligible_students: eligibleStudents,
          total_votes: totalVotes,
          duplicate_attempts: duplicateAttempts,
          rejected_votes: rejectedVotes,
          turnout_percentage:
            eligibleStudents > 0
              ? ((totalVotes / eligibleStudents) * 100).toFixed(2)
              : 0,
        },
        candidates: session.candidates,
        cached: false,
      };

      // Cache for 2 minutes
      await cacheService.set(cacheKey, responseData, 120);

      res.json(responseData);
    } catch (error) {
      console.error("Get session stats error:", error);
      res.status(500).json({ error: "Failed to get session stats" });
    }
  }

  /**
   * Get all admins (Super Admin only)
   * GET /api/admin/admins
   * Excludes the requesting admin from results
   */
  async getAllAdmins(req, res) {
    try {
      const { page = 1, limit = 20, role, is_active } = req.query;

      const filter = { _id: { $ne: req.adminId } }; // Exclude requesting admin
      if (role) filter.role = role;
      if (is_active !== undefined) filter.is_active = is_active === "true";

      const [admins, total] = await Promise.all([
        Admin.find(filter)
          .select("-password_hash -reset_password_code")
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .sort({ createdAt: -1 })
          .lean(),
        Admin.countDocuments(filter),
      ]);

      res.json({
        admins,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get all admins error:", error);
      res.status(500).json({ error: "Failed to fetch admins" });
    }
  }

  /**
   * Get single admin by ID (Super Admin only)
   * GET /api/admin/admins/:id
   */
  async getAdminById(req, res) {
    try {
      const { id } = req.params;

      const admin = await Admin.findById(id).select(
        "-password_hash -reset_password_code"
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      res.json({ admin });
    } catch (error) {
      console.error("Get admin by ID error:", error);
      res.status(500).json({ error: "Failed to fetch admin" });
    }
  }

  /**
   * Update admin (Super Admin only)
   * PATCH /api/admin/admins/:id
   */
  async updateAdmin(req, res) {
    try {
      const { id } = req.params;
      const { full_name, role, is_active } = req.body;

      const admin = await Admin.findById(id);

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Prevent super admin from deactivating themselves
      if (req.adminId.toString() === id && is_active === false) {
        return res
          .status(400)
          .json({ error: "Cannot deactivate your own account" });
      }

      // Update fields
      if (full_name) admin.full_name = full_name;
      if (role && ["admin", "super_admin"].includes(role)) admin.role = role;
      if (is_active !== undefined) admin.is_active = is_active;

      await admin.save();

      res.json({
        message: "Admin updated successfully",
        admin: {
          id: admin._id,
          email: admin.email,
          full_name: admin.full_name,
          role: admin.role,
          is_active: admin.is_active,
          updated_at: admin.updatedAt,
        },
      });
    } catch (error) {
      console.error("Update admin error:", error);
      res.status(500).json({ error: "Failed to update admin" });
    }
  }

  /**
   * Delete/Deactivate admin (Super Admin only)
   * DELETE /api/admin/admins/:id
   */
  async deleteAdmin(req, res) {
    try {
      const { id } = req.params;
      const { permanent = false } = req.query;

      const admin = await Admin.findById(id);

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Prevent super admin from deleting themselves
      if (req.adminId.toString() === id) {
        return res
          .status(400)
          .json({ error: "Cannot delete your own account" });
      }

      if (permanent === "true") {
        // Permanent deletion
        await Admin.findByIdAndDelete(id);
        res.json({ message: "Admin permanently deleted" });
      } else {
        // Soft delete (deactivate)
        admin.is_active = false;
        await admin.save();
        res.json({ message: "Admin deactivated successfully" });
      }
    } catch (error) {
      console.error("Delete admin error:", error);
      res.status(500).json({ error: "Failed to delete admin" });
    }
  }

  /**
   * Get admin statistics (Super Admin only)
   * GET /api/admin/admin-stats
   */
  async getAdminStats(req, res) {
    try {
      const [
        totalAdmins,
        activeAdmins,
        superAdmins,
        regularAdmins,
        inactiveAdmins,
        recentLogins,
      ] = await Promise.all([
        Admin.countDocuments(),
        Admin.countDocuments({ is_active: true }),
        Admin.countDocuments({ role: "super_admin" }),
        Admin.countDocuments({ role: "admin" }),
        Admin.countDocuments({ is_active: false }),
        Admin.find({ last_login_at: { $ne: null } })
          .select("email full_name role last_login_at")
          .sort({ last_login_at: -1 })
          .limit(10)
          .lean(),
      ]);

      res.json({
        statistics: {
          total: totalAdmins,
          active: activeAdmins,
          inactive: inactiveAdmins,
          super_admins: superAdmins,
          regular_admins: regularAdmins,
        },
        recent_logins: recentLogins,
      });
    } catch (error) {
      console.error("Get admin stats error:", error);
      res.status(500).json({ error: "Failed to fetch admin statistics" });
    }
  }
}

module.exports = new AdminController();
