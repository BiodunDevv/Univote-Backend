const mongoose = require("mongoose");

const verificationLogSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
      index: true,
    },
    session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VotingSession",
      default: null,
      index: true,
    },
    confidence_score: {
      type: Number,
      default: null,
    },
    threshold_used: {
      type: Number,
      default: null,
    },
    result: {
      type: String,
      enum: ["accepted", "rejected"],
      required: true,
      index: true,
    },
    failure_reason: {
      type: String,
      default: null,
      index: true,
    },
    is_genuine_attempt: {
      type: Boolean,
      default: null,
      index: true,
    },
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
    review_note: {
      type: String,
      default: null,
      trim: true,
    },
    provider: {
      type: String,
      default: "facepp",
      trim: true,
    },
    device_id: {
      type: String,
      default: null,
      trim: true,
    },
    ip_address: {
      type: String,
      default: null,
      trim: true,
    },
    geo_location: {
      lat: {
        type: Number,
        default: null,
      },
      lng: {
        type: Number,
        default: null,
      },
    },
    image_url: {
      type: String,
      default: null,
      trim: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

verificationLogSchema.index({ tenant_id: 1, timestamp: -1 });
verificationLogSchema.index({ tenant_id: 1, session_id: 1, timestamp: -1 });
verificationLogSchema.index({ tenant_id: 1, reviewed_at: -1 });

module.exports = mongoose.model("VerificationLog", verificationLogSchema);
