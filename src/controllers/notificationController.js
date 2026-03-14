const Notification = require("../models/Notification");
const Tenant = require("../models/Tenant");

function serializeNotification(notification, tenant = null) {
  return {
    id: notification._id,
    tenant_id: notification.tenant_id || null,
    recipient_type: notification.recipient_type,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link,
    priority: notification.priority,
    metadata: notification.metadata || {},
    is_read: notification.is_read,
    read_at: notification.read_at,
    tenant: tenant
      ? {
          id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
        }
      : null,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

async function attachTenantData(notifications) {
  const tenantIds = [
    ...new Set(
      notifications
        .map((notification) => notification.tenant_id?.toString())
        .filter(Boolean),
    ),
  ];

  if (tenantIds.length === 0) {
    return notifications.map((notification) => serializeNotification(notification));
  }

  const tenants = await Tenant.find({ _id: { $in: tenantIds } })
    .select("name slug")
    .lean();
  const tenantMap = new Map(tenants.map((tenant) => [tenant._id.toString(), tenant]));

  return notifications.map((notification) =>
    serializeNotification(
      notification,
      notification.tenant_id ? tenantMap.get(notification.tenant_id.toString()) : null,
    ),
  );
}

function buildRecipientFilter(req) {
  if (req.student) {
    return {
      tenant_id: req.tenantId,
      recipient_type: "student",
      recipient_student_id: req.studentId,
    };
  }

  if (req.admin?.role === "super_admin") {
    return {
      recipient_type: "super_admin",
      recipient_admin_id: req.adminId,
    };
  }

  return {
    tenant_id: req.tenantId,
    recipient_type: "admin",
    recipient_admin_id: req.adminId,
  };
}

class NotificationController {
  async listNotifications(req, res) {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;
      const unreadOnly = String(req.query.unread_only || "").trim() === "true";

      const filter = buildRecipientFilter(req);
      if (unreadOnly) {
        filter.is_read = false;
      }

      const summaryFilter = buildRecipientFilter(req);

      const [notifications, total, unread] = await Promise.all([
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Notification.countDocuments(filter),
        Notification.countDocuments({
          ...summaryFilter,
          is_read: false,
        }),
      ]);

      return res.json({
        notifications: await attachTenantData(notifications),
        summary: {
          total,
          unread,
        },
        pagination: {
          total,
          page,
          limit,
          pages: Math.max(Math.ceil(total / limit), 1),
        },
      });
    } catch (error) {
      console.error("List notifications error:", error);
      return res.status(500).json({ error: "Failed to fetch notifications" });
    }
  }

  async markAsRead(req, res) {
    try {
      const filter = buildRecipientFilter(req);
      const notification = await Notification.findOne({
        _id: req.params.id,
        ...filter,
      });

      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      if (!notification.is_read) {
        notification.is_read = true;
        notification.read_at = new Date();
        await notification.save();
      }

      return res.json({
        message: "Notification marked as read",
        notification: serializeNotification(notification.toObject()),
      });
    } catch (error) {
      console.error("Mark notification read error:", error);
      return res.status(500).json({ error: "Failed to update notification" });
    }
  }

  async markAllAsRead(req, res) {
    try {
      const filter = buildRecipientFilter(req);
      const result = await Notification.updateMany(
        {
          ...filter,
          is_read: false,
        },
        {
          $set: {
            is_read: true,
            read_at: new Date(),
          },
        },
      );

      return res.json({
        message: "Notifications marked as read",
        updated: result.modifiedCount || 0,
      });
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      return res.status(500).json({ error: "Failed to update notifications" });
    }
  }
}

module.exports = new NotificationController();
