const DEFAULT_PLAN_DEFINITIONS = {
  pro: {
    code: "pro",
    name: "Pro",
    rank: 1,
    monthly_price_ngn: 75000,
    support_sla: "Standard",
    limits: {
      admins: 5,
      students: 5000,
      active_sessions: 3,
    },
    entitlements: {
      custom_terminology: false,
      custom_identity_policy: false,
      custom_participant_structure: false,
      custom_branding: false,
      advanced_analytics: false,
      advanced_reports: false,
      realtime_support: false,
      push_notifications: false,
      face_verification: true,
    },
    features: [
      "Core election management",
      "Student web portal",
      "Ticket support",
      "Standard analytics",
    ],
  },
  pro_plus: {
    code: "pro_plus",
    name: "Pro Plus",
    rank: 2,
    monthly_price_ngn: 180000,
    support_sla: "Priority",
    limits: {
      admins: 15,
      students: 20000,
      active_sessions: 10,
    },
    entitlements: {
      custom_terminology: true,
      custom_identity_policy: true,
      custom_participant_structure: true,
      custom_branding: false,
      advanced_analytics: true,
      advanced_reports: true,
      realtime_support: true,
      push_notifications: true,
      face_verification: true,
    },
    features: [
      "Everything in Pro",
      "Advanced analytics",
      "Real-time support chat",
      "Push notifications",
    ],
  },
  enterprise: {
    code: "enterprise",
    name: "Enterprise",
    rank: 3,
    monthly_price_ngn: 350000,
    support_sla: "Dedicated",
    limits: {
      admins: 9999,
      students: 200000,
      active_sessions: 999,
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
    features: [
      "Everything in Pro Plus",
      "Custom branding controls",
      "Priority onboarding",
      "Custom quota overrides",
    ],
  },
};

let planDefinitions = JSON.parse(JSON.stringify(DEFAULT_PLAN_DEFINITIONS));

function clonePlanCatalog(source = planDefinitions) {
  return JSON.parse(JSON.stringify(source));
}

function normalizePlanDefinition(plan) {
  const limits = plan?.limits || {};
  const entitlements = plan?.entitlements || {};
  return {
    code: String(plan?.code || "").trim(),
    name: String(plan?.name || "").trim(),
    rank: Number(plan?.rank || 0),
    monthly_price_ngn: Number(plan?.monthly_price_ngn || 0),
    support_sla: String(plan?.support_sla || "Standard").trim(),
    limits: {
      admins: Number(limits.admins || 0),
      students: Number(limits.students || 0),
      active_sessions: Number(limits.active_sessions || 0),
    },
    entitlements: {
      custom_terminology: Boolean(entitlements.custom_terminology),
      custom_identity_policy: Boolean(entitlements.custom_identity_policy),
      custom_participant_structure: Boolean(
        entitlements.custom_participant_structure,
      ),
      custom_branding: Boolean(entitlements.custom_branding),
      advanced_analytics: Boolean(entitlements.advanced_analytics),
      advanced_reports: Boolean(entitlements.advanced_reports),
      realtime_support: Boolean(entitlements.realtime_support),
      push_notifications: Boolean(entitlements.push_notifications),
      face_verification: Boolean(entitlements.face_verification),
    },
    features: Array.isArray(plan?.features)
      ? plan.features
          .map((feature) => String(feature || "").trim())
          .filter(Boolean)
      : [],
  };
}

function setPlanCatalog(nextCatalog = {}) {
  const normalizedCatalog = Object.values(nextCatalog).reduce(
    (accumulator, rawPlan) => {
      const normalizedPlan = normalizePlanDefinition(rawPlan);
      if (!normalizedPlan.code) {
        return accumulator;
      }

      accumulator[normalizedPlan.code] = normalizedPlan;
      return accumulator;
    },
    {},
  );

  if (Object.keys(normalizedCatalog).length === 0) {
    planDefinitions = clonePlanCatalog(DEFAULT_PLAN_DEFINITIONS);
    return planDefinitions;
  }

  planDefinitions = normalizedCatalog;
  return planDefinitions;
}

async function hydratePlanCatalogFromStore() {
  try {
    const PlatformSetting = require("../models/PlatformSetting");
    const platformSetting = await PlatformSetting.findOne({ key: "defaults" })
      .select("plan_catalog")
      .lean();

    if (platformSetting?.plan_catalog && Object.keys(platformSetting.plan_catalog).length > 0) {
      setPlanCatalog(platformSetting.plan_catalog);
    } else {
      setPlanCatalog(DEFAULT_PLAN_DEFINITIONS);
    }
  } catch (error) {
    console.warn("Failed to hydrate plan catalog, using defaults:", error.message);
    setPlanCatalog(DEFAULT_PLAN_DEFINITIONS);
  }

  return clonePlanCatalog(planDefinitions);
}

function getPlanDefinition(planCode) {
  return planDefinitions[planCode] || planDefinitions.pro || DEFAULT_PLAN_DEFINITIONS.pro;
}

function comparePlanRank(planA, planB) {
  return getPlanDefinition(planA).rank - getPlanDefinition(planB).rank;
}

function serializePlanCatalog() {
  return Object.values(planDefinitions)
    .sort((left, right) => left.rank - right.rank)
    .map((plan) => ({
      code: plan.code,
      name: plan.name,
      rank: plan.rank,
      monthly_price_ngn: plan.monthly_price_ngn,
      monthly_price_kobo: plan.monthly_price_ngn * 100,
      support_sla: plan.support_sla,
      limits: plan.limits,
      entitlements: plan.entitlements,
      features: plan.features,
    }));
}

module.exports = {
  DEFAULT_PLAN_DEFINITIONS,
  PLAN_DEFINITIONS: planDefinitions,
  clonePlanCatalog,
  getPlanDefinition,
  comparePlanRank,
  hydratePlanCatalogFromStore,
  normalizePlanDefinition,
  serializePlanCatalog,
  setPlanCatalog,
};
