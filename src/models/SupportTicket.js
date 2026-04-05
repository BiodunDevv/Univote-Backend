const mongoose = require("mongoose");

const requesterSnapshotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      default: null,
    },
    matric_no: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const assignmentSnapshotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const supportTicketSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    ticket_number: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["general", "account", "voting", "technical"],
      default: "general",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    requester_type: {
      type: String,
      enum: ["student", "admin"],
      required: true,
    },
    requester_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    requester_snapshot: {
      type: requesterSnapshotSchema,
      required: true,
    },
    assigned_admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    assigned_admin_snapshot: {
      type: assignmentSnapshotSchema,
      default: null,
    },
    last_message_at: {
      type: Date,
      default: Date.now,
    },
    last_message_preview: {
      type: String,
      default: null,
    },
    unread_by_requester_count: {
      type: Number,
      default: 0,
    },
    unread_by_admin_count: {
      type: Number,
      default: 0,
    },
    photo_reset_decision_status: {
      type: String,
      enum: ["pending", "approved", "declined"],
      default: null,
    },
    photo_reset_decided_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

supportTicketSchema.index({ tenant_id: 1, status: 1, last_message_at: -1 });
supportTicketSchema.index({ tenant_id: 1, priority: 1, status: 1 });
supportTicketSchema.index({ requester_id: 1, requester_type: 1, createdAt: -1 });
supportTicketSchema.index({ assigned_admin_id: 1, status: 1, last_message_at: -1 });
supportTicketSchema.index({ subject: "text", description: "text", ticket_number: "text" });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
