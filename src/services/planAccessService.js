const Student = require("../models/Student");
const VotingSession = require("../models/VotingSession");
const TenantAdminMembership = require("../models/TenantAdminMembership");
const {
  comparePlanRank,
  getPlanDefinition,
} = require("../config/billingPlans");

const FEATURE_MIN_PLAN = {
  advanced_analytics: "pro_plus",
  realtime_support: "pro_plus",
  push_notifications: "pro_plus",
  advanced_reports: "pro_plus",
  custom_terminology: "pro_plus",
  custom_identity_policy: "pro_plus",
  custom_branding: "enterprise",
};

function readMapLikeValue(mapLike, key) {
  if (!mapLike) return undefined;
  if (typeof mapLike.get === "function") {
    return mapLike.get(key);
  }
  return mapLike[key];
}

function getTenantPlanDefinition(tenant) {
  return getPlanDefinition(tenant?.plan_code || "pro");
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

  const planEntitlement =
    getTenantPlanDefinition(tenant).entitlements?.[featureKey];
  if (typeof planEntitlement === "boolean") {
    return planEntitlement;
  }

  const minimumPlan = FEATURE_MIN_PLAN[featureKey];
  if (!minimumPlan) {
    return false;
  }

  return comparePlanRank(tenant?.plan_code || "pro", minimumPlan) >= 0;
}

function getFeatureMinimumPlan(featureKey) {
  return FEATURE_MIN_PLAN[featureKey] || null;
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
  return `Your current plan allows ${quotaStatus.limit} ${entityLabel}. Upgrade the tenant plan before adding more.`;
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
