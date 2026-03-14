const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    owner_scope: {
      type: String,
      enum: ["tenant", "platform"],
      required: true,
      index: true,
    },
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    created_by_admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    audience_scope: {
      type: String,
      enum: [
        "tenant_participants",
        "tenant_admins",
        "tenant_all_users",
        "platform_super_admins",
        "platform_tenant_admins",
        "platform_participants",
        "platform_all_users",
        "specific_tenant",
      ],
      required: true,
      index: true,
    },
    audience_tenant_ids: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Tenant",
      default: [],
    },
    channels: {
      type: [String],
      enum: ["in_app", "email"],
      default: ["in_app"],
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    cta_label: {
      type: String,
      default: null,
      trim: true,
    },
    cta_link: {
      type: String,
      default: null,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["draft", "published", "failed"],
      default: "published",
      index: true,
    },
    published_at: {
      type: Date,
      default: Date.now,
    },
    expires_at: {
      type: Date,
      default: null,
    },
    delivery_summary: {
      notifications_created: {
        type: Number,
        default: 0,
      },
      emails_attempted: {
        type: Number,
        default: 0,
      },
      emails_sent: {
        type: Number,
        default: 0,
      },
      errors: {
        type: [String],
        default: [],
      },
    },
  },
  {
    timestamps: true,
  },
);

announcementSchema.index({ owner_scope: 1, tenant_id: 1, published_at: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);
