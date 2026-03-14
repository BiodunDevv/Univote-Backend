const mongoose = require("mongoose");

const subscriptionEventSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "checkout_created",
        "payment_received",
        "plan_upgraded",
        "downgrade_scheduled",
        "scheduled_change_cancelled",
        "scheduled_change_applied",
        "subscription_seeded",
        "subscription_status_changed",
      ],
      required: true,
    },
    previous_plan_code: {
      type: String,
      enum: ["pro", "pro_plus", "enterprise", null],
      default: null,
    },
    next_plan_code: {
      type: String,
      enum: ["pro", "pro_plus", "enterprise", null],
      default: null,
    },
    previous_subscription_status: {
      type: String,
      enum: ["trial", "active", "grace", "expired", "suspended", null],
      default: null,
    },
    next_subscription_status: {
      type: String,
      enum: ["trial", "active", "grace", "expired", "suspended", null],
      default: null,
    },
    invoice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    effective_at: {
      type: Date,
      default: Date.now,
    },
    actor_admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => new Map(),
    },
  },
  {
    timestamps: true,
  },
);

subscriptionEventSchema.index({ tenant_id: 1, createdAt: -1 });
subscriptionEventSchema.index({ tenant_id: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model("SubscriptionEvent", subscriptionEventSchema);
