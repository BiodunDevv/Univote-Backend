const Announcement = require("../models/Announcement");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const Tenant = require("../models/Tenant");
const TenantAdminMembership = require("../models/TenantAdminMembership");
const emailService = require("../services/emailService");
const { createNotifications } = require("../services/notificationService");

function serializeAnnouncement(announcement) {
  return {
    id: announcement._id,
    owner_scope: announcement.owner_scope,
    tenant_id: announcement.tenant_id || null,
    audience_scope: announcement.audience_scope,
    audience_tenant_ids: announcement.audience_tenant_ids || [],
    channels: announcement.channels || [],
    title: announcement.title,
    body: announcement.body,
    cta_label: announcement.cta_label || null,
    cta_link: announcement.cta_link || null,
    metadata: announcement.metadata || {},
    status: announcement.status,
    published_at: announcement.published_at,
    expires_at: announcement.expires_at,
    delivery_summary: announcement.delivery_summary || {},
    createdAt: announcement.createdAt,
    updatedAt: announcement.updatedAt,
  };
}

async function resolveTenantAdminRecipients(tenantIds) {
  const memberships = await TenantAdminMembership.find({
    tenant_id: { $in: tenantIds },
    is_active: true,
  }).lean();

  const uniqueAdminIds = [...new Set(memberships.map((membership) => String(membership.admin_id)))];
  const admins = await Admin.find({
    _id: { $in: uniqueAdminIds },
    is_active: true,
  })
    .select("_id email full_name role")
    .lean();

  return admins;
}

async function deliverAnnouncement(announcement, actorAdminId) {
  let targetTenants = [];

  if (announcement.owner_scope === "tenant" && announcement.tenant_id) {
    targetTenants = [announcement.tenant_id];
  } else if (announcement.audience_scope === "specific_tenant") {
    targetTenants = announcement.audience_tenant_ids || [];
  } else {
    const tenants = await Tenant.find({ status: "active", is_active: true })
      .select("_id")
      .lean();
    targetTenants = tenants.map((tenant) => tenant._id);
  }

  const notifications = [];
  const emailTargets = [];

  if (
    announcement.audience_scope === "tenant_participants" ||
    announcement.audience_scope === "platform_participants" ||
    announcement.audience_scope === "platform_all_users" ||
    announcement.audience_scope === "tenant_all_users" ||
    announcement.audience_scope === "specific_tenant"
  ) {
    const participants = await Student.find({
      tenant_id: { $in: targetTenants },
      is_active: true,
    })
      .select("_id email full_name tenant_id")
      .lean();

    participants.forEach((participant) => {
      notifications.push({
        tenant_id: participant.tenant_id,
        recipient_type: "student",
        recipient_student_id: participant._id,
        type: "announcement",
        title: announcement.title,
        message: announcement.body,
        link: announcement.cta_link || null,
        priority: "medium",
        metadata: {
          announcement_id: announcement._id,
        },
        created_by_type: "admin",
        created_by_id: actorAdminId,
      });

      if (announcement.channels.includes("email") && participant.email) {
        emailTargets.push({
          email: participant.email,
          name: participant.full_name,
          roleLabel: "participant",
          tenantId: participant.tenant_id,
        });
      }
    });
  }

  if (
    announcement.audience_scope === "tenant_admins" ||
    announcement.audience_scope === "platform_tenant_admins" ||
    announcement.audience_scope === "platform_all_users" ||
    announcement.audience_scope === "tenant_all_users" ||
    announcement.audience_scope === "specific_tenant"
  ) {
    const tenantAdmins = await resolveTenantAdminRecipients(targetTenants);
    tenantAdmins.forEach((admin) => {
      notifications.push({
        tenant_id: announcement.owner_scope === "tenant" ? announcement.tenant_id : null,
        recipient_type: "admin",
        recipient_admin_id: admin._id,
        type: "announcement",
        title: announcement.title,
        message: announcement.body,
        link: announcement.cta_link || null,
        priority: "medium",
        metadata: {
          announcement_id: announcement._id,
        },
        created_by_type: "admin",
        created_by_id: actorAdminId,
      });

      if (announcement.channels.includes("email") && admin.email) {
        emailTargets.push({
          email: admin.email,
          name: admin.full_name,
          roleLabel: "admin",
          tenantId: null,
        });
      }
    });
  }

  if (
    announcement.audience_scope === "platform_super_admins" ||
    announcement.audience_scope === "platform_all_users"
  ) {
    const superAdmins = await Admin.find({
      role: "super_admin",
      is_active: true,
    })
      .select("_id email full_name")
      .lean();

    superAdmins.forEach((admin) => {
      notifications.push({
        tenant_id: null,
        recipient_type: "super_admin",
        recipient_admin_id: admin._id,
        type: "announcement",
        title: announcement.title,
        message: announcement.body,
        link: announcement.cta_link || null,
        priority: "medium",
        metadata: {
          announcement_id: announcement._id,
        },
        created_by_type: "admin",
        created_by_id: actorAdminId,
      });

      if (announcement.channels.includes("email") && admin.email) {
        emailTargets.push({
          email: admin.email,
          name: admin.full_name,
          roleLabel: "super admin",
          tenantId: null,
        });
      }
    });
  }

  let emailsSent = 0;
  const errors = [];

  if (announcement.channels.includes("in_app")) {
    try {
      await createNotifications(notifications);
    } catch (error) {
      errors.push(error.message || "Failed to create notifications");
    }
  }

  if (announcement.channels.includes("email")) {
    for (const recipient of emailTargets) {
      try {
        await emailService.sendAnnouncementEmail({
          to: recipient.email,
          recipientName: recipient.name,
          title: announcement.title,
          body: announcement.body,
          ctaLabel: announcement.cta_label,
          ctaLink: announcement.cta_link,
          roleLabel: recipient.roleLabel,
        });
        emailsSent += 1;
      } catch (error) {
        errors.push(error.message || `Failed to email ${recipient.email}`);
      }
    }
  }

  announcement.delivery_summary = {
    notifications_created: announcement.channels.includes("in_app")
      ? notifications.length
      : 0,
    emails_attempted: announcement.channels.includes("email")
      ? emailTargets.length
      : 0,
    emails_sent: emailsSent,
    errors,
  };
  if (errors.length > 0 && emailsSent === 0 && notifications.length === 0) {
    announcement.status = "failed";
  }
  await announcement.save();
}

class AnnouncementController {
  async list(req, res) {
    try {
      const filter =
        req.admin?.role === "super_admin"
          ? {}
          : { owner_scope: "tenant", tenant_id: req.tenantId };

      const announcements = await Announcement.find(filter)
        .sort({ published_at: -1, createdAt: -1 })
        .limit(100)
        .lean();

      res.json({
        announcements: announcements.map(serializeAnnouncement),
      });
    } catch (error) {
      console.error("List announcements error:", error);
      res.status(500).json({ error: "Failed to fetch announcements" });
    }
  }

  async create(req, res) {
    try {
      const {
        owner_scope,
        audience_scope,
        audience_tenant_ids,
        channels,
        title,
        body,
        cta_label,
        cta_link,
        expires_at,
        metadata,
      } = req.body;

      const isSuperAdmin = req.admin?.role === "super_admin";
      const resolvedOwnerScope = isSuperAdmin ? owner_scope || "platform" : "tenant";
      const allowedTenantScopes = [
        "tenant_participants",
        "tenant_admins",
        "tenant_all_users",
      ];
      const allowedPlatformScopes = [
        "platform_super_admins",
        "platform_tenant_admins",
        "platform_participants",
        "platform_all_users",
        "specific_tenant",
      ];

      if (!isSuperAdmin && !req.tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      if (!title || !body) {
        return res.status(400).json({ error: "Title and body are required" });
      }

      if (
        (resolvedOwnerScope === "tenant" && !allowedTenantScopes.includes(audience_scope)) ||
        (resolvedOwnerScope === "platform" && !allowedPlatformScopes.includes(audience_scope))
      ) {
        return res.status(403).json({ error: "Audience scope is not allowed" });
      }

      const announcement = await Announcement.create({
        owner_scope: resolvedOwnerScope,
        tenant_id: resolvedOwnerScope === "tenant" ? req.tenantId : null,
        created_by_admin_id: req.adminId,
        audience_scope,
        audience_tenant_ids:
          audience_scope === "specific_tenant" ? audience_tenant_ids || [] : [],
        channels:
          Array.isArray(channels) && channels.length > 0 ? channels : ["in_app"],
        title: String(title).trim(),
        body: String(body).trim(),
        cta_label: cta_label ? String(cta_label).trim() : null,
        cta_link: cta_link ? String(cta_link).trim() : null,
        expires_at: expires_at ? new Date(expires_at) : null,
        metadata: metadata || {},
        status: "published",
        published_at: new Date(),
      });

      await deliverAnnouncement(announcement, req.adminId);

      res.status(201).json({
        message: "Announcement published successfully",
        announcement: serializeAnnouncement(announcement),
      });
    } catch (error) {
      console.error("Create announcement error:", error);
      res.status(500).json({ error: "Failed to publish announcement" });
    }
  }
}

module.exports = new AnnouncementController();
