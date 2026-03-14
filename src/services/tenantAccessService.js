const TenantAdminMembership = require("../models/TenantAdminMembership");

async function getActiveAdminMembership(adminId, tenantId) {
  if (!adminId || !tenantId) return null;

  return TenantAdminMembership.findOne({
    admin_id: adminId,
    tenant_id: tenantId,
    is_active: true,
  }).lean();
}

async function getActiveAdminMemberships(adminId) {
  if (!adminId) return [];

  return TenantAdminMembership.find({
    admin_id: adminId,
    is_active: true,
  }).lean();
}

function hasPermission(membership, permission) {
  if (!membership) return false;
  if (membership.role === "owner") return true;
  return Array.isArray(membership.permissions)
    ? membership.permissions.includes(permission)
    : false;
}

module.exports = {
  getActiveAdminMembership,
  getActiveAdminMemberships,
  hasPermission,
};
