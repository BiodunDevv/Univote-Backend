const Tenant = require("../models/Tenant");
const { getTenantBillingSnapshotBySlug } = require("../services/subscriptionService");
const {
  getFeatureMinimumPlan,
  hasTenantFeature,
} = require("../services/planAccessService");

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function getTenantSlugFromHost(hostHeader) {
  if (!hostHeader) return null;

  const host = String(hostHeader).split(":")[0].toLowerCase();
  if (!host || host === "localhost" || /^[0-9.]+$/.test(host)) {
    return null;
  }

  if (host.endsWith(".localhost")) {
    const slug = host.replace(/\.localhost$/, "").split(".")[0];
    return slug && slug !== "www" && slug !== "api" ? normalizeSlug(slug) : null;
  }

  if (process.env.APP_ROOT_DOMAIN) {
    const rootDomain = String(process.env.APP_ROOT_DOMAIN)
      .toLowerCase()
      .replace(/^\./, "");

    if (host === rootDomain) {
      return null;
    }

    if (!host.endsWith(`.${rootDomain}`)) {
      return null;
    }

    const suffix = `.${rootDomain}`;
    const slug = host.slice(0, -suffix.length);
    return slug && slug !== "www" && slug !== "api" ? normalizeSlug(slug) : null;
  }

  const parts = host.split(".");
  if (parts.length < 3) return null;

  const [slug] = parts;
  return slug && slug !== "www" && slug !== "api" ? normalizeSlug(slug) : null;
}

async function resolveTenantContext(req, _res, next) {
  try {
    const headerSlug = normalizeSlug(req.headers["x-tenant-slug"]);
    const hostSlug = getTenantSlugFromHost(req.headers.host);
    const fallbackSlug = normalizeSlug(process.env.DEFAULT_TENANT_SLUG);
    const slug = headerSlug || hostSlug || fallbackSlug || null;

    req.tenantSlug = slug;
    req.tenant = null;
    req.tenantId = null;
    req.tenantFilter = {};

    if (!slug) {
      return next();
    }

    const tenant = await getTenantBillingSnapshotBySlug(slug);

    if (tenant) {
      req.tenant = tenant;
      req.tenantId = tenant._id;
      req.tenantFilter = { tenant_id: tenant._id };
    }

    next();
  } catch (error) {
    next(error);
  }
}

function requireTenantContext(req, res, next) {
  if (req.admin?.role === "super_admin") {
    return next();
  }

  if (!req.tenant) {
    return res.status(400).json({
      error: "Tenant context is required",
      code: "TENANT_REQUIRED",
    });
  }

  if (req.tenant.status === "suspended" || req.tenant.subscription_status === "suspended") {
    return res.status(403).json({
      error: "Tenant is suspended",
      code: "TENANT_SUSPENDED",
    });
  }

  next();
}

function canTenantAccessActiveFeatures(tenant) {
  if (!tenant) return false;

  if (tenant.status === "suspended" || tenant.subscription_status === "suspended") {
    return false;
  }

  return tenant.subscription_status === "trial" || tenant.subscription_status === "active";
}

function requireTenantAccess(req, res, next) {
  if (req.admin?.role === "super_admin") {
    return next();
  }

  if (!req.tenant) {
    return res.status(400).json({
      error: "Tenant context is required",
      code: "TENANT_REQUIRED",
    });
  }

  if (!canTenantAccessActiveFeatures(req.tenant)) {
    return res.status(403).json({
      error: "Tenant access is restricted by subscription status",
      code: "TENANT_ACCESS_RESTRICTED",
    });
  }

  next();
}

function requireTenantFeature(featureKey) {
  return (req, res, next) => {
    if (!req.tenant) {
      return res.status(400).json({
        error: "Tenant context is required",
        code: "TENANT_REQUIRED",
      });
    }

    if (!canTenantAccessActiveFeatures(req.tenant)) {
      return res.status(403).json({
        error: "Tenant access is restricted by subscription status",
        code: "TENANT_ACCESS_RESTRICTED",
      });
    }

    if (hasTenantFeature(req.tenant, featureKey)) {
      return next();
    }

    return res.status(403).json({
      error: `This feature requires the ${getFeatureMinimumPlan(featureKey) || "required"} plan or higher`,
      code: "PLAN_FEATURE_REQUIRED",
      feature: featureKey,
      required_plan: getFeatureMinimumPlan(featureKey),
      current_plan: req.tenant.plan_code || "pro",
    });
  };
}

module.exports = {
  resolveTenantContext,
  requireTenantContext,
  requireTenantAccess,
  requireTenantFeature,
  getTenantSlugFromHost,
  normalizeSlug,
};
