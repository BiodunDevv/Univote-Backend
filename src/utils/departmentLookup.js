const College = require("../models/College");
const cacheService = require("../services/cacheService");
const { getTenantScopedFilter, getTenantCacheNamespace } = require("./tenantScope");

function buildDepartmentLookupCacheKey(req) {
  return `department_lookup:${getTenantCacheNamespace(req)}`;
}

async function buildDepartmentNameMap(req) {
  const colleges = await College.find(getTenantScopedFilter(req, {}))
    .select("departments._id departments.name")
    .lean();

  const lookup = {};

  colleges.forEach((college) => {
    (college.departments || []).forEach((department) => {
      if (department?._id && department?.name) {
        lookup[department._id.toString()] = department.name;
      }
    });
  });

  return lookup;
}

async function getDepartmentNameMap(req, ttlSeconds = 300) {
  const cacheKey = buildDepartmentLookupCacheKey(req);
  const cached = await cacheService.get(cacheKey);

  if (cached && typeof cached === "object") {
    return cached;
  }

  const lookup = await buildDepartmentNameMap(req);
  await cacheService.set(cacheKey, lookup, ttlSeconds);
  return lookup;
}

async function resolveDepartmentNames(req, departmentIds = []) {
  if (!Array.isArray(departmentIds) || departmentIds.length === 0) {
    return [];
  }

  const lookup = await getDepartmentNameMap(req);
  const seen = new Set();

  return departmentIds.reduce((names, id) => {
    const resolved = lookup[String(id)] || null;
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved);
      names.push(resolved);
    }
    return names;
  }, []);
}

module.exports = {
  getDepartmentNameMap,
  resolveDepartmentNames,
};
