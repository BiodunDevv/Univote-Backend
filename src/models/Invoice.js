const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    invoice_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    plan_code: {
      type: String,
      enum: ["pro", "pro_plus", "enterprise"],
      required: true,
    },
    amount_ngn: {
      type: Number,
      required: true,
      min: 0,
    },
    amount_kobo: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    interval: {
      type: String,
      enum: ["monthly", "annual"],
      default: "monthly",
    },
    status: {
      type: String,
      enum: ["draft", "pending", "paid", "failed", "void"],
      default: "pending",
    },
    payment_provider: {
      type: String,
      enum: ["paystack", "mock"],
      default: "mock",
    },
    payment_reference: {
      type: String,
      default: null,
      trim: true,
    },
    provider_checkout_url: {
      type: String,
      default: null,
    },
    issued_at: {
      type: Date,
      default: Date.now,
    },
    paid_at: {
      type: Date,
      default: null,
    },
    period_start: {
      type: Date,
      default: null,
    },
    period_end: {
      type: Date,
      default: null,
    },
    created_by: {
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

invoiceSchema.index({ tenant_id: 1, createdAt: -1 });
invoiceSchema.index({ tenant_id: 1, status: 1, createdAt: -1 });
invoiceSchema.index({ payment_reference: 1 }, { sparse: true });

module.exports = mongoose.model("Invoice", invoiceSchema);
