const mongoose = require("mongoose");

const authorSnapshotSchema = new mongoose.Schema(
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

const supportMessageSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    ticket_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: true,
      index: true,
    },
    author_type: {
      type: String,
      enum: ["student", "admin"],
      required: true,
    },
    author_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    author_snapshot: {
      type: authorSnapshotSchema,
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    attachments: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

supportMessageSchema.index({ ticket_id: 1, createdAt: 1 });
supportMessageSchema.index({ tenant_id: 1, createdAt: -1 });

module.exports = mongoose.model("SupportMessage", supportMessageSchema);
