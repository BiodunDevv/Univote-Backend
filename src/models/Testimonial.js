const mongoose = require("mongoose");

const testimonialSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    author_name: {
      type: String,
      required: true,
      trim: true,
    },
    author_role: {
      type: String,
      required: true,
      trim: true,
    },
    institution_name: {
      type: String,
      required: true,
      trim: true,
    },
    quote: {
      type: String,
      required: true,
      trim: true,
    },
    avatar_url: {
      type: String,
      default: null,
      trim: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 5,
    },
    source: {
      type: String,
      enum: ["seed", "platform", "tenant", "public"],
      default: "platform",
    },
    status: {
      type: String,
      enum: ["draft", "pending_review", "published", "rejected"],
      default: "draft",
      index: true,
    },
    highlighted: {
      type: Boolean,
      default: false,
    },
    sort_order: {
      type: Number,
      default: 0,
    },
    approved_by_admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    published_at: {
      type: Date,
      default: null,
    },
    rejected_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

testimonialSchema.index({ status: 1, highlighted: -1, sort_order: 1, published_at: -1 });
testimonialSchema.index({ institution_name: 1, author_name: 1 });
testimonialSchema.index({ quote: "text", author_name: "text", institution_name: "text" });

module.exports = mongoose.model("Testimonial", testimonialSchema);
