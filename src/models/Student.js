const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    matric_no: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    full_name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
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
      required: true,
    },
    department_code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    college: {
      type: String,
      required: true,
    },
    level: {
      type: String,
      required: true,
      enum: ["100", "200", "300", "400", "500", "600"],
    },
    has_voted_sessions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VotingSession",
      },
    ],
    face_reference: {
      azurePersonId: String,
      persistedFaceIds: [String],
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
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for faster queries (matric_no and email already indexed via unique: true)
studentSchema.index({ department: 1, college: 1, level: 1 });
studentSchema.index({ college: 1, is_active: 1 });
studentSchema.index({ department: 1, is_active: 1 });
studentSchema.index({ level: 1, is_active: 1 });
studentSchema.index({ is_active: 1, college: 1, department: 1, level: 1 }); // For eligibility queries
studentSchema.index({ full_name: "text", email: "text", matric_no: "text" }); // For text search

module.exports = mongoose.model("Student", studentSchema);
