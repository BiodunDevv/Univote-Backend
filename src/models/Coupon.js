const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    discount_type: {
      type: String,
      enum: ["percentage", "fixed_amount"],
      required: true,
    },
    discount_value: {
      type: Number,
      required: true,
      min: 0,
    },
    plan_scope: {
      type: String,
      enum: ["all", "selected"],
      default: "all",
    },
    plan_codes: {
      type: [String],
      default: () => [],
    },
    minimum_amount_ngn: {
      type: Number,
      default: 0,
      min: 0,
    },
    usage_limit: {
      type: Number,
      default: null,
      min: 1,
    },
    per_applicant_limit: {
      type: Number,
      default: 1,
      min: 1,
    },
    usage_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    active_from: {
      type: Date,
      default: null,
    },
    active_until: {
      type: Date,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    redemptions: {
      type: [
        new mongoose.Schema(
          {
            application_reference: {
              type: String,
              default: null,
              uppercase: true,
              trim: true,
            },
            tenant_id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Tenant",
              default: null,
            },
            invoice_id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Invoice",
              default: null,
            },
            email: {
              type: String,
              default: null,
              lowercase: true,
              trim: true,
            },
            amount_ngn: {
              type: Number,
              default: 0,
            },
            discount_amount_ngn: {
              type: Number,
              default: 0,
            },
            created_at: {
              type: Date,
              default: Date.now,
            },
          },
          { _id: false },
        ),
      ],
      default: () => [],
    },
  },
  {
    timestamps: true,
  },
);

couponSchema.index({ is_active: 1, active_from: 1, active_until: 1 });

module.exports = mongoose.model("Coupon", couponSchema);
