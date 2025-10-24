const bcrypt = require("bcryptjs");
const csv = require("csv-parser");
const { Readable } = require("stream");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const VotingSession = require("../models/VotingSession");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const emailService = require("../services/emailService");
const azureService = require("../services/azureService");
const constants = require("../config/constants");
const mongoose = require("mongoose");

class AdminController {
  /**
   * Upload students from CSV
   * POST /api/admin/upload-students
   */
  async uploadStudents(req, res) {
    try {
      const { csv_data } = req.body; // Array of student objects from frontend

      if (!csv_data || !Array.isArray(csv_data)) {
        return res.status(400).json({ error: "Invalid CSV data format" });
      }

      const results = {
        total: csv_data.length,
        created: 0,
        updated: 0,
        failed: 0,
        errors: [],
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
          const { matric_no, full_name, email, department, college, level } =
            row;

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
              error: "Missing required fields",
            });
            continue;
          }

          // Check if student exists
          const existingStudent = await Student.findOne({
            matric_no: matric_no.toUpperCase(),
          });

          if (existingStudent) {
            // Update existing student
            existingStudent.full_name = full_name;
            existingStudent.email = email.toLowerCase();
            existingStudent.department = department;
            existingStudent.college = college;
            existingStudent.level = level;
            await existingStudent.save();
            results.updated++;
          } else {
            // Create new student
            const student = new Student({
              matric_no: matric_no.toUpperCase(),
              full_name,
              email: email.toLowerCase(),
              password_hash: defaultPasswordHash,
              department,
              college,
              level,
              first_login: true,
            });

            await student.save();
            results.created++;

            // Send welcome email asynchronously
            emailService.sendWelcomeEmail(student).catch((err) => {
              console.error(
                `Failed to send welcome email to ${student.email}:`,
                err
              );
            });
          }
        } catch (error) {
          console.error("Error processing student:", error);
          results.failed++;
          results.errors.push({
            matric_no: row.matric_no || "unknown",
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

      // Create PersonGroup for this session
      const personGroupId = `session_${Date.now()}`;
      await azureService.createPersonGroup(personGroupId, `Session: ${title}`);

      // Create session
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
        azure_persongroup_id: personGroupId,
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
        "results_public",
      ];

      allowedUpdates.forEach((field) => {
        if (updates[field] !== undefined) {
          session[field] = updates[field];
        }
      });

      await session.save();

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

      // Delete PersonGroup from Azure
      if (session.azure_persongroup_id) {
        await azureService.deletePersonGroup(session.azure_persongroup_id);
      }

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
      // Get all sessions to delete their PersonGroups
      const sessions = await VotingSession.find({});

      // Delete all PersonGroups from Azure
      for (const session of sessions) {
        if (session.azure_persongroup_id) {
          await azureService.deletePersonGroup(session.azure_persongroup_id);
        }
      }

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
      const { college, department, level, page = 1, limit = 50 } = req.query;

      const filter = {};
      if (college) filter.college = college;
      if (department) filter.department = department;
      if (level) filter.level = level;

      const students = await Student.find(filter)
        .select("-password_hash -active_token")
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ matric_no: 1 });

      const count = await Student.countDocuments(filter);

      res.json({
        students,
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit),
      });
    } catch (error) {
      console.error("Get students error:", error);
      res.status(500).json({ error: "Failed to get students" });
    }
  }

  /**
   * Get all sessions
   * GET /api/admin/sessions
   */
  async getSessions(req, res) {
    try {
      const sessions = await VotingSession.find({})
        .populate("candidates")
        .sort({ createdAt: -1 });

      res.json({ sessions });
    } catch (error) {
      console.error("Get sessions error:", error);
      res.status(500).json({ error: "Failed to get sessions" });
    }
  }

  /**
   * Get session statistics
   * GET /api/admin/session-stats/:id
   */
  async getSessionStats(req, res) {
    try {
      const { id } = req.params;

      const session = await VotingSession.findById(id).populate("candidates");
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Get vote counts
      const totalVotes = await Vote.countDocuments({
        session_id: id,
        status: "valid",
      });
      const duplicateAttempts = await Vote.countDocuments({
        session_id: id,
        status: "duplicate",
      });
      const rejectedVotes = await Vote.countDocuments({
        session_id: id,
        status: "rejected",
      });

      // Get eligible student count
      const eligibilityFilter = {};
      if (session.eligible_college)
        eligibilityFilter.college = session.eligible_college;
      if (session.eligible_departments)
        eligibilityFilter.department = { $in: session.eligible_departments };
      if (session.eligible_levels)
        eligibilityFilter.level = { $in: session.eligible_levels };

      const eligibleStudents = await Student.countDocuments(eligibilityFilter);

      res.json({
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
      });
    } catch (error) {
      console.error("Get session stats error:", error);
      res.status(500).json({ error: "Failed to get session stats" });
    }
  }
}

module.exports = new AdminController();
