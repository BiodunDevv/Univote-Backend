const mongoose = require("mongoose");
const Tenant = require("../models/Tenant");
const VotingSession = require("../models/VotingSession");
const Vote = require("../models/Vote");
const Student = require("../models/Student");
const Candidate = require("../models/Candidate");
const VerificationLog = require("../models/VerificationLog");
const College = require("../models/College");
const cacheService = require("./cacheService");
const {
  getTenantEligibilityPolicy,
} = require("../utils/tenantSettings");

const PUBLIC_CODE_PREFIX = "univote";
const UNKNOWN_GROUP = "Unassigned";

function formatLivePublicCode(sequence) {
  return `${PUBLIC_CODE_PREFIX}${String(sequence).padStart(3, "0")}`;
}

function normalizeGroupValue(value) {
  const normalized = String(value || "").trim();
  return normalized || UNKNOWN_GROUP;
}

function calculateSessionStatus(session) {
  const now = new Date();
  if (now < session.start_time) return "upcoming";
  if (now >= session.start_time && now <= session.end_time) return "active";
  return "ended";
}

function buildScopedFilter(tenantId, filter = {}) {
  return {
    ...filter,
    tenant_id: tenantId || null,
  };
}

async function getNextLiveSequence(tenantId) {
  const latest = await VotingSession.findOne(buildScopedFilter(tenantId, {
    live_sequence: { $ne: null },
  }))
    .sort({ live_sequence: -1 })
    .select("live_sequence")
    .lean();

  return Number(latest?.live_sequence || 0) + 1;
}

async function assignLivePublicCode(session) {
  if (session.live_public_code && session.live_sequence) {
    return session;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const sequence = (await getNextLiveSequence(session.tenant_id || null)) + attempt;
    session.live_sequence = sequence;
    session.live_public_code = formatLivePublicCode(sequence);

    try {
      await session.save();
      return session;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw new Error("Unable to assign a unique live public code");
}

async function resolveEligibleDepartmentNames(tenantId, eligibleDepartmentIds = []) {
  if (!eligibleDepartmentIds || eligibleDepartmentIds.length === 0) {
    return [];
  }

  const colleges = await College.find(buildScopedFilter(tenantId, {}))
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

async function buildEligibilityContext(tenant, session) {
  const tenantId = tenant?._id || session?.tenant_id || null;
  const eligibilityFilter = buildScopedFilter(tenantId, { is_active: true });
  const eligibilityPolicy = getTenantEligibilityPolicy(tenant || null);
  const scope = {
    tenant_wide: true,
    college: null,
    departments: [],
    levels: [],
  };

  if (eligibilityPolicy.college && session.eligible_college) {
    eligibilityFilter.college = session.eligible_college;
    scope.tenant_wide = false;
    scope.college = session.eligible_college;
  }

  if (
    eligibilityPolicy.department &&
    session.eligible_departments &&
    session.eligible_departments.length > 0
  ) {
    const departmentNames = await resolveEligibleDepartmentNames(
      tenantId,
      session.eligible_departments,
    );

    if (departmentNames.length > 0) {
      eligibilityFilter.department = { $in: departmentNames };
      scope.tenant_wide = false;
      scope.departments = departmentNames;
    }
  }

  if (
    eligibilityPolicy.level &&
    session.eligible_levels &&
    session.eligible_levels.length > 0
  ) {
    eligibilityFilter.level = { $in: session.eligible_levels };
    scope.tenant_wide = false;
    scope.levels = session.eligible_levels.map(String);
  }

  return {
    filter: eligibilityFilter,
    scope,
  };
}

function sortBreakdown(rows) {
  return rows.sort((left, right) => {
    if (right.voted !== left.voted) return right.voted - left.voted;
    if (right.eligible !== left.eligible) return right.eligible - left.eligible;
    return left.name.localeCompare(right.name);
  });
}

async function getDistinctVoterIds(tenantId, sessionId) {
  const sessionObjectId = new mongoose.Types.ObjectId(sessionId);
  return Vote.distinct("student_id", buildScopedFilter(tenantId, {
    session_id: sessionObjectId,
    status: "valid",
  }));
}

async function aggregateStudentBreakdowns(matchFilter, countField = "count") {
  const rows = await Student.aggregate([
    {
      $match: matchFilter,
    },
    {
      $facet: {
        colleges: [
          {
            $group: {
              _id: { $ifNull: ["$college", UNKNOWN_GROUP] },
              count: { $sum: 1 },
            },
          },
        ],
        departments: [
          {
            $group: {
              _id: { $ifNull: ["$department", UNKNOWN_GROUP] },
              count: { $sum: 1 },
            },
          },
        ],
        levels: [
          {
            $group: {
              _id: { $ifNull: ["$level", UNKNOWN_GROUP] },
              count: { $sum: 1 },
            },
          },
        ],
      },
    },
  ]);

  const result = rows[0] || {};
  const mapGroup = (entries = []) =>
    entries.map((entry) => ({
      name: normalizeGroupValue(entry._id),
      [countField]: entry.count,
    }));

  return {
    colleges: mapGroup(result.colleges),
    departments: mapGroup(result.departments),
    levels: mapGroup(result.levels),
  };
}

function mergeBreakdownRows(eligibleRows = [], votedRows = []) {
  const rowsByName = new Map();

  eligibleRows.forEach((row) => {
    rowsByName.set(row.name, {
      name: row.name,
      eligible: row.eligible || 0,
      voted: 0,
    });
  });

  votedRows.forEach((row) => {
    const current = rowsByName.get(row.name) || {
      name: row.name,
      eligible: 0,
      voted: 0,
    };
    current.voted = row.voted || 0;
    rowsByName.set(row.name, current);
  });

  return sortBreakdown(
    Array.from(rowsByName.values()).map((row) => ({
      ...row,
      not_voted: Math.max((row.eligible || 0) - (row.voted || 0), 0),
      turnout_percentage:
        row.eligible > 0
          ? Number(((row.voted / row.eligible) * 100).toFixed(2))
          : 0,
    })),
  );
}

async function getTurnoutBreakdowns(tenantId, eligibilityFilter, voterIds) {
  const votedFilter = buildScopedFilter(tenantId, {
    _id: { $in: voterIds },
  });
  const [eligibleBreakdowns, votedBreakdowns] = await Promise.all([
    aggregateStudentBreakdowns(eligibilityFilter, "eligible"),
    voterIds.length
      ? aggregateStudentBreakdowns(votedFilter, "voted")
      : Promise.resolve({ colleges: [], departments: [], levels: [] }),
  ]);

  return {
    colleges: mergeBreakdownRows(
      eligibleBreakdowns.colleges,
      votedBreakdowns.colleges,
    ),
    departments: mergeBreakdownRows(
      eligibleBreakdowns.departments,
      votedBreakdowns.departments,
    ),
    levels: mergeBreakdownRows(
      eligibleBreakdowns.levels,
      votedBreakdowns.levels,
    ),
  };
}

async function buildPublicLivePayload({ tenant, session }) {
  const tenantId = tenant?._id || session.tenant_id || null;
  const status = calculateSessionStatus(session);
  const [eligibility, voterIds] = await Promise.all([
    buildEligibilityContext(tenant, session),
    getDistinctVoterIds(tenantId, session._id),
  ]);
  const eligibleFilter = eligibility.filter;
  const [totalEligible, breakdowns] = await Promise.all([
    Student.countDocuments(eligibleFilter),
    getTurnoutBreakdowns(tenantId, eligibleFilter, voterIds),
  ]);
  const totalVoted = voterIds.length;

  return {
    organization: {
      id: tenant?._id || null,
      name: tenant?.name || null,
      slug: tenant?.slug || null,
      branding: tenant?.branding || {},
    },
    session: {
      id: session._id,
      title: session.title,
      description: session.description,
      status,
      start_time: session.start_time,
      end_time: session.end_time,
      live_public_code: session.live_public_code,
      is_live: status === "active",
    },
    totals: {
      eligible: totalEligible,
      voted: totalVoted,
      not_voted: Math.max(totalEligible - totalVoted, 0),
      turnout_percentage:
        totalEligible > 0 ? Number(((totalVoted / totalEligible) * 100).toFixed(2)) : 0,
    },
    eligibility: eligibility.scope,
    breakdowns,
    last_updated: new Date().toISOString(),
  };
}

async function getPublicLivePayload(tenantSlug, liveCode) {
  const slug = String(tenantSlug || "").trim().toLowerCase();
  const code = String(liveCode || "").trim().toLowerCase();
  const tenant = await Tenant.findOne({
    slug,
    status: "active",
    is_active: true,
  }).lean();

  if (!tenant) {
    return null;
  }

  const session = await VotingSession.findOne({
    tenant_id: tenant._id,
    live_public_code: code,
  }).lean();

  if (!session) {
    return null;
  }

  return buildPublicLivePayload({ tenant, session });
}

function confidenceBand(value) {
  if (typeof value !== "number") return null;
  if (value >= 90) return "high";
  if (value >= 75) return "medium";
  return "low";
}

function locationSignal(log) {
  const lat = log.geo_location?.lat;
  const lng = log.geo_location?.lng;
  return typeof lat === "number" && typeof lng === "number" ? "provided" : "missing";
}

function deviceSignal(value) {
  return value ? "provided" : "missing";
}

async function getCandidateStandings(tenantId, sessionId, totalVoteRows) {
  const sessionObjectId = new mongoose.Types.ObjectId(sessionId);
  const [candidates, votesByCandidate] = await Promise.all([
    Candidate.find(buildScopedFilter(tenantId, { session_id: sessionObjectId }))
      .select("name position photo_url")
      .lean(),
    Vote.aggregate([
      {
        $match: buildScopedFilter(tenantId, {
          session_id: sessionObjectId,
          status: "valid",
        }),
      },
      {
        $group: {
          _id: "$candidate_id",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const voteMap = new Map(
    votesByCandidate.map((entry) => [entry._id.toString(), entry.count]),
  );

  const standings = candidates.map((candidate) => {
    const voteCount = voteMap.get(candidate._id.toString()) || 0;
    return {
      id: candidate._id,
      name: candidate.name,
      position: candidate.position,
      photo_url: candidate.photo_url,
      vote_count: voteCount,
      percentage:
        totalVoteRows > 0
          ? Number(((voteCount / totalVoteRows) * 100).toFixed(2))
          : 0,
    };
  });

  const grouped = standings.reduce((acc, candidate) => {
    if (!acc[candidate.position]) {
      acc[candidate.position] = {
        position: candidate.position,
        total_votes: 0,
        candidates: [],
      };
    }
    acc[candidate.position].total_votes += candidate.vote_count;
    acc[candidate.position].candidates.push(candidate);
    return acc;
  }, {});

  Object.values(grouped).forEach((group) => {
    const maxVotes = Math.max(0, ...group.candidates.map((candidate) => candidate.vote_count));
    group.candidates = group.candidates
      .map((candidate) => ({
        ...candidate,
        is_leading: candidate.vote_count === maxVotes && maxVotes > 0,
      }))
      .sort((left, right) => right.vote_count - left.vote_count);
  });

  return Object.values(grouped);
}

async function getVerificationSummary(tenantId, sessionId) {
  const sessionObjectId = new mongoose.Types.ObjectId(sessionId);
  const result = await VerificationLog.aggregate([
    {
      $match: buildScopedFilter(tenantId, {
        session_id: sessionObjectId,
      }),
    },
    {
      $group: {
        _id: null,
        total_attempts: { $sum: 1 },
        accepted: {
          $sum: { $cond: [{ $eq: ["$result", "accepted"] }, 1, 0] },
        },
        rejected: {
          $sum: { $cond: [{ $eq: ["$result", "rejected"] }, 1, 0] },
        },
        lockouts: {
          $sum: { $cond: [{ $eq: ["$lockout_triggered", true] }, 1, 0] },
        },
      },
    },
  ]);

  const summary = result[0] || {
    total_attempts: 0,
    accepted: 0,
    rejected: 0,
    lockouts: 0,
  };

  return {
    ...summary,
    acceptance_rate:
      summary.total_attempts > 0
        ? Number(((summary.accepted / summary.total_attempts) * 100).toFixed(2))
        : 0,
  };
}

async function getAuditSafeLogs(tenantId, sessionId, limit = 25) {
  const logs = await VerificationLog.find(buildScopedFilter(tenantId, {
    session_id: sessionId,
  }))
    .select(
      "user_id result failure_reason liveness_status compare_confidence threshold_used lockout_triggered device_id geo_location timestamp createdAt",
    )
    .populate("user_id", "college department level")
    .sort({ timestamp: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return logs.map((log) => ({
    id: log._id,
    timestamp: log.timestamp || log.createdAt,
    result: log.result,
    failure_reason: log.failure_reason || null,
    liveness_status: log.liveness_status || null,
    confidence_band: confidenceBand(log.compare_confidence),
    threshold_used: log.threshold_used ?? null,
    lockout_triggered: log.lockout_triggered === true,
    college: normalizeGroupValue(log.user_id?.college),
    department: normalizeGroupValue(log.user_id?.department),
    level: normalizeGroupValue(log.user_id?.level),
    device_signal: deviceSignal(log.device_id),
    location_signal: locationSignal(log),
  }));
}

async function getAdminLivePayload(req, sessionId) {
  const tenantId = req.tenantId || req.tenant?._id || null;
  const cacheKey = `admin:session_live:${tenantId || "legacy"}:${sessionId}`;
  const cached = await cacheService.get(cacheKey);

  if (cached) {
    return {
      ...cached,
      cached: true,
    };
  }

  const session = await VotingSession.findOne(
    buildScopedFilter(tenantId, { _id: sessionId }),
  ).lean();

  if (!session) {
    return null;
  }

  const publicPayload = await buildPublicLivePayload({
    tenant: req.tenant || null,
    session,
  });
  const totalVoteRows = await Vote.countDocuments(
    buildScopedFilter(tenantId, {
      session_id: sessionId,
      status: "valid",
    }),
  );
  const [candidate_standings, verification_summary, recent_logs] =
    await Promise.all([
      getCandidateStandings(tenantId, sessionId, totalVoteRows),
      getVerificationSummary(tenantId, sessionId),
      getAuditSafeLogs(tenantId, sessionId),
    ]);

  const payload = {
    ...publicPayload,
    totals: {
      ...publicPayload.totals,
      vote_rows: totalVoteRows,
    },
    candidate_standings,
    verification_summary,
    recent_logs,
    cached: false,
  };

  await cacheService.set(cacheKey, payload, publicPayload.session.is_live ? 5 : 60);
  return payload;
}

module.exports = {
  formatLivePublicCode,
  assignLivePublicCode,
  getPublicLivePayload,
  getAdminLivePayload,
};
