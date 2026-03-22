const Student = require("../models/Student");
const VotingSession = require("../models/VotingSession");
const TenantAdminMembership = require("../models/TenantAdminMembership");
const UNIVERSITY_DEFAULT_PLAN = {
  code: "university",
  name: "University",
  rank: 1,
  monthly_price_ngn: 0,
  support_sla: "Standard",
  limits: {
    admins: 9999,
    students: 500000,
    active_sessions: 5000,
  },
  entitlements: {
    custom_terminology: true,
    custom_identity_policy: true,
    custom_participant_structure: true,
    custom_branding: true,
    advanced_analytics: true,
    advanced_reports: true,
    realtime_support: true,
    push_notifications: true,
    face_verification: true,
  },
};

function readMapLikeValue(mapLike, key) {
  if (!mapLike) return undefined;
  if (typeof mapLike.get === "function") {
    return mapLike.get(key);
  }
  return mapLike[key];
}

function getTenantPlanDefinition(tenant) {
  return {
    ...UNIVERSITY_DEFAULT_PLAN,
    code: tenant?.plan_code || UNIVERSITY_DEFAULT_PLAN.code,
  };
}

function getTenantLimit(tenant, quotaKey) {
  const override = readMapLikeValue(tenant?.quota_overrides, quotaKey);
  if (override !== undefined && override !== null && override !== "") {
    const parsed = Number(override);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return getTenantPlanDefinition(tenant).limits[quotaKey];
}

function hasTenantFeature(tenant, featureKey) {
  const override = readMapLikeValue(tenant?.feature_flags, featureKey);
  if (typeof override === "boolean") {
    return override;
  }
  return true;
}

function getFeatureMinimumPlan(featureKey) {
  return featureKey ? "university" : null;
}

async function getTenantUsageSnapshot(tenantId) {
  const now = new Date();

  const [admins, students, activeSessions] = await Promise.all([
    TenantAdminMembership.countDocuments({
      tenant_id: tenantId,
      is_active: true,
    }),
    Student.countDocuments({
      tenant_id: tenantId,
    }),
    VotingSession.countDocuments({
      tenant_id: tenantId,
      end_time: { $gte: now },
    }),
  ]);

  return {
    admins,
    students,
    active_sessions: activeSessions,
  };
}

async function getTenantQuotaStatus(
  tenant,
  tenantId,
  quotaKey,
  increment = 0,
  usageSnapshot = null,
) {
  const usage = usageSnapshot || (await getTenantUsageSnapshot(tenantId));
  const current = usage[quotaKey] || 0;
  const limit = getTenantLimit(tenant, quotaKey);
  const next = current + increment;

  return {
    quotaKey,
    limit,
    current,
    next,
    remaining: Math.max(limit - current, 0),
    allowed: next <= limit,
  };
}

function buildQuotaErrorMessage(quotaStatus, entityLabel) {
  return `The current university workspace limit allows ${quotaStatus.limit} ${entityLabel}.`;
}

function getTenantEntitlements(tenant) {
  const plan = getTenantPlanDefinition(tenant);
  return {
    ...plan.entitlements,
    quotas: {
      admins: getTenantLimit(tenant, "admins"),
      students: getTenantLimit(tenant, "students"),
      active_sessions: getTenantLimit(tenant, "active_sessions"),
    },
    support_sla: plan.support_sla,
  };
}

module.exports = {
  buildQuotaErrorMessage,
  getFeatureMinimumPlan,
  getTenantEntitlements,
  getTenantLimit,
  getTenantPlanDefinition,
  getTenantQuotaStatus,
  getTenantUsageSnapshot,
  hasTenantFeature,
};
