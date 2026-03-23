const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    matric_no: {
      type: String,
      required: false,
      uppercase: true,
      trim: true,
      default: null,
    },
    member_id: {
      type: String,
      required: false,
      uppercase: true,
      trim: true,
      default: null,
    },
    employee_id: {
      type: String,
      required: false,
      uppercase: true,
      trim: true,
      default: null,
    },
    username: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      default: null,
    },
    full_name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      default: null,
    },
    password_hash: {
      type: String,
      required: true,
    },
    first_login: {
      type: Boolean,
      default: true,
    },
    department: {
      type: String,
      required: false,
      default: null,
    },
    department_code: {
      type: String,
      required: false,
      uppercase: true,
      trim: true,
      default: null,
    },
    college: {
      type: String,
      required: false,
      default: null,
    },
    level: {
      type: String,
      required: false,
      enum: ["100", "200", "300", "400", "500", "600"],
      default: null,
    },
    has_voted_sessions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VotingSession",
      },
    ],
    photo_url: {
      type: String,
      default: null,
    },
    last_profile_photo_updated_at: {
      type: Date,
      default: null,
    },
    photo_review_status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    photo_reviewed_at: {
      type: Date,
      default: null,
    },
    photo_reviewed_by_admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    face_token: {
      type: String,
      default: null,
    },
    embedding_vector: {
      type: String,
      default: null,
    },
    is_logged_in: {
      type: Boolean,
      default: false,
    },
    last_login_device: {
      type: String,
      default: null,
    },
    last_login_at: {
      type: Date,
      default: null,
    },
    active_token: {
      type: String,
      default: null,
    },
    reset_password_code: {
      type: String,
      default: null,
    },
    reset_password_expires: {
      type: Date,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for faster queries
studentSchema.index(
  { tenant_id: 1, matric_no: 1 },
  { unique: true, partialFilterExpression: { tenant_id: { $type: "objectId" } } },
);
studentSchema.index(
  { tenant_id: 1, member_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      tenant_id: { $type: "objectId" },
      member_id: { $type: "string" },
    },
  },
);
studentSchema.index(
  { tenant_id: 1, employee_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      tenant_id: { $type: "objectId" },
      employee_id: { $type: "string" },
    },
  },
);
studentSchema.index(
  { tenant_id: 1, username: 1 },
  {
    unique: true,
    partialFilterExpression: {
      tenant_id: { $type: "objectId" },
      username: { $type: "string" },
    },
  },
);
studentSchema.index({ tenant_id: 1, email: 1 });
studentSchema.index({ department: 1, college: 1, level: 1 });
studentSchema.index({ college: 1, is_active: 1 });
studentSchema.index({ department: 1, is_active: 1 });
studentSchema.index({ level: 1, is_active: 1 });
studentSchema.index({ last_login_at: -1 });
studentSchema.index({ createdAt: -1 });
studentSchema.index({ has_voted_sessions: 1 });
studentSchema.index({ tenant_id: 1, createdAt: -1 });
studentSchema.index({ is_active: 1, college: 1, department: 1, level: 1 }); // For eligibility queries
studentSchema.index({
  full_name: "text",
  email: "text",
  matric_no: "text",
  member_id: "text",
  employee_id: "text",
  username: "text",
}); // For text search

module.exports = mongoose.model("Student", studentSchema);
