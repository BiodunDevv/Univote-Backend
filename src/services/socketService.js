const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const Admin = require("../models/Admin");
const Student = require("../models/Student");
const SupportTicket = require("../models/SupportTicket");
const { getActiveAdminMembership, hasPermission } = require("./tenantAccessService");

let io = null;

function canManageSupport(actor) {
  if (!actor || actor.type !== "admin") return false;
  if (actor.role === "super_admin") return true;
  return (
    hasPermission(actor.membership, "support.manage") ||
    hasPermission(actor.membership, "tenant.manage")
  );
}

function getRequesterRoom(ticket) {
  if (!ticket?.requester_id) return null;
  if (ticket.requester_type === "student") {
    return `student:${ticket.requester_id.toString()}`;
  }

  if (ticket.requester_type === "admin") {
    return `admin:${ticket.requester_id.toString()}`;
  }

  return null;
}

function getSupportRooms(ticket) {
  const rooms = new Set(["platform:support"]);

  if (ticket?.tenant_id) {
    rooms.add(`tenant-support:${ticket.tenant_id.toString()}`);
  }

  if (ticket?._id) {
    rooms.add(`ticket:${ticket._id.toString()}`);
  }

  const requesterRoom = getRequesterRoom(ticket);
  if (requesterRoom) {
    rooms.add(requesterRoom);
  }

  if (ticket?.assigned_admin_id) {
    rooms.add(`admin:${ticket.assigned_admin_id.toString()}`);
  }

  return [...rooms];
}

function buildTypingPayload(actor, ticketId) {
  return {
    ticket_id: ticketId,
    actor: {
      id: actor?.id || null,
      type: actor?.type || null,
      role: actor?.role || null,
      name: actor?.name || "Support",
    },
    timestamp: new Date().toISOString(),
  };
}

async function authorizeSocket(socket) {
  const authToken =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "") ||
    socket.handshake.query?.token;

  if (!authToken) {
    throw new Error("Authentication token is required");
  }

  const decoded = jwt.verify(authToken, process.env.JWT_SECRET);

  if (decoded.type === "student") {
    const student = await Student.findById(decoded.id)
      .select("full_name email matric_no tenant_id is_active")
      .lean();

    if (!student || !student.is_active) {
      throw new Error("Student not found or inactive");
    }

    return {
      type: "student",
      id: student._id.toString(),
      tenantId: student.tenant_id?.toString() || decoded.tenant_id || null,
      role: "student",
      name: student.full_name,
    };
  }

  if (decoded.type === "admin") {
    const admin = await Admin.findById(decoded.id)
      .select("full_name email role is_active")
      .lean();

    if (!admin || !admin.is_active) {
      throw new Error("Admin not found or inactive");
    }

    if (admin.role === "super_admin") {
      return {
        type: "admin",
        id: admin._id.toString(),
        tenantId: null,
        role: "super_admin",
        name: admin.full_name,
        membership: null,
      };
    }

    const tenantId =
      socket.handshake.auth?.tenantId ||
      socket.handshake.auth?.tenant_id ||
      decoded.tenant_id ||
      null;

    if (!tenantId) {
      throw new Error("Tenant context is required for tenant admins");
    }

    const membership = await getActiveAdminMembership(admin._id, tenantId);
    if (!membership) {
      throw new Error("Tenant membership not found");
    }

    return {
      type: "admin",
      id: admin._id.toString(),
      tenantId: tenantId.toString(),
      role: membership.role,
      name: admin.full_name,
      membership,
    };
  }

  throw new Error("Unsupported token type");
}

async function canAccessTicket(actor, ticketId) {
  const ticket = await SupportTicket.findById(ticketId)
    .select(
      "tenant_id requester_type requester_id assigned_admin_id unread_by_admin_count unread_by_requester_count",
    )
    .lean();

  if (!ticket) {
    return false;
  }

  if (actor.type === "student") {
    return (
      ticket.requester_type === "student" &&
      ticket.requester_id?.toString() === actor.id
    );
  }

  if (actor.role === "super_admin") {
    return true;
  }

  if (!actor.tenantId || ticket.tenant_id?.toString() !== actor.tenantId) {
    return false;
  }

  if (canManageSupport(actor)) {
    return true;
  }

  return (
    ticket.requester_type === "admin" &&
    ticket.requester_id?.toString() === actor.id
  );
}

function initializeSocketServer(server) {
  if (io) {
    return io;
  }

  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const actor = await authorizeSocket(socket);
      socket.data.actor = actor;
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on("connection", (socket) => {
    const actor = socket.data.actor;

    if (actor?.type === "student") {
      socket.join(`student:${actor.id}`);
    }

    if (actor?.type === "admin") {
      socket.join(`admin:${actor.id}`);

      if (actor.role === "super_admin") {
        socket.join("platform:support");
      } else if (actor.tenantId && canManageSupport(actor)) {
        socket.join(`tenant-support:${actor.tenantId}`);
      }
    }

    socket.on("support:join-ticket", async (payload = {}, callback) => {
      try {
        const ticketId = payload.ticketId || payload.ticket_id;
        if (!ticketId) {
          throw new Error("ticketId is required");
        }

        const allowed = await canAccessTicket(actor, ticketId);
        if (!allowed) {
          throw new Error("Access denied for this ticket");
        }

        socket.join(`ticket:${ticketId}`);
        if (typeof callback === "function") {
          callback({ ok: true });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({ ok: false, error: error.message });
        }
      }
    });

    socket.on("support:leave-ticket", (payload = {}, callback) => {
      const ticketId = payload.ticketId || payload.ticket_id;
      if (ticketId) {
        socket.leave(`ticket:${ticketId}`);
      }

      if (typeof callback === "function") {
        callback({ ok: true });
      }
    });

    socket.on("support:typing", async (payload = {}, callback) => {
      try {
        const ticketId = payload.ticketId || payload.ticket_id;
        if (!ticketId) {
          throw new Error("ticketId is required");
        }

        const room = `ticket:${ticketId}`;
        if (!socket.rooms.has(room)) {
          const allowed = await canAccessTicket(actor, ticketId);
          if (!allowed) {
            throw new Error("Access denied for this ticket");
          }
          socket.join(room);
        }

        socket.to(room).emit("support:typing", buildTypingPayload(actor, ticketId));

        if (typeof callback === "function") {
          callback({ ok: true });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({ ok: false, error: error.message });
        }
      }
    });

    socket.on("support:stop-typing", async (payload = {}, callback) => {
      try {
        const ticketId = payload.ticketId || payload.ticket_id;
        if (!ticketId) {
          throw new Error("ticketId is required");
        }

        const room = `ticket:${ticketId}`;
        socket.to(room).emit("support:stop-typing", buildTypingPayload(actor, ticketId));

        if (typeof callback === "function") {
          callback({ ok: true });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({ ok: false, error: error.message });
        }
      }
    });
  });

  return io;
}

function emitSupportEvent(eventName, ticket, payload = {}) {
  if (!io || !ticket) return;

  getSupportRooms(ticket).forEach((room) => {
    io.to(room).emit(eventName, {
      ticket_id: ticket._id?.toString() || null,
      tenant_id: ticket.tenant_id?.toString() || null,
      requester_type: ticket.requester_type || null,
      requester_id: ticket.requester_id?.toString() || null,
      assigned_admin_id: ticket.assigned_admin_id?.toString() || null,
      ...payload,
      timestamp: new Date().toISOString(),
    });
  });
}

module.exports = {
  emitSupportEvent,
  getIo: () => io,
  initializeSocketServer,
};
