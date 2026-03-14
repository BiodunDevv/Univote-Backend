const Admin = require("../models/Admin");
const SupportMessage = require("../models/SupportMessage");
const SupportTicket = require("../models/SupportTicket");
const Tenant = require("../models/Tenant");
const {
  getActiveAdminMembership,
  hasPermission,
} = require("../services/tenantAccessService");
const {
  notifyAdmin,
  notifyStudent,
  notifySuperAdmins,
  notifyTenantAdmins,
} = require("../services/notificationService");
const { emitSupportEvent } = require("../services/socketService");
const emailService = require("../services/emailService");

function hasManagePermission(req) {
  if (req.admin?.role === "super_admin") return true;
  return (
    hasPermission(req.adminMembership, "support.manage") ||
    hasPermission(req.adminMembership, "tenant.manage")
  );
}

function requireTenantId(req, res) {
  if (!req.tenantId && !req.tenant?._id) {
    res.status(400).json({ error: "Tenant context is required" });
    return null;
  }

  return req.tenantId || req.tenant?._id;
}

function generateTicketNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 46656)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `SUP-${timestamp}-${random}`;
}

function buildRequesterSnapshot(req) {
  if (req.student) {
    return {
      type: "student",
      id: req.student._id,
      snapshot: {
        name: req.student.full_name,
        email: req.student.email || null,
        matric_no: req.student.matric_no || null,
        role: "student",
      },
    };
  }

  if (req.admin) {
    return {
      type: "admin",
      id: req.admin._id,
      snapshot: {
        name: req.admin.full_name,
        email: req.admin.email || null,
        matric_no: null,
        role: req.adminMembership?.role || req.admin.role,
      },
    };
  }

  return null;
}

function buildAuthorSnapshot(req) {
  const requester = buildRequesterSnapshot(req);
  if (!requester) return null;

  return {
    author_type: requester.type,
    author_id: requester.id,
    author_snapshot: requester.snapshot,
  };
}

function serializeTicket(ticket, tenant = null) {
  return {
    id: ticket._id,
    tenant_id: ticket.tenant_id,
    ticket_number: ticket.ticket_number,
    subject: ticket.subject,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    requester_type: ticket.requester_type,
    requester: ticket.requester_snapshot,
    assigned_admin: ticket.assigned_admin_snapshot
      ? {
          id: ticket.assigned_admin_id,
          ...ticket.assigned_admin_snapshot,
        }
      : null,
    unread_by_requester_count: ticket.unread_by_requester_count || 0,
    unread_by_admin_count: ticket.unread_by_admin_count || 0,
    last_message_at: ticket.last_message_at,
    last_message_preview: ticket.last_message_preview,
    tenant: tenant
      ? {
          id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
        }
      : null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function serializeMessage(message) {
  return {
    id: message._id,
    ticket_id: message.ticket_id,
    author_type: message.author_type,
    author: message.author_snapshot,
    body: message.body,
    attachments: message.attachments || [],
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

function getActorContext(req) {
  if (req.student) {
    return {
      type: "student",
      id: req.studentId,
      name: req.student.full_name,
    };
  }

  if (req.admin) {
    return {
      type: "admin",
      id: req.adminId,
      name: req.admin.full_name,
    };
  }

  return {
    type: "system",
    id: null,
    name: "System",
  };
}

function supportPriorityLevel(priority) {
  return priority === "urgent" || priority === "high" ? "high" : "medium";
}

function buildSupportNotificationLinks(ticketId) {
  return {
    student: `/students/support?ticket=${ticketId}`,
    admin: `/dashboard/support?ticket=${ticketId}`,
    platform: `/super-admin/support?ticket=${ticketId}`,
  };
}

async function attachTenantData(tickets) {
  const tenantIds = [...new Set(tickets.map((ticket) => ticket.tenant_id?.toString()).filter(Boolean))];
  if (tenantIds.length === 0) {
    return tickets.map((ticket) => serializeTicket(ticket));
  }

  const tenants = await Tenant.find({ _id: { $in: tenantIds } })
    .select("name slug")
    .lean();
  const tenantMap = new Map(tenants.map((tenant) => [tenant._id.toString(), tenant]));

  return tickets.map((ticket) =>
    serializeTicket(ticket, ticket.tenant_id ? tenantMap.get(ticket.tenant_id.toString()) : null),
  );
}

async function getTicketForRequest(ticketId, req) {
  const ticket = await SupportTicket.findById(ticketId);

  if (!ticket) {
    return { error: { status: 404, message: "Support ticket not found" } };
  }

  if (req.student) {
    if (
      ticket.requester_type !== "student" ||
      ticket.requester_id.toString() !== req.studentId.toString()
    ) {
      return { error: { status: 403, message: "Access denied for this ticket" } };
    }
  } else if (req.admin?.role !== "super_admin") {
    if (!req.tenantId || ticket.tenant_id.toString() !== req.tenantId.toString()) {
      return { error: { status: 403, message: "Access denied for this tenant" } };
    }

    if (!hasManagePermission(req)) {
      if (
        ticket.requester_type !== "admin" ||
        ticket.requester_id.toString() !== req.adminId.toString()
      ) {
        return { error: { status: 403, message: "Support permissions required" } };
      }
    }
  }

  return { ticket };
}

async function notifyOnTicketCreated(ticket, requester, req) {
  const links = buildSupportNotificationLinks(ticket._id);
  const actor = getActorContext(req);
  const basePayload = {
    type: "support.ticket.created",
    title: `New support ticket: ${ticket.subject}`,
    message: `${requester.snapshot.name} opened ${ticket.ticket_number}.`,
    priority: supportPriorityLevel(ticket.priority),
    metadata: {
      ticket_id: ticket._id,
      ticket_number: ticket.ticket_number,
      status: ticket.status,
      category: ticket.category,
      requester_type: ticket.requester_type,
    },
    createdByType: actor.type,
    createdById: actor.id,
  };

  const tasks = [
    notifySuperAdmins({
      ...basePayload,
      title: `Support activity in tenant ${req.tenant?.name || "workspace"}`,
      message: `${requester.snapshot.name} opened ${ticket.ticket_number}.`,
      link: links.platform,
      metadata: {
        ...basePayload.metadata,
        tenant_id: ticket.tenant_id,
        tenant_slug: req.tenant?.slug || null,
      },
    }),
  ];

  if (requester.type === "student") {
    tasks.push(
      notifyTenantAdmins({
        ...basePayload,
        tenantId: ticket.tenant_id,
        link: links.admin,
      }),
    );
  } else if (requester.type === "admin") {
    tasks.push(
      notifyTenantAdmins({
        ...basePayload,
        tenantId: ticket.tenant_id,
        link: links.admin,
        excludeAdminIds: [requester.id],
      }),
    );
  }

  if (requester.snapshot?.email) {
    tasks.push(
      emailService.sendSupportTicketEmail({
        to: requester.snapshot.email,
        recipientName: requester.snapshot.name,
        tenant: req.tenant || null,
        subject: `Support ticket created - ${ticket.ticket_number}`,
        headline: "Your support ticket has been created",
        message: `We received ${ticket.ticket_number} for "${ticket.subject}". The support queue has been notified.`,
        ctaLabel: "Open support thread",
        ctaLink:
          requester.type === "student" ? links.student : links.admin,
      }),
    );
  }

  if (
    req.tenant?.branding?.support_email &&
    req.tenant.branding.support_email !== requester.snapshot?.email
  ) {
    tasks.push(
      emailService.sendSupportTicketEmail({
        to: req.tenant.branding.support_email,
        recipientName: req.tenant.name,
        tenant: req.tenant || null,
        subject: `New support ticket - ${ticket.ticket_number}`,
        headline: "A new support ticket needs review",
        message: `${requester.snapshot.name} opened ${ticket.ticket_number} with the subject "${ticket.subject}".`,
        ctaLabel: "Open support console",
        ctaLink: links.admin,
      }),
    );
  }

  await Promise.all(tasks);
}

async function notifyOnTicketUpdated(ticket, previousState, req) {
  const actor = getActorContext(req);
  const links = buildSupportNotificationLinks(ticket._id);
  const tasks = [];
  const statusChanged = previousState.status !== ticket.status;
  const priorityChanged = previousState.priority !== ticket.priority;
  const assignmentChanged =
    String(previousState.assigned_admin_id || "") !==
    String(ticket.assigned_admin_id || "");

  if (!statusChanged && !priorityChanged && !assignmentChanged) {
    return;
  }

  const changeSummary = [
    statusChanged ? `status is now ${ticket.status.replace(/_/g, " ")}` : null,
    priorityChanged ? `priority is ${ticket.priority}` : null,
    assignmentChanged && ticket.assigned_admin_snapshot
      ? `assigned to ${ticket.assigned_admin_snapshot.name}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  const basePayload = {
    type: "support.ticket.updated",
    title: `Support ticket updated: ${ticket.subject}`,
    message: changeSummary || `${ticket.ticket_number} was updated.`,
    priority: supportPriorityLevel(ticket.priority),
    metadata: {
      ticket_id: ticket._id,
      ticket_number: ticket.ticket_number,
      status: ticket.status,
      priority: ticket.priority,
      assigned_admin_id: ticket.assigned_admin_id || null,
    },
    createdByType: actor.type,
    createdById: actor.id,
  };

  if (ticket.requester_type === "student") {
    tasks.push(
      notifyStudent({
        tenantId: ticket.tenant_id,
        studentId: ticket.requester_id,
        ...basePayload,
        link: links.student,
      }),
    );
  } else if (
    ticket.requester_type === "admin" &&
    String(ticket.requester_id) !== String(actor.id || "")
  ) {
    tasks.push(
      notifyAdmin({
        tenantId: ticket.tenant_id,
        adminId: ticket.requester_id,
        ...basePayload,
        link: links.admin,
      }),
    );
  }

  if (ticket.requester_snapshot?.email) {
    tasks.push(
      emailService.sendSupportTicketEmail({
        to: ticket.requester_snapshot.email,
        recipientName: ticket.requester_snapshot.name,
        tenant: req.tenant || null,
        subject: `Support ticket updated - ${ticket.ticket_number}`,
        headline: "Your support ticket was updated",
        message: changeSummary || `${ticket.ticket_number} was updated.`,
        ctaLabel: "Review ticket",
        ctaLink:
          ticket.requester_type === "student" ? links.student : links.admin,
      }),
    );
  }

  if (
    assignmentChanged &&
    ticket.assigned_admin_id &&
    String(ticket.assigned_admin_id) !== String(actor.id || "")
  ) {
    tasks.push(
      notifyAdmin({
        tenantId: ticket.tenant_id,
        adminId: ticket.assigned_admin_id,
        isSuperAdmin: false,
        type: "support.ticket.assigned",
        title: `Ticket assigned: ${ticket.subject}`,
        message: `${ticket.ticket_number} was assigned to you.`,
        link: links.admin,
        priority: supportPriorityLevel(ticket.priority),
        metadata: {
          ticket_id: ticket._id,
          ticket_number: ticket.ticket_number,
          status: ticket.status,
        },
        createdByType: actor.type,
        createdById: actor.id,
      }),
    );
  }

  await Promise.all(tasks);
}

async function notifyOnTicketReply(ticket, isRequesterReply, req, body) {
  const actor = getActorContext(req);
  const links = buildSupportNotificationLinks(ticket._id);
  const preview = body.slice(0, 140);

  if (isRequesterReply) {
    await Promise.all([
      notifyTenantAdmins({
        tenantId: ticket.tenant_id,
        type: "support.ticket.reply.requester",
        title: `New requester reply: ${ticket.subject}`,
        message: `${actor.name} replied on ${ticket.ticket_number}: ${preview}`,
        link: links.admin,
        priority: supportPriorityLevel(ticket.priority),
        metadata: {
          ticket_id: ticket._id,
          ticket_number: ticket.ticket_number,
          status: ticket.status,
        },
        excludeAdminIds: req.admin ? [req.adminId] : [],
        createdByType: actor.type,
        createdById: actor.id,
      }),
      req.tenant?.branding?.support_email
        ? emailService.sendSupportTicketEmail({
            to: req.tenant.branding.support_email,
            recipientName: req.tenant.name,
            tenant: req.tenant || null,
            subject: `New requester reply - ${ticket.ticket_number}`,
            headline: "A requester replied to a support ticket",
            message: `${actor.name} replied on ${ticket.ticket_number}: ${preview}`,
            ctaLabel: "Open support console",
            ctaLink: links.admin,
          })
        : Promise.resolve(),
    ]);
    return;
  }

  if (ticket.requester_type === "student") {
    await Promise.all([
      notifyStudent({
        tenantId: ticket.tenant_id,
        studentId: ticket.requester_id,
        type: "support.ticket.reply.agent",
        title: `New support reply: ${ticket.subject}`,
        message: `${actor.name} replied on ${ticket.ticket_number}: ${preview}`,
        link: links.student,
        priority: supportPriorityLevel(ticket.priority),
        metadata: {
          ticket_id: ticket._id,
          ticket_number: ticket.ticket_number,
          status: ticket.status,
        },
        createdByType: actor.type,
        createdById: actor.id,
      }),
      ticket.requester_snapshot?.email
        ? emailService.sendSupportTicketEmail({
            to: ticket.requester_snapshot.email,
            recipientName: ticket.requester_snapshot.name,
            tenant: req.tenant || null,
            subject: `New support reply - ${ticket.ticket_number}`,
            headline: "You have a new support reply",
            message: `${actor.name} replied on ${ticket.ticket_number}: ${preview}`,
            ctaLabel: "Open support thread",
            ctaLink: links.student,
          })
        : Promise.resolve(),
    ]);
    return;
  }

  if (String(ticket.requester_id) !== String(actor.id || "")) {
    await Promise.all([
      notifyAdmin({
        tenantId: ticket.tenant_id,
        adminId: ticket.requester_id,
        type: "support.ticket.reply.agent",
        title: `New support reply: ${ticket.subject}`,
        message: `${actor.name} replied on ${ticket.ticket_number}: ${preview}`,
        link: links.admin,
        priority: supportPriorityLevel(ticket.priority),
        metadata: {
          ticket_id: ticket._id,
          ticket_number: ticket.ticket_number,
          status: ticket.status,
        },
        createdByType: actor.type,
        createdById: actor.id,
      }),
      ticket.requester_snapshot?.email
        ? emailService.sendSupportTicketEmail({
            to: ticket.requester_snapshot.email,
            recipientName: ticket.requester_snapshot.name,
            tenant: req.tenant || null,
            subject: `New support reply - ${ticket.ticket_number}`,
            headline: "You have a new support reply",
            message: `${actor.name} replied on ${ticket.ticket_number}: ${preview}`,
            ctaLabel: "Open support thread",
            ctaLink: links.admin,
          })
        : Promise.resolve(),
    ]);
  }
}

async function updateReadState(ticket, req) {
  let hasChanges = false;

  if (
    req.student &&
    ticket.requester_type === "student" &&
    ticket.requester_id.toString() === req.studentId.toString() &&
    ticket.unread_by_requester_count > 0
  ) {
    ticket.unread_by_requester_count = 0;
    hasChanges = true;
  }

  if (
    req.admin &&
    ticket.requester_type === "admin" &&
    ticket.requester_id.toString() === req.adminId.toString() &&
    ticket.unread_by_requester_count > 0
  ) {
    ticket.unread_by_requester_count = 0;
    hasChanges = true;
  }

  if (req.admin && ticket.unread_by_admin_count > 0) {
    if (req.admin.role === "super_admin" || hasManagePermission(req)) {
      ticket.unread_by_admin_count = 0;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    await ticket.save();
  }

  return hasChanges;
}

class SupportController {
  async getOverview(req, res) {
    try {
      const baseFilter = {};
      let unreadField = "unread_by_admin_count";

      if (req.student) {
        baseFilter.tenant_id = req.tenantId;
        baseFilter.requester_type = "student";
        baseFilter.requester_id = req.studentId;
        unreadField = "unread_by_requester_count";
      } else if (req.admin?.role !== "super_admin") {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        baseFilter.tenant_id = tenantId;

        if (!hasManagePermission(req)) {
          baseFilter.requester_type = "admin";
          baseFilter.requester_id = req.adminId;
          unreadField = "unread_by_requester_count";
        }
      } else if (req.query.tenant_id) {
        baseFilter.tenant_id = req.query.tenant_id;
      }

      const [totals, unassigned, unreadSummary] = await Promise.all([
        SupportTicket.aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),
        req.admin
          ? SupportTicket.countDocuments({
              ...baseFilter,
              assigned_admin_id: null,
            })
          : Promise.resolve(0),
        SupportTicket.aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: null,
              unread_total: {
                $sum: {
                  $ifNull: [`$${unreadField}`, 0],
                },
              },
            },
          },
        ]),
      ]);

      const counts = {
        total: 0,
        open: 0,
        in_progress: 0,
        resolved: 0,
        closed: 0,
      };

      totals.forEach((entry) => {
        counts.total += entry.count;
        if (counts[entry._id] !== undefined) {
          counts[entry._id] = entry.count;
        }
      });

      return res.json({
        overview: {
          ...counts,
          unassigned,
          unread_total: unreadSummary[0]?.unread_total || 0,
        },
        permissions: {
          can_manage: Boolean(req.admin) && (req.admin.role === "super_admin" || hasManagePermission(req)),
          can_create: Boolean(req.student || req.admin),
          can_reply: Boolean(req.student || req.admin),
        },
      });
    } catch (error) {
      console.error("Get support overview error:", error);
      return res.status(500).json({ error: "Failed to fetch support overview" });
    }
  }

  async listTickets(req, res) {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;
      const filter = {};
      const search = String(req.query.search || "").trim();

      if (req.student) {
        filter.tenant_id = req.tenantId;
        filter.requester_type = "student";
        filter.requester_id = req.studentId;
      } else if (req.admin?.role !== "super_admin") {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        filter.tenant_id = tenantId;
        if (!hasManagePermission(req)) {
          filter.requester_type = "admin";
          filter.requester_id = req.adminId;
        }
      } else if (req.query.tenant_id) {
        filter.tenant_id = req.query.tenant_id;
      }

      const status = String(req.query.status || "").trim();
      const priority = String(req.query.priority || "").trim();
      const category = String(req.query.category || "").trim();
      const requesterType = String(req.query.requester_type || "").trim();
      const assignedToMe = String(req.query.assigned_to_me || "").trim();

      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (category) filter.category = category;
      if (requesterType) filter.requester_type = requesterType;
      if (assignedToMe === "true" && req.admin) {
        filter.assigned_admin_id = req.adminId;
      }

      if (search) {
        filter.$or = [
          { ticket_number: { $regex: search, $options: "i" } },
          { subject: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
          { "requester_snapshot.name": { $regex: search, $options: "i" } },
          { "requester_snapshot.email": { $regex: search, $options: "i" } },
        ];
      }

      const [tickets, total] = await Promise.all([
        SupportTicket.find(filter)
          .sort({ last_message_at: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        SupportTicket.countDocuments(filter),
      ]);

      return res.json({
        tickets: await attachTenantData(tickets),
        pagination: {
          total,
          page,
          limit,
          pages: Math.max(Math.ceil(total / limit), 1),
        },
      });
    } catch (error) {
      console.error("List support tickets error:", error);
      return res.status(500).json({ error: "Failed to fetch support tickets" });
    }
  }

  async createTicket(req, res) {
    try {
      const tenantId = requireTenantId(req, res);
      if (!tenantId) return;

      const requester = buildRequesterSnapshot(req);
      if (!requester) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { subject, description, category = "general", priority = "medium" } = req.body;

      const ticket = await SupportTicket.create({
        tenant_id: tenantId,
        ticket_number: generateTicketNumber(),
        subject: String(subject).trim(),
        description: String(description).trim(),
        category,
        priority,
        status: "open",
        requester_type: requester.type,
        requester_id: requester.id,
        requester_snapshot: requester.snapshot,
        last_message_at: new Date(),
        last_message_preview: String(description).trim().slice(0, 140),
        unread_by_requester_count: 0,
        unread_by_admin_count: requester.type === "student" ? 1 : 0,
      });

      const author = buildAuthorSnapshot(req);
      await SupportMessage.create({
        tenant_id: tenantId,
        ticket_id: ticket._id,
        ...author,
        body: String(description).trim(),
      });

      await notifyOnTicketCreated(ticket, requester, req);
      emitSupportEvent("support:ticket-created", ticket);

      return res.status(201).json({
        message: "Support ticket created successfully",
        ticket: serializeTicket(ticket.toObject()),
      });
    } catch (error) {
      console.error("Create support ticket error:", error);
      return res.status(500).json({ error: "Failed to create support ticket" });
    }
  }

  async getTicketById(req, res) {
    try {
      const result = await getTicketForRequest(req.params.id, req);
      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.message });
      }

      const tenant =
        req.admin?.role === "super_admin" && result.ticket.tenant_id
          ? await Tenant.findById(result.ticket.tenant_id).select("name slug").lean()
          : null;

      return res.json({
        ticket: serializeTicket(result.ticket.toObject(), tenant),
      });
    } catch (error) {
      console.error("Get support ticket error:", error);
      return res.status(500).json({ error: "Failed to fetch support ticket" });
    }
  }

  async updateTicket(req, res) {
    try {
      const result = await getTicketForRequest(req.params.id, req);
      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.message });
      }

      const ticket = result.ticket;
      const { status, priority, category, assigned_admin_id } = req.body;
      const previousState = {
        status: ticket.status,
        priority: ticket.priority,
        assigned_admin_id: ticket.assigned_admin_id || null,
      };

      if (req.student) {
        if (status && status === "closed") {
          ticket.status = "closed";
          await ticket.save();
          await notifyOnTicketUpdated(ticket, previousState, req);
          emitSupportEvent("support:ticket-updated", ticket);
          return res.json({
            message: "Support ticket closed successfully",
            ticket: serializeTicket(ticket.toObject()),
          });
        }

        return res.status(403).json({ error: "Students can only close their own tickets" });
      }

      if (req.admin.role !== "super_admin" && !hasManagePermission(req)) {
        return res.status(403).json({ error: "Support management permission required" });
      }

      if (status !== undefined) ticket.status = status;
      if (priority !== undefined) ticket.priority = priority;
      if (category !== undefined) ticket.category = category;

      if (assigned_admin_id !== undefined) {
        if (!assigned_admin_id) {
          ticket.assigned_admin_id = null;
          ticket.assigned_admin_snapshot = null;
        } else {
          const assignee = await Admin.findById(assigned_admin_id).select(
            "full_name email role is_active",
          );

          if (!assignee || !assignee.is_active) {
            return res.status(404).json({ error: "Assigned admin not found" });
          }

          const tenantMembership = ticket.tenant_id
            ? await getActiveAdminMembership(assignee._id, ticket.tenant_id)
            : null;

          if (assignee.role !== "super_admin" && !tenantMembership) {
            return res.status(403).json({
              error: "Assigned admin does not belong to this tenant",
            });
          }

          ticket.assigned_admin_id = assignee._id;
          ticket.assigned_admin_snapshot = {
            name: assignee.full_name,
            email: assignee.email,
            role: tenantMembership?.role || assignee.role,
          };
        }
      }

      await ticket.save();
      await notifyOnTicketUpdated(ticket, previousState, req);
      emitSupportEvent("support:ticket-updated", ticket);

      return res.json({
        message: "Support ticket updated successfully",
        ticket: serializeTicket(ticket.toObject()),
      });
    } catch (error) {
      console.error("Update support ticket error:", error);
      return res.status(500).json({ error: "Failed to update support ticket" });
    }
  }

  async getMessages(req, res) {
    try {
      const result = await getTicketForRequest(req.params.id, req);
      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.message });
      }

      const ticket = result.ticket;
      const readStateChanged = await updateReadState(ticket, req);

      const [messages, tenant] = await Promise.all([
        SupportMessage.find({ ticket_id: ticket._id }).sort({ createdAt: 1 }).lean(),
        req.admin?.role === "super_admin" && ticket.tenant_id
          ? Tenant.findById(ticket.tenant_id).select("name slug").lean()
          : Promise.resolve(null),
      ]);

      if (readStateChanged) {
        emitSupportEvent("support:ticket-updated", ticket);
      }

      return res.json({
        ticket: serializeTicket(ticket.toObject(), tenant),
        messages: messages.map(serializeMessage),
      });
    } catch (error) {
      console.error("Get support messages error:", error);
      return res.status(500).json({ error: "Failed to fetch support messages" });
    }
  }

  async createMessage(req, res) {
    try {
      const result = await getTicketForRequest(req.params.id, req);
      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.message });
      }

      const ticket = result.ticket;
      const author = buildAuthorSnapshot(req);
      const body = String(req.body.body).trim();
      const isRequesterReply =
        req.student ||
        (req.admin &&
          ticket.requester_type === "admin" &&
          ticket.requester_id.toString() === req.adminId.toString() &&
          req.admin.role !== "super_admin" &&
          !hasManagePermission(req));

      const message = await SupportMessage.create({
        tenant_id: ticket.tenant_id,
        ticket_id: ticket._id,
        ...author,
        body,
        attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
      });

      ticket.last_message_at = message.createdAt;
      ticket.last_message_preview = body.slice(0, 140);

      if (isRequesterReply) {
        ticket.unread_by_admin_count += 1;
        if (["resolved", "closed"].includes(ticket.status)) {
          ticket.status = "open";
        }
      } else {
        ticket.unread_by_requester_count += 1;
        if (!ticket.assigned_admin_id) {
          ticket.assigned_admin_id = req.adminId;
          ticket.assigned_admin_snapshot = {
            name: req.admin.full_name,
            email: req.admin.email,
            role: req.adminMembership?.role || req.admin.role,
          };
        }

        if (ticket.status === "open") {
          ticket.status = "in_progress";
        }
      }

      await ticket.save();
      await notifyOnTicketReply(ticket, isRequesterReply, req, body);
      emitSupportEvent("support:message-created", ticket, {
        message_id: message._id.toString(),
      });

      return res.status(201).json({
        message: "Support message sent successfully",
        support_message: serializeMessage(message.toObject()),
        ticket: serializeTicket(ticket.toObject()),
      });
    } catch (error) {
      console.error("Create support message error:", error);
      return res.status(500).json({ error: "Failed to send support message" });
    }
  }
}

module.exports = new SupportController();
