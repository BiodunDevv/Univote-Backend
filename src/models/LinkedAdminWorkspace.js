const mongoose = require("mongoose");

const linkedAdminWorkspaceSchema = new mongoose.Schema(
  {
    source_admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    target_admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    linked_by_admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    label: {
      type: String,
      default: null,
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    last_used_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

linkedAdminWorkspaceSchema.index(
  { source_admin_id: 1, target_admin_id: 1, tenant_id: 1 },
  { unique: true },
);

module.exports = mongoose.model(
  "LinkedAdminWorkspace",
  linkedAdminWorkspaceSchema,
);
