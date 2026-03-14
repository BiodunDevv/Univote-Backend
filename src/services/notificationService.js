const Admin = require("../models/Admin");
const Notification = require("../models/Notification");
const TenantAdminMembership = require("../models/TenantAdminMembership");
const { hasPermission } = require("./tenantAccessService");

function toId(value) {
  if (!value) return null;
  return value.toString();
}

function normalizePayload(payload) {
  return {
    tenant_id: payload.tenant_id || null,
    recipient_type: payload.recipient_type,
    recipient_student_id: payload.recipient_student_id || null,
    recipient_admin_id: payload.recipient_admin_id || null,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    link: payload.link || null,
    priority: payload.priority || "medium",
    metadata: payload.metadata || {},
    created_by_type: payload.created_by_type || "system",
    created_by_id: payload.created_by_id || null,
  };
}

async function createNotification(payload) {
  const notification = await Notification.create(normalizePayload(payload));
  return notification;
}

async function createNotifications(payloads) {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return [];
  }

  const documents = payloads
    .filter(Boolean)
    .map(normalizePayload)
    .filter((payload) => {
      if (payload.recipient_type === "student") {
        return Boolean(payload.recipient_student_id);
      }

      return Boolean(payload.recipient_admin_id);
    });

  if (documents.length === 0) {
    return [];
  }

  return Notification.insertMany(documents, { ordered: false });
}

async function notifyStudent({
  tenantId,
  studentId,
  type,
  title,
  message,
  link,
  priority,
  metadata,
  createdByType,
  createdById,
}) {
  if (!studentId) return null;

  return createNotification({
    tenant_id: tenantId || null,
    recipient_type: "student",
    recipient_student_id: studentId,
    type,
    title,
    message,
    link,
    priority,
    metadata,
    created_by_type: createdByType,
    created_by_id: createdById,
  });
}

async function notifyAdmin({
  tenantId,
  adminId,
  isSuperAdmin = false,
  type,
  title,
  message,
  link,
  priority,
  metadata,
  createdByType,
  createdById,
}) {
  if (!adminId) return null;

  return createNotification({
    tenant_id: isSuperAdmin ? null : tenantId || null,
    recipient_type: isSuperAdmin ? "super_admin" : "admin",
    recipient_admin_id: adminId,
    type,
    title,
    message,
    link,
    priority,
    metadata,
    created_by_type: createdByType,
    created_by_id: createdById,
  });
}

async function getNotifiableTenantAdminIds(tenantId, excludeAdminIds = []) {
  if (!tenantId) return [];

  const memberships = await TenantAdminMembership.find({
    tenant_id: tenantId,
    is_active: true,
  }).lean();

  const excluded = new Set((excludeAdminIds || []).map(toId).filter(Boolean));
  const eligibleMemberships = memberships.filter(
    (membership) =>
      !excluded.has(toId(membership.admin_id)) &&
      (membership.role === "owner" ||
        hasPermission(membership, "support.manage") ||
        hasPermission(membership, "tenant.manage")),
  );

  const adminIds = [...new Set(eligibleMemberships.map((membership) => toId(membership.admin_id)))];
  if (adminIds.length === 0) {
    return [];
  }

  const admins = await Admin.find({
    _id: { $in: adminIds },
    is_active: true,
  })
    .select("_id")
    .lean();

  return admins.map((admin) => admin._id);
}

async function notifyTenantAdmins({
  tenantId,
  type,
  title,
  message,
  link,
  priority,
  metadata,
  excludeAdminIds = [],
  createdByType,
  createdById,
}) {
  const adminIds = await getNotifiableTenantAdminIds(tenantId, excludeAdminIds);

  return createNotifications(
    adminIds.map((adminId) => ({
      tenant_id: tenantId,
      recipient_type: "admin",
      recipient_admin_id: adminId,
      type,
      title,
      message,
      link,
      priority,
      metadata,
      created_by_type: createdByType,
      created_by_id: createdById,
    })),
  );
}

async function notifySuperAdmins({
  type,
  title,
  message,
  link,
  priority,
  metadata,
  excludeAdminIds = [],
  createdByType,
  createdById,
}) {
  const excluded = new Set((excludeAdminIds || []).map(toId).filter(Boolean));

  const superAdmins = await Admin.find({
    role: "super_admin",
    is_active: true,
  })
    .select("_id")
    .lean();

  return createNotifications(
    superAdmins
      .filter((admin) => !excluded.has(toId(admin._id)))
      .map((admin) => ({
        tenant_id: null,
        recipient_type: "super_admin",
        recipient_admin_id: admin._id,
        type,
        title,
        message,
        link,
        priority,
        metadata,
        created_by_type: createdByType,
        created_by_id: createdById,
      })),
  );
}

module.exports = {
  createNotification,
  createNotifications,
  notifyStudent,
  notifyAdmin,
  notifyTenantAdmins,
  notifySuperAdmins,
};
