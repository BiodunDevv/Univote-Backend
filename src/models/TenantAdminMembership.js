const mongoose = require("mongoose");

const tenantAdminMembershipSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "support", "analyst"],
      default: "admin",
    },
    permissions: {
      type: [String],
      default: [],
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    last_access_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

tenantAdminMembershipSchema.index({ tenant_id: 1, admin_id: 1 }, { unique: true });
tenantAdminMembershipSchema.index({ tenant_id: 1, role: 1, is_active: 1 });

module.exports = mongoose.model(
  "TenantAdminMembership",
  tenantAdminMembershipSchema,
);
