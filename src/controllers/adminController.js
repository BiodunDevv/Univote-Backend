const bcrypt = require("bcryptjs");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const VotingSession = require("../models/VotingSession");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const faceProviderService = require("../services/faceProviderService");
const emailService = require("../services/emailService");
const constants = require("../config/constants");
const mongoose = require("mongoose");
const cacheService = require("../services/cacheService");
const College = require("../models/College");
const {
  getTenantScopedFilter,
  assignTenantId,
  getTenantCacheNamespace,
  prependTenantMatch,
} = require("../utils/tenantScope");
const {
  buildQuotaErrorMessage,
  getTenantQuotaStatus,
} = require("../services/planAccessService");
const {
  getTenantEligibilityPolicy,
  getTenantIdentityMetadata,
  getTenantSettings,
  isTenantParticipantFieldEnabled,
  isTenantParticipantFieldRequired,
} = require("../utils/tenantSettings");

function getParticipantIdentifierKey(student, tenant) {
  const identity = getTenantIdentityMetadata(tenant);
  return identity.display_identifier || "matric_no";
}

function getParticipantIdentifierValue(student, tenant) {
  const key = getParticipantIdentifierKey(student, tenant);
  return (
    student?.[key] ||
    student?.display_identifier ||
    student?.matric_no ||
    student?.member_id ||
    student?.employee_id ||
    student?.username ||
    student?.email ||
    "unknown"
  );
}

function buildParticipantIdentityPayload(tenant, payload = {}) {
  const settings = getTenantSettings(tenant);
  const primary = settings.identity.primary_identifier;
  const normalized = {
    matric_no: payload.matric_no ? String(payload.matric_no).trim().toUpperCase() : null,
    member_id: payload.member_id ? String(payload.member_id).trim().toUpperCase() : null,
    employee_id: payload.employee_id
      ? String(payload.employee_id).trim().toUpperCase()
      : null,
    username: payload.username ? String(payload.username).trim().toLowerCase() : null,
    email: payload.email ? String(payload.email).trim().toLowerCase() : null,
  };

  const primaryValue = normalized[primary];

  return {
    settings,
    primary,
    normalized,
    primaryValue,
    requiresEmail: Boolean(settings.auth.require_email),
  };
}

function normalizeParticipantFieldValue(fieldKey, value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;

  if (fieldKey === "level") {
    return normalized;
  }

  if (fieldKey === "email") {
    return normalized.toLowerCase();
  }

  if (["matric_no", "member_id", "employee_id", "department_code"].includes(fieldKey)) {
    return normalized.toUpperCase();
  }

  if (fieldKey === "username") {
    return normalized.toLowerCase();
  }

  return normalized;
}

function getParticipantFieldValue(payload, fieldKey) {
  return normalizeParticipantFieldValue(fieldKey, payload?.[fieldKey]);
}

function normalizeParticipantStructurePayload(tenant, payload = {}, fallbacks = {}) {
  return {
    college: isTenantParticipantFieldEnabled(tenant, "college")
      ? getParticipantFieldValue(payload, "college") ??
        getParticipantFieldValue(fallbacks, "college")
      : null,
    department: isTenantParticipantFieldEnabled(tenant, "department")
      ? getParticipantFieldValue(payload, "department") ??
        getParticipantFieldValue(fallbacks, "department")
      : null,
    level: isTenantParticipantFieldEnabled(tenant, "level")
      ? getParticipantFieldValue(payload, "level") ??
        getParticipantFieldValue(fallbacks, "level")
      : null,
    photo_url: isTenantParticipantFieldEnabled(tenant, "photo_url")
      ? getParticipantFieldValue(payload, "photo_url")
      : null,
  };
}

function buildParticipantRequiredFieldList(tenant, identity) {
  const requiredFields = ["full_name", identity.primary];

  if (isTenantParticipantFieldRequired(tenant, "email")) {
    requiredFields.push("email");
  }
  if (isTenantParticipantFieldRequired(tenant, "college")) {
    requiredFields.push("college");
  }
  if (isTenantParticipantFieldRequired(tenant, "department")) {
    requiredFields.push("department");
  }
  if (isTenantParticipantFieldRequired(tenant, "level")) {
    requiredFields.push("level");
  }

  return requiredFields;
}

async function resolveParticipantStructureDocuments(req, structure) {
  if (!structure.college && !structure.department && !structure.level) {
    return { collegeDoc: null, deptDoc: null };
  }

  const collegeName = structure.college;
  if (!collegeName) {
    return {
      error: "College is required when department or level is provided",
    };
  }

  const collegeDoc = await College.findOne(
    getTenantScopedFilter(req, { name: collegeName }),
  );

  if (!collegeDoc) {
    return { error: `College '${collegeName}' not found` };
  }

  let deptDoc = null;
  if (structure.department) {
    deptDoc = collegeDoc.departments.find((d) => d.name === structure.department);
    if (!deptDoc) {
      return {
        error: `Department '${structure.department}' does not exist in ${collegeName}`,
      };
    }
  }

  if (structure.level) {
    if (!["100", "200", "300", "400", "500", "600"].includes(structure.level)) {
      return {
        error: `Invalid level '${structure.level}'. Must be one of: 100, 200, 300, 400, 500, 600`,
      };
    }

    if (deptDoc) {
      const availableLevels = (deptDoc.available_levels || []).map(String);
      if (availableLevels.length === 0) {
        return {
          error: `Department '${structure.department}' in ${collegeName} does not have available levels configured`,
        };
      }
      if (!availableLevels.includes(String(structure.level))) {
        return {
          error: `Level ${structure.level} is not available in ${structure.department} (${collegeName}). Available levels: ${availableLevels.join(", ")}`,
        };
      }
    }
  }

  return { collegeDoc, deptDoc };
}

function sanitizeSessionEligibility(req, payload = {}) {
  const eligibilityPolicy = getTenantEligibilityPolicy(req.tenant);
  const requested = {
    eligible_college: payload.eligible_college || null,
    eligible_departments: Array.isArray(payload.eligible_departments)
      ? payload.eligible_departments.filter(Boolean)
      : [],
    eligible_levels: Array.isArray(payload.eligible_levels)
      ? payload.eligible_levels.filter(Boolean)
      : [],
  };

  if (requested.eligible_college && !eligibilityPolicy.college) {
    return {
      error: "College-based eligibility is disabled for this tenant",
      code: "ELIGIBILITY_DIMENSION_DISABLED",
    };
  }

  if (requested.eligible_departments.length > 0 && !eligibilityPolicy.department) {
    return {
      error: "Department-based eligibility is disabled for this tenant",
      code: "ELIGIBILITY_DIMENSION_DISABLED",
    };
  }

  if (requested.eligible_levels.length > 0 && !eligibilityPolicy.level) {
    return {
      error: "Level-based eligibility is disabled for this tenant",
      code: "ELIGIBILITY_DIMENSION_DISABLED",
    };
  }

  return {
    eligible_college: eligibilityPolicy.college ? requested.eligible_college : null,
    eligible_departments:
      eligibilityPolicy.department && requested.eligible_departments.length > 0
        ? requested.eligible_departments
        : null,
    eligible_levels:
      eligibilityPolicy.level && requested.eligible_levels.length > 0
        ? requested.eligible_levels
        : null,
  };
}

function buildTenantCacheKey(req, key) {
  return `${key}:${getTenantCacheNamespace(req)}`;
}

async function invalidateSessionCaches(req, sessionId) {
  const tenantNamespace = getTenantCacheNamespace(req);

  await Promise.all([
    cacheService.delPattern(`admin:sessions:list:${tenantNamespace}:*`),
    cacheService.del(buildTenantCacheKey(req, "admin:sessions:summary")),
    cacheService.del(buildTenantCacheKey(req, "admin:analytics:overview")),
    cacheService.del(buildTenantCacheKey(req, `admin:session_stats:${sessionId}`)),
    cacheService.del(
      buildTenantCacheKey(req, `admin:advanced_session_stats:${sessionId}`),
    ),
    cacheService.del(`live_results:${tenantNamespace}:${sessionId}`),
    cacheService.del(`session:${tenantNamespace}:${sessionId}`),
    cacheService.del(`total_votes:${tenantNamespace}:${sessionId}`),
    cacheService.delPattern(`vote_count:${tenantNamespace}:${sessionId}:*`),
    // Legacy cleanup during migration.
    cacheService.del("admin:sessions:all"),
    cacheService.del(`admin:session_stats:${sessionId}`),
    cacheService.del(`live_results:${sessionId}`),
    cacheService.del(`session:${sessionId}`),
    cacheService.del(`total_votes:${sessionId}`),
    cacheService.delPattern(`vote_count:${sessionId}:*`),
  ]);
}

async function resolveEligibleDepartmentNames(req, eligibleDepartmentIds = []) {
  if (!eligibleDepartmentIds || eligibleDepartmentIds.length === 0) {
    return [];
  }

  const colleges = await College.find(getTenantScopedFilter(req, {}))
    .select("departments._id departments.name")
    .lean();

  const departmentNames = [];

  colleges.forEach((college) => {
    (college.departments || []).forEach((department) => {
      if (eligibleDepartmentIds.includes(department._id.toString())) {
        departmentNames.push(department.name);
      }
    });
  });

  return departmentNames;
}

async function countEligibleStudents(req, session) {
  const eligibilityFilter = getTenantScopedFilter(req, { is_active: true });
  const eligibilityPolicy = getTenantEligibilityPolicy(req.tenant);

  if (eligibilityPolicy.college && session.eligible_college) {
    eligibilityFilter.college = session.eligible_college;
  }

  if (
    eligibilityPolicy.department &&
    session.eligible_departments &&
    session.eligible_departments.length > 0
  ) {
    const departmentNames = await resolveEligibleDepartmentNames(
      req,
      session.eligible_departments,
    );

    if (departmentNames.length > 0) {
      eligibilityFilter.department = { $in: departmentNames };
    }
  }

  if (
    eligibilityPolicy.level &&
    session.eligible_levels &&
    session.eligible_levels.length > 0
  ) {
    eligibilityFilter.level = { $in: session.eligible_levels };
  }

  return Student.countDocuments(eligibilityFilter);
}

async function getVotesByCandidate(req, sessionId) {
  return Vote.aggregate(
    prependTenantMatch(req, [
      {
        $match: {
          session_id: new mongoose.Types.ObjectId(sessionId),
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
  );
}

function mapCandidatesWithVoteCounts(candidates = [], votesByCandidate = [], totalVotes = 0) {
  return candidates.map((candidate) => {
    const voteData = votesByCandidate.find(
      (entry) => entry._id.toString() === candidate._id.toString(),
    );
    const voteCount = voteData ? voteData.count : 0;

    return {
      ...candidate,
      vote_count: voteCount,
      vote_percentage:
        totalVotes > 0 ? Number(((voteCount / totalVotes) * 100).toFixed(2)) : 0,
    };
  });
}

async function ensureUpcomingSession(session) {
  await session.updateStatus();

  if (session.status === "active") {
    return {
      allowed: false,
      status: 403,
      payload: {
        error: "Cannot modify active session",
        message:
          "This session is active. Candidate changes are only allowed while the session is upcoming.",
      },
    };
  }

  if (session.status === "ended") {
    return {
      allowed: false,
      status: 403,
      payload: {
        error: "Cannot modify ended session",
        message:
          "This session has ended. Candidate changes are only allowed while the session is upcoming.",
      },
    };
  }

  return { allowed: true };
}

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

      const studentQuota = await getTenantQuotaStatus(
        req.tenant,
        req.tenantId,
        "students",
        csv_data.length,
      );

      if (!studentQuota.allowed) {
        return res.status(403).json({
          error: buildQuotaErrorMessage(studentQuota, "student records"),
          code: "PLAN_LIMIT_REACHED",
          quota: studentQuota,
        });
      }

      // Validate target college and department if specified
      if (
        (isTenantParticipantFieldEnabled(req.tenant, "college") && target_college) ||
        (isTenantParticipantFieldEnabled(req.tenant, "department") && target_department)
      ) {
        if (target_college && isTenantParticipantFieldEnabled(req.tenant, "college")) {
          const collegeDoc = await College.findOne(
            getTenantScopedFilter(req, { name: target_college }),
          );
          if (!collegeDoc) {
            return res.status(400).json({
              error: `College '${target_college}' not found`,
            });
          }

          if (target_department && isTenantParticipantFieldEnabled(req.tenant, "department")) {
            const deptExists = collegeDoc.departments.some(
              (d) => d.name === target_department,
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
        parseInt(process.env.BCRYPT_ROUNDS || 10),
      );
      const defaultPasswordHash = await bcrypt.hash(
        constants.defaultPassword,
        salt,
      );

      for (const row of csv_data) {
        try {
          const identity = buildParticipantIdentityPayload(req.tenant, row);
          const structure = normalizeParticipantStructurePayload(
            req.tenant,
            row,
            {
              college: target_college,
              department: target_department,
              level: target_level,
            },
          );
          // Use target values if not provided in CSV
          const full_name = row.full_name;
          const email = identity.normalized.email;
          const department = structure.department;
          const college = structure.college;
          const level = structure.level;
          const participantIdentifier = identity.primaryValue;
          const requiredFields = buildParticipantRequiredFieldList(
            req.tenant,
            identity,
          );

          // Validate required fields
          if (!participantIdentifier || !full_name) {
            results.failed++;
            results.errors.push({
              matric_no: participantIdentifier || "unknown",
              full_name: full_name || "unknown",
              error: `Missing required fields (${requiredFields.join(", ")})`,
            });
            continue;
          }

          if (isTenantParticipantFieldRequired(req.tenant, "email") && !email) {
            results.failed++;
            results.errors.push({
              matric_no: participantIdentifier,
              full_name,
              error: `Missing required fields (${requiredFields.join(", ")})`,
            });
            continue;
          }

          if (
            isTenantParticipantFieldRequired(req.tenant, "college") &&
            !college
          ) {
            results.failed++;
            results.errors.push({
              matric_no: participantIdentifier,
              full_name,
              error: `Missing required fields (${requiredFields.join(", ")})`,
            });
            continue;
          }

          if (
            isTenantParticipantFieldRequired(req.tenant, "department") &&
            !department
          ) {
            results.failed++;
            results.errors.push({
              matric_no: participantIdentifier,
              full_name,
              error: `Missing required fields (${requiredFields.join(", ")})`,
            });
            continue;
          }

          if (isTenantParticipantFieldRequired(req.tenant, "level") && !level) {
            results.failed++;
            results.errors.push({
              matric_no: participantIdentifier,
              full_name,
              error: `Missing required fields (${requiredFields.join(", ")})`,
            });
            continue;
          }

          const { collegeDoc, deptDoc, error: structureError } =
            await resolveParticipantStructureDocuments(req, structure);

          if (structureError) {
            results.failed++;
            results.errors.push({
              matric_no: participantIdentifier,
              full_name,
              error: structureError,
            });
            continue;
          }

          // Check if student already exists (by matric_no, email, or both)
          const existingStudent = await Student.findOne({
            ...getTenantScopedFilter(req, {}),
            $or: [
              ...(identity.normalized.matric_no
                ? [{ matric_no: identity.normalized.matric_no }]
                : []),
              ...(identity.normalized.member_id
                ? [{ member_id: identity.normalized.member_id }]
                : []),
              ...(identity.normalized.employee_id
                ? [{ employee_id: identity.normalized.employee_id }]
                : []),
              ...(identity.normalized.username
                ? [{ username: identity.normalized.username }]
                : []),
              ...(email ? [{ email }] : []),
            ].filter(Boolean),
          });

          if (existingStudent) {
            // Student already exists - return error with full details
            results.failed++;
            results.errors.push({
              matric_no: participantIdentifier,
              full_name,
              error: `Participant already exists: ${existingStudent.full_name} (${getParticipantIdentifierValue(existingStudent, req.tenant)}) in ${existingStudent.department}, ${existingStudent.college}, Level ${existingStudent.level}. Cannot upload duplicate participant.`,
            });
            continue;
          }

          // Optional: Process facial registration if photo_url is provided
          let faceToken = null;
          let photoUrl = row.photo_url || null;

          if (photoUrl) {
            const faceDetection = await faceProviderService.detectFace(photoUrl);

            if (faceDetection.success) {
              faceToken = faceDetection.face_token;
            } else {
              // Face detection failed - log warning but continue without face data
              console.warn(
                `Face detection failed for ${participantIdentifier}: ${faceDetection.error}`,
              );
              results.errors.push({
                matric_no: participantIdentifier,
                full_name,
                warning: `Student created but face registration failed: ${faceDetection.error}`,
              });
            }
          }

          // Create new student (only if not exists)
          const student = new Student({
            ...assignTenantId(req, {}),
            matric_no: identity.normalized.matric_no,
            member_id: identity.normalized.member_id,
            employee_id: identity.normalized.employee_id,
            username: identity.normalized.username,
            full_name,
            email,
            password_hash: defaultPasswordHash,
            department,
            department_code: deptDoc?.code || null,
            college,
            level,
            first_login: true,
            photo_url: structure.photo_url || photoUrl,
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

      const sessionQuota = await getTenantQuotaStatus(
        req.tenant,
        req.tenantId,
        "active_sessions",
        1,
      );

      if (!sessionQuota.allowed) {
        return res.status(403).json({
          error: buildQuotaErrorMessage(sessionQuota, "active or upcoming sessions"),
          code: "PLAN_LIMIT_REACHED",
          quota: sessionQuota,
        });
      }

      const sanitizedEligibility = sanitizeSessionEligibility(req, {
        eligible_college,
        eligible_departments,
        eligible_levels,
      });

      if (sanitizedEligibility.error) {
        return res.status(400).json(sanitizedEligibility);
      }

      // Create session (Face++ uses stateless verification, no pre-session setup needed)
      const session = new VotingSession({
        ...assignTenantId(req, {}),
        title,
        description,
        start_time: new Date(start_time),
        end_time: new Date(end_time),
        eligible_college: sanitizedEligibility.eligible_college,
        eligible_departments: sanitizedEligibility.eligible_departments,
        eligible_levels: sanitizedEligibility.eligible_levels,
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
          ...assignTenantId(req, {}),
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
      await invalidateSessionCaches(req, session._id.toString());

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

      const session = await VotingSession.findOne(
        getTenantScopedFilter(req, { _id: id }),
      );

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
      const sanitizedEligibility = sanitizeSessionEligibility(req, updates);
      if (sanitizedEligibility.error) {
        return res.status(400).json(sanitizedEligibility);
      }

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
          if (field === "eligible_college") {
            session[field] = sanitizedEligibility.eligible_college;
            return;
          }
          if (field === "eligible_departments") {
            session[field] = sanitizedEligibility.eligible_departments;
            return;
          }
          if (field === "eligible_levels") {
            session[field] = sanitizedEligibility.eligible_levels;
            return;
          }
          session[field] = updates[field];
        }
      });

      await session.save();

      await invalidateSessionCaches(req, id);

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

      const session = await VotingSession.findOne(
        getTenantScopedFilter(req, { _id: id }),
      );

      if (!session) {
        await mongoSession.abortTransaction();
        return res.status(404).json({ error: "Session not found" });
      }

      // Face++ uses stateless verification - no cleanup needed

      // Delete all votes for this session
      await Vote.deleteMany(
        getTenantScopedFilter(req, { session_id: id }),
        { session: mongoSession },
      );

      // Delete all candidates for this session
      await Candidate.deleteMany(
        getTenantScopedFilter(req, { session_id: id }),
        { session: mongoSession },
      );

      // Remove session from students' has_voted_sessions
      await Student.updateMany(
        getTenantScopedFilter(req, { has_voted_sessions: id }),
        { $pull: { has_voted_sessions: id } },
        { session: mongoSession },
      );

      // Delete the session
      await VotingSession.findOneAndDelete(
        getTenantScopedFilter(req, { _id: id }),
        { session: mongoSession },
      );

      await mongoSession.commitTransaction();

      // Invalidate all cached session data
      await invalidateSessionCaches(req, id);

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
   * Create a candidate for a session
   * POST /api/admin/sessions/:id/candidates
   */
  async createCandidate(req, res) {
    try {
      const { id } = req.params;
      const { name, position, photo_url, bio, manifesto } = req.body;

      const session = await VotingSession.findOne(
        getTenantScopedFilter(req, { _id: id }),
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const editability = await ensureUpcomingSession(session);
      if (!editability.allowed) {
        return res.status(editability.status).json(editability.payload);
      }

      if (!session.categories.includes(position)) {
        return res.status(400).json({
          error: "Invalid candidate position",
          message:
            "Candidate position must match one of the session categories.",
        });
      }

      const candidate = await Candidate.create({
        ...assignTenantId(req, {}),
        session_id: session._id,
        name,
        position,
        photo_url,
        bio: bio || "",
        manifesto: manifesto || "",
      });

      session.candidates.push(candidate._id);
      await session.save();
      await invalidateSessionCaches(req, session._id.toString());

      res.status(201).json({
        message: "Candidate created successfully",
        candidate: {
          _id: candidate._id,
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
      console.error("Create candidate error:", error);
      res.status(500).json({ error: "Failed to create candidate" });
    }
  }

  /**
   * List candidates
   * GET /api/admin/candidates
   */
  async listCandidates(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(
        Math.max(parseInt(req.query.limit, 10) || 12, 1),
        100,
      );
      const skip = (page - 1) * limit;
      const { session_id, position, search, status } = req.query;

      const candidateFilter = getTenantScopedFilter(req, {});
      if (session_id) {
        candidateFilter.session_id = session_id;
      }
      if (position) {
        candidateFilter.position = position;
      }
      if (search) {
        candidateFilter.$or = [
          { name: { $regex: search, $options: "i" } },
          { position: { $regex: search, $options: "i" } },
        ];
      }

      if (status) {
        const matchingSessions = await VotingSession.find(
          getTenantScopedFilter(req, { status }),
        )
          .select("_id")
          .lean();

        const matchingSessionIds = matchingSessions.map((session) => session._id);
        candidateFilter.session_id = session_id
          ? session_id
          : { $in: matchingSessionIds };
      }

      const [candidates, total] = await Promise.all([
        Candidate.find(candidateFilter)
          .populate("session_id", "title status start_time end_time categories")
          .sort({ createdAt: -1, name: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Candidate.countDocuments(candidateFilter),
      ]);

      res.json({
        candidates,
        pagination: {
          page,
          limit,
          total,
          pages: Math.max(1, Math.ceil(total / limit)),
        },
        filters: {
          session_id: session_id || null,
          position: position || null,
          search: search || null,
          status: status || null,
        },
      });
    } catch (error) {
      console.error("List candidates error:", error);
      res.status(500).json({ error: "Failed to list candidates" });
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

      const candidate = await Candidate.findOne(
        getTenantScopedFilter(req, { _id: id }),
      );

      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      const session = await VotingSession.findOne(
        getTenantScopedFilter(req, { _id: candidate.session_id }),
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const editability = await ensureUpcomingSession(session);
      if (!editability.allowed) {
        return res.status(editability.status).json(editability.payload);
      }

      if (position !== undefined && !session.categories.includes(position)) {
        return res.status(400).json({
          error: "Invalid candidate position",
          message:
            "Candidate position must match one of the session categories.",
        });
      }

      // Update fields
      if (name !== undefined) candidate.name = name;
      if (position !== undefined) candidate.position = position;
      if (photo_url !== undefined) candidate.photo_url = photo_url;
      if (bio !== undefined) candidate.bio = bio;
      if (manifesto !== undefined) candidate.manifesto = manifesto;

      await candidate.save();
      await invalidateSessionCaches(req, session._id.toString());

      res.json({
        message: "Candidate updated successfully",
        candidate: {
          _id: candidate._id,
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

      const candidate = await Candidate.findOne(
        getTenantScopedFilter(req, { _id: id }),
      );

      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      const sessionId = candidate.session_id;

      const session = await VotingSession.findOne(
        getTenantScopedFilter(req, { _id: sessionId }),
      );

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const editability = await ensureUpcomingSession(session);
      if (!editability.allowed) {
        return res.status(editability.status).json(editability.payload);
      }

      // Delete the candidate
      await Candidate.findOneAndDelete(getTenantScopedFilter(req, { _id: id }));

      // Remove candidate reference from session
      await VotingSession.updateOne(
        getTenantScopedFilter(req, { _id: sessionId }),
        {
          $pull: { candidates: id },
        },
      );
      await invalidateSessionCaches(req, sessionId.toString());

      res.json({
        message: "Candidate deleted successfully",
        deleted_candidate: {
          _id: candidate._id,
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

      const candidate = await Candidate.findOne(
        getTenantScopedFilter(req, { _id: id }),
      )
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
      const result = await Student.deleteMany(
        getTenantScopedFilter(req, {
          department: { $in: deptArray },
        }),
      );

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
        { session: mongoSession },
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
        parseInt(process.env.BCRYPT_ROUNDS || 10),
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

      emailService
        .sendAdminInvitation({
          to: admin.email,
          fullName: admin.full_name,
          roleLabel: admin.role,
          password,
          platformScope: true,
          signInUrl: `${process.env.PUBLIC_APP_URL || "http://localhost:3000"}/auth/signin`,
        })
        .catch((err) => {
          console.error("Failed to send platform admin invitation email:", err);
        });

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
        college_id,
        department_id,
        college,
        department,
        level,
        search,
        is_active,
        has_facial_data,
        page = 1,
        limit = 50,
      } = req.query;

      const filter = {};

      // Resolve college/department by ID when provided to support stable filtering.
      if (college_id) {
        const collegeDoc = await College.findOne(
          getTenantScopedFilter(req, { _id: college_id }),
        ).lean();
        if (!collegeDoc) {
          return res.status(404).json({ error: "College not found" });
        }

        filter.college = collegeDoc.name;

        if (department_id) {
          const dept = collegeDoc.departments.find(
            (item) => item._id.toString() === department_id,
          );

          if (!dept) {
            return res.status(404).json({ error: "Department not found" });
          }

          filter.department = dept.name;
        }
      } else {
        if (college) filter.college = college;
        if (department) filter.department = department;
      }

      if (level) filter.level = level;
      if (is_active === "true" || is_active === "false") {
        filter.is_active = is_active === "true";
      }

      if (has_facial_data === "true") {
        filter.face_token = { $exists: true, $ne: null };
      }
      if (has_facial_data === "false") {
        filter.$or = [{ face_token: { $exists: false } }, { face_token: null }];
      }

      // Search by name, email, or matric number using text index
      if (search) {
        filter.$text = { $search: search };
      }

      const pageNumber = Number.parseInt(page, 10) || 1;
      const limitNumber = Number.parseInt(limit, 10) || 50;

      const scopedFilter = getTenantScopedFilter(req, filter);

      const [students, count] = await Promise.all([
        Student.find(scopedFilter)
          .select("-password_hash -active_token -embedding_vector")
          .limit(limitNumber)
          .skip((pageNumber - 1) * limitNumber)
          .sort(search ? { score: { $meta: "textScore" } } : { matric_no: 1 })
          .lean(),
        Student.countDocuments(scopedFilter),
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
        page: pageNumber,
        pages: Math.ceil(count / limitNumber),
        filter: {
          college: scopedFilter.college || college || "all",
          department: scopedFilter.department || department || "all",
          level: level || "all",
          is_active: is_active || "all",
          has_facial_data: has_facial_data || "all",
        },
      });
    } catch (error) {
      console.error("Get students error:", error);
      res.status(500).json({ error: "Failed to get students" });
    }
  }

  /**
   * Get students overview, filters and grouped metrics
   * GET /api/admin/students/overview
   */
  async getStudentsOverview(req, res) {
    try {
      const [
        total_students,
        active_students,
        inactive_students,
        with_facial_data,
        colleges,
        by_college,
        by_department,
        levels,
      ] = await Promise.all([
        Student.countDocuments(getTenantScopedFilter(req, {})),
        Student.countDocuments(getTenantScopedFilter(req, { is_active: true })),
        Student.countDocuments(getTenantScopedFilter(req, { is_active: false })),
        Student.countDocuments(
          getTenantScopedFilter(req, { face_token: { $exists: true, $ne: null } }),
        ),
        College.find(getTenantScopedFilter(req, {}))
          .select("name code departments._id departments.name departments.code")
          .sort({ name: 1 })
          .lean(),
        Student.aggregate(
          prependTenantMatch(req, [
            {
              $group: {
                _id: "$college",
                total: { $sum: 1 },
                active: {
                  $sum: {
                    $cond: [{ $eq: ["$is_active", true] }, 1, 0],
                  },
                },
              },
            },
            { $sort: { total: -1 } },
          ]),
        ),
        Student.aggregate(
          prependTenantMatch(req, [
            {
              $group: {
                _id: {
                  college: "$college",
                  department: "$department",
                },
                total: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ]),
        ),
        Student.distinct("level", getTenantScopedFilter(req, { level: { $ne: null } })),
      ]);

      res.json({
        totals: {
          total_students,
          active_students,
          inactive_students,
          with_facial_data,
        },
        colleges: colleges.map((college) => ({
          id: college._id,
          name: college.name,
          code: college.code,
          departments: (college.departments || []).map((department) => ({
            id: department._id,
            name: department.name,
            code: department.code,
          })),
        })),
        by_college: by_college.map((entry) => ({
          college: entry._id,
          total: entry.total,
          active: entry.active,
        })),
        by_department: by_department.map((entry) => ({
          college: entry._id.college,
          department: entry._id.department,
          total: entry.total,
        })),
        levels: levels
          .map((level) => String(level))
          .filter(Boolean)
          .sort((left, right) => Number(left) - Number(right)),
      });
    } catch (error) {
      console.error("Get students overview error:", error);
      res.status(500).json({ error: "Failed to get students overview" });
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
      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: collegeId }),
      ).lean();

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      const filter = getTenantScopedFilter(req, { college: college.name });

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
        Student.aggregate(
          prependTenantMatch(req, [
            { $match: { college: college.name } },
            {
              $group: {
                _id: "$department",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ]),
        ),
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
      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: collegeId }),
      ).lean();

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      const department = college.departments.find(
        (d) => d._id.toString() === departmentId,
      );

      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      const filter = getTenantScopedFilter(req, {
        college: college.name,
        department: department.name,
      });

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
        Student.aggregate(
          prependTenantMatch(req, [
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
        ),
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
      const studentFilter = getTenantScopedFilter(req, { _id: id });

      const [student, studentWithFaceToken] = await Promise.all([
        Student.findOne(studentFilter)
          .select("-password_hash -active_token -face_token -embedding_vector")
          .lean(),
        Student.findOne(studentFilter).select("face_token").lean(),
      ]);

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // Add computed field for facial data status
      student.has_facial_data = !!(
        studentWithFaceToken && studentWithFaceToken.face_token
      );

      // Get voting history
      const votes = (await Vote.find(getTenantScopedFilter(req, { student_id: id }))
        .populate("session_id", "title start_time end_time")
        .select("session_id timestamp status")
        .lean()).map((vote) => ({
          ...vote,
          voted_at: vote.timestamp,
        }));

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

      const student = await Student.findOne(getTenantScopedFilter(req, { _id: id }));

      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      const structure = normalizeParticipantStructurePayload(
        req.tenant,
        { college, department, level, photo_url },
        {
          college: student.college,
          department: student.department,
          level: student.level,
        },
      );
      const { deptDoc, error: structureError } =
        await resolveParticipantStructureDocuments(req, structure);

      if (structureError) {
        return res.status(400).json({ error: structureError });
      }

      // Update fields
      if (full_name !== undefined) student.full_name = full_name;
      if (email !== undefined) {
        student.email = email ? email.toLowerCase() : null;
      }
      if (college !== undefined || !isTenantParticipantFieldEnabled(req.tenant, "college")) {
        student.college = structure.college;
      }
      if (
        department !== undefined ||
        !isTenantParticipantFieldEnabled(req.tenant, "department")
      ) {
        student.department = structure.department;
        student.department_code = deptDoc?.code || null;
      }
      if (level !== undefined || !isTenantParticipantFieldEnabled(req.tenant, "level")) {
        student.level = structure.level;
      }
      if (is_active !== undefined) student.is_active = is_active;

      // Handle photo_url update with Face++ re-registration
      let faceUpdateWarning = null;
      if (photo_url !== undefined && structure.photo_url !== student.photo_url) {
        student.photo_url = structure.photo_url;

        // If photo URL is provided, re-register face with Face++
        if (structure.photo_url) {
          try {
            const faceDetection = await faceProviderService.detectFace(structure.photo_url);

            if (faceDetection.success) {
              student.face_token = faceDetection.face_token;
            } else {
              // Face detection failed - keep old face_token and warn admin
              faceUpdateWarning = `Photo URL updated but face registration failed: ${faceDetection.error}. Old facial data retained.`;
              console.warn(
                `Face re-registration failed for student ${student.matric_no}: ${faceDetection.error}`,
              );
            }
          } catch (error) {
            faceUpdateWarning = `Photo URL updated but face registration encountered an error. Old facial data retained.`;
            console.error(
              `Face re-registration error for student ${student.matric_no}:`,
              error,
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
          member_id: student.member_id,
          employee_id: student.employee_id,
          username: student.username,
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
   * Activate student
   * PATCH /api/admin/students/:id/activate
   */
  async activateStudent(req, res) {
    try {
      const { id } = req.params;

      const student = await Student.findOne(getTenantScopedFilter(req, { _id: id }));
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      student.is_active = true;
      await student.save();

      res.json({
        message: "Student marked active",
        student: {
          id: student._id,
          matric_no: student.matric_no,
          is_active: true,
        },
      });
    } catch (error) {
      console.error("Activate student error:", error);
      res.status(500).json({ error: "Failed to activate student" });
    }
  }

  /**
   * Deactivate student
   * PATCH /api/admin/students/:id/deactivate
   */
  async deactivateStudent(req, res) {
    try {
      const { id } = req.params;

      const student = await Student.findOne(getTenantScopedFilter(req, { _id: id }));
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      student.is_active = false;
      await student.save();

      res.json({
        message: "Student marked inactive",
        student: {
          id: student._id,
          matric_no: student.matric_no,
          is_active: false,
        },
      });
    } catch (error) {
      console.error("Deactivate student error:", error);
      res.status(500).json({ error: "Failed to deactivate student" });
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

      const student = await Student.findOne(getTenantScopedFilter(req, { _id: id }));

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
        await Vote.deleteMany(getTenantScopedFilter(req, { student_id: id }));
        await Student.findOneAndDelete(getTenantScopedFilter(req, { _id: id }));

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
        getTenantScopedFilter(req, { _id: { $in: student_ids } }),
        { $set: updateFields },
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
      const cacheKey = buildTenantCacheKey(req, `admin:college_stats:${collegeId}`);
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
      const college = await College.findOne(
        getTenantScopedFilter(req, { _id: collegeId }),
      )
        .select("name code")
        .lean();

      if (!college) {
        return res.status(404).json({ error: "College not found" });
      }

      // Run all queries in parallel for speed
      const [totalStudents, activeStudents, departmentStats, levelStats] =
        await Promise.all([
          Student.countDocuments(
            getTenantScopedFilter(req, { college: college.name }),
          ),
          Student.countDocuments(
            getTenantScopedFilter(req, { college: college.name, is_active: true }),
          ),
          Student.aggregate(
            prependTenantMatch(req, [
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
          ),
          Student.aggregate(
            prependTenantMatch(req, [
              { $match: { college: college.name } },
              {
                $group: {
                  _id: "$level",
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ]),
          ),
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
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(
        Math.max(parseInt(req.query.limit, 10) || 20, 1),
        100,
      );
      const status = req.query.status;
      const useFresh = req.query.fresh === "true";

      const filter = getTenantScopedFilter(req, {});
      if (status && ["active", "upcoming", "ended"].includes(status)) {
        filter.status = status;
      }

      const cacheKey = buildTenantCacheKey(
        req,
        `admin:sessions:list:${page}:${limit}:${status || "all"}`,
      );
      const cachedSessions = await cacheService.get(cacheKey);

      if (!useFresh && cachedSessions) {
        return res.json({
          ...cachedSessions,
          cached: true,
        });
      }

      const [sessions, total] = await Promise.all([
        VotingSession.find(filter)
          .populate("candidates", "name position photo_url vote_count")
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        VotingSession.countDocuments(filter),
      ]);

      const sessionIds = sessions.map((session) => session._id);
      const [votesByCandidate, uniqueVotersPerSession] = await Promise.all([
        Vote.aggregate(
          prependTenantMatch(req, [
            {
              $match: {
                session_id: { $in: sessionIds },
                status: "valid",
              },
            },
            {
              $group: {
                _id: {
                  session_id: "$session_id",
                  candidate_id: "$candidate_id",
                },
                count: { $sum: 1 },
              },
            },
          ]),
        ),
        Vote.aggregate(
          prependTenantMatch(req, [
            {
              $match: {
                session_id: { $in: sessionIds },
                status: "valid",
              },
            },
            {
              $group: {
                _id: {
                  session_id: "$session_id",
                  student_id: "$student_id",
                },
              },
            },
            {
              $group: {
                _id: "$_id.session_id",
                students_voted: { $sum: 1 },
              },
            },
          ]),
        ),
      ]);

      const candidateVoteMap = new Map(
        votesByCandidate.map((item) => [
          `${item._id.session_id.toString()}:${item._id.candidate_id.toString()}`,
          item.count,
        ]),
      );

      const voterCountMap = new Map(
        uniqueVotersPerSession.map((item) => [
          item._id.toString(),
          item.students_voted,
        ]),
      );

      for (const session of sessions) {
        const sessionKey = session._id.toString();
        session.total_votes = voterCountMap.get(sessionKey) || 0;
        session.students_voted = voterCountMap.get(sessionKey) || 0;

        if (session.candidates && session.candidates.length > 0) {
          session.candidates = session.candidates.map((candidate) => ({
            ...candidate,
            vote_count:
              candidateVoteMap.get(
                `${sessionKey}:${candidate._id.toString()}`,
              ) || 0,
          }));
        }
      }

      const payload = {
        sessions,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };

      if (!useFresh) {
        await cacheService.set(cacheKey, payload, 120);
      }

      res.json({
        ...payload,
        cached: false,
      });
    } catch (error) {
      console.error("Get sessions error:", error);
      res.status(500).json({ error: "Failed to get sessions" });
    }
  }

  /**
   * Get sessions overview stats
   * GET /api/admin/sessions/summary
   */
  async getSessionsSummary(req, res) {
    try {
      const useFresh = req.query.fresh === "true";
      const cacheKey = buildTenantCacheKey(req, "admin:sessions:summary");
      const cachedSummary = await cacheService.get(cacheKey);

      if (!useFresh && cachedSummary) {
        return res.json({
          summary: cachedSummary,
          cached: true,
        });
      }

      const [
        totalSessions,
        activeSessions,
        upcomingSessions,
        endedSessions,
        totalVotes,
      ] = await Promise.all([
        VotingSession.countDocuments(getTenantScopedFilter(req, {})),
        VotingSession.countDocuments(
          getTenantScopedFilter(req, { status: "active" }),
        ),
        VotingSession.countDocuments(
          getTenantScopedFilter(req, { status: "upcoming" }),
        ),
        VotingSession.countDocuments(
          getTenantScopedFilter(req, { status: "ended" }),
        ),
        Vote.countDocuments(getTenantScopedFilter(req, { status: "valid" })),
      ]);

      const summary = {
        total_sessions: totalSessions,
        active_sessions: activeSessions,
        upcoming_sessions: upcomingSessions,
        ended_sessions: endedSessions,
        total_votes: totalVotes,
      };

      if (!useFresh) {
        await cacheService.set(cacheKey, summary, 60);
      }

      res.json({ summary, cached: false });
    } catch (error) {
      console.error("Get sessions summary error:", error);
      res.status(500).json({ error: "Failed to get sessions summary" });
    }
  }

  /**
   * Get advanced analytics overview
   * GET /api/admin/analytics/overview
   */
  async getAnalyticsOverview(req, res) {
    try {
      const useFresh = req.query.fresh === "true";
      const cacheKey = buildTenantCacheKey(req, "admin:analytics:overview");
      const cachedOverview = await cacheService.get(cacheKey);

      if (!useFresh && cachedOverview) {
        return res.json({
          ...cachedOverview,
          cached: true,
        });
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalStudents,
        studentsWhoVoted,
        totalSessions,
        totalVotes,
        activeSessions,
        upcomingSessions,
        endedSessions,
        topVoters,
        recentAuditLogs,
        voteTrend,
      ] = await Promise.all([
        Student.countDocuments(getTenantScopedFilter(req, {})),
        Student.countDocuments(
          getTenantScopedFilter(req, {
            has_voted_sessions: { $exists: true, $ne: [] },
          }),
        ),
        VotingSession.countDocuments(getTenantScopedFilter(req, {})),
        Vote.countDocuments(getTenantScopedFilter(req, { status: "valid" })),
        VotingSession.countDocuments(
          getTenantScopedFilter(req, { status: "active" }),
        ),
        VotingSession.countDocuments(
          getTenantScopedFilter(req, { status: "upcoming" }),
        ),
        VotingSession.find(getTenantScopedFilter(req, { status: "ended" }))
          .select(
            "title status start_time end_time eligible_college eligible_departments eligible_levels",
          )
          .sort({ end_time: -1 })
          .lean(),
        Student.aggregate(
          prependTenantMatch(req, [
            {
              $project: {
                matric_no: 1,
                member_id: 1,
                employee_id: 1,
                username: 1,
                email: 1,
                full_name: 1,
                department: 1,
                college: 1,
                display_identifier: {
                  $ifNull: [
                    "$member_id",
                    {
                      $ifNull: [
                        "$employee_id",
                        {
                          $ifNull: [
                            "$username",
                            { $ifNull: ["$matric_no", "$email"] },
                          ],
                        },
                      ],
                    },
                  ],
                },
                votes_cast: {
                  $size: { $ifNull: ["$has_voted_sessions", []] },
                },
              },
            },
            { $match: { votes_cast: { $gt: 0 } } },
            { $sort: { votes_cast: -1, full_name: 1 } },
            { $limit: 5 },
          ]),
        ),
        AuditLog.find(getTenantScopedFilter(req, { user_type: "admin" }))
          .sort({ createdAt: -1 })
          .limit(8)
          .populate("user_id", "full_name email")
          .lean(),
        Vote.aggregate(
          prependTenantMatch(req, [
            {
              $match: {
                createdAt: { $gte: sevenDaysAgo },
                status: "valid",
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ]),
        ),
      ]);

      const turnoutSnapshots = await Promise.all(
        endedSessions.map(async (session) => {
          const [eligibleStudents, validVotes] = await Promise.all([
            countEligibleStudents(req, session),
            Vote.countDocuments(
              getTenantScopedFilter(req, {
                session_id: session._id,
                status: "valid",
              }),
            ),
          ]);

          return {
            id: session._id,
            title: session.title,
            eligible_students: eligibleStudents,
            valid_votes: validVotes,
            turnout_percentage:
              eligibleStudents > 0
                ? Number(((validVotes / eligibleStudents) * 100).toFixed(2))
                : 0,
          };
        }),
      );

      const sessionsWithEligiblePool = turnoutSnapshots.filter(
        (entry) => entry.eligible_students > 0,
      );
      const averageTurnout =
        sessionsWithEligiblePool.length > 0
          ? Number(
              (
                sessionsWithEligiblePool.reduce(
                  (sum, entry) => sum + entry.turnout_percentage,
                  0,
                ) / sessionsWithEligiblePool.length
              ).toFixed(2),
            )
          : 0;
      const participationRate =
        totalStudents > 0
          ? Number(((studentsWhoVoted / totalStudents) * 100).toFixed(2))
          : 0;

      const responseData = {
        overview: {
          total_students: totalStudents,
          students_who_voted: studentsWhoVoted,
          total_sessions: totalSessions,
          total_votes: totalVotes,
          active_sessions: activeSessions,
          upcoming_sessions: upcomingSessions,
          ended_sessions: endedSessions.length,
          average_turnout: averageTurnout,
          participation_rate: participationRate,
        },
        top_voters: topVoters,
        recent_activities: recentAuditLogs.map((log) => ({
          id: log._id,
          action: log.action,
          resource: log.resource,
          status: log.status,
          timestamp: log.createdAt,
          user_name: log.user_id?.full_name || log.user_id?.email || "Unknown",
        })),
        vote_trend: voteTrend.map((entry) => ({
          date: entry._id,
          votes: entry.count,
        })),
        turnout_snapshots: turnoutSnapshots.slice(0, 6),
        cached: false,
      };

      await cacheService.set(cacheKey, responseData, 120);

      res.json(responseData);
    } catch (error) {
      console.error("Get analytics overview error:", error);
      res.status(500).json({ error: "Failed to get analytics overview" });
    }
  }

  /**
   * Get single session by ID
   * GET /api/admin/sessions/:id
   */
  async getSessionById(req, res) {
    try {
      const { id } = req.params;

      const session = await VotingSession.findOne(
        getTenantScopedFilter(req, { _id: id }),
      )
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
        Vote.countDocuments(
          getTenantScopedFilter(req, { session_id: id, status: "valid" }),
        ),
        Vote.countDocuments(
          getTenantScopedFilter(req, { session_id: id, status: "duplicate" }),
        ),
        Vote.countDocuments(
          getTenantScopedFilter(req, { session_id: id, status: "rejected" }),
        ),
        countEligibleStudents(req, session),
        getVotesByCandidate(req, id),
      ]);

      const candidatesWithVotes = mapCandidatesWithVoteCounts(
        session.candidates,
        votesByCandidate,
        totalVotes,
      );

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
      const cacheKey = buildTenantCacheKey(req, `admin:session_stats:${id}`);
      const cachedStats = await cacheService.get(cacheKey);

      if (cachedStats) {
        return res.json({
          ...cachedStats,
          cached: true,
        });
      }

      // Cache miss - query database
      const session = await VotingSession.findOne(
        getTenantScopedFilter(req, { _id: id }),
      )
        .populate("candidates", "name position photo_url")
        .lean();

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Run all stat queries in parallel
      const [
        totalVotes,
        duplicateAttempts,
        rejectedVotes,
        eligibleStudents,
        votesByCandidate,
      ] =
        await Promise.all([
          Vote.countDocuments(
            getTenantScopedFilter(req, { session_id: id, status: "valid" }),
          ),
          Vote.countDocuments(
            getTenantScopedFilter(req, { session_id: id, status: "duplicate" }),
          ),
          Vote.countDocuments(
            getTenantScopedFilter(req, { session_id: id, status: "rejected" }),
          ),
          countEligibleStudents(req, session),
          getVotesByCandidate(req, id),
        ]);

      const candidatesWithVotes = mapCandidatesWithVoteCounts(
        session.candidates,
        votesByCandidate,
        totalVotes,
      );

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
        candidates: candidatesWithVotes,
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
   * Get advanced session analytics
   * GET /api/admin/analytics/sessions/:id
   */
  async getAdvancedSessionAnalytics(req, res) {
    try {
      const { id } = req.params;
      const cacheKey = buildTenantCacheKey(req, `admin:advanced_session_stats:${id}`);
      const cachedStats = await cacheService.get(cacheKey);

      if (cachedStats) {
        return res.json({
          ...cachedStats,
          cached: true,
        });
      }

      const session = await VotingSession.findOne(
        getTenantScopedFilter(req, { _id: id }),
      )
        .populate("candidates", "name position photo_url bio manifesto")
        .lean();

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const [
        totalVotes,
        duplicateAttempts,
        rejectedVotes,
        eligibleStudents,
        votesByCandidate,
      ] = await Promise.all([
        Vote.countDocuments(
          getTenantScopedFilter(req, { session_id: id, status: "valid" }),
        ),
        Vote.countDocuments(
          getTenantScopedFilter(req, { session_id: id, status: "duplicate" }),
        ),
        Vote.countDocuments(
          getTenantScopedFilter(req, { session_id: id, status: "rejected" }),
        ),
        countEligibleStudents(req, session),
        getVotesByCandidate(req, id),
      ]);

      const candidates = mapCandidatesWithVoteCounts(
        session.candidates,
        votesByCandidate,
        totalVotes,
      ).sort((left, right) => right.vote_count - left.vote_count);

      const responseData = {
        session: {
          id: session._id,
          title: session.title,
          status: session.status,
          start_time: session.start_time,
          end_time: session.end_time,
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
        candidates,
        cached: false,
      };

      await cacheService.set(cacheKey, responseData, 120);

      res.json(responseData);
    } catch (error) {
      console.error("Get advanced session analytics error:", error);
      res.status(500).json({ error: "Failed to get advanced session analytics" });
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
        "-password_hash -reset_password_code",
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
