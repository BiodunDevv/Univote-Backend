const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    recipient_type: {
      type: String,
      enum: ["student", "admin", "super_admin"],
      required: true,
      index: true,
    },
    recipient_student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
      index: true,
    },
    recipient_admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      default: null,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    created_by_type: {
      type: String,
      enum: ["student", "admin", "system"],
      default: "system",
    },
    created_by_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    is_read: {
      type: Boolean,
      default: false,
      index: true,
    },
    read_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

notificationSchema.index({ tenant_id: 1, recipient_type: 1, createdAt: -1 });
notificationSchema.index({ recipient_student_id: 1, is_read: 1, createdAt: -1 });
notificationSchema.index({ recipient_admin_id: 1, is_read: 1, createdAt: -1 });
notificationSchema.index({ recipient_type: 1, is_read: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
