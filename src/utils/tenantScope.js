function getTenantId(req) {
  return req.tenantId || req.tenant?._id || null;
}

function getTenantScopedFilter(req, filter = {}) {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    return { ...filter };
  }

  return {
    ...filter,
    tenant_id: tenantId,
  };
}

function assignTenantId(req, payload = {}) {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    return { ...payload };
  }

  return {
    ...payload,
    tenant_id: tenantId,
  };
}

function getTenantCacheNamespace(req) {
  const tenantId = getTenantId(req);
  if (tenantId) {
    return tenantId.toString();
  }

  return req.tenantSlug || "legacy";
}

function prependTenantMatch(req, pipeline = [], baseMatch = {}) {
  const match = getTenantScopedFilter(req, baseMatch);
  if (pipeline.length > 0 && pipeline[0].$match) {
    return [{ $match: { ...match, ...pipeline[0].$match } }, ...pipeline.slice(1)];
  }

  return [{ $match: match }, ...pipeline];
}

module.exports = {
  getTenantId,
  getTenantScopedFilter,
  assignTenantId,
  getTenantCacheNamespace,
  prependTenantMatch,
};
