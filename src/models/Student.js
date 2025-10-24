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
  },
  {
    timestamps: true,
  }
);

// Index for faster queries (matric_no and email already indexed via unique: true)
studentSchema.index({ department: 1, college: 1, level: 1 });

module.exports = mongoose.model("Student", studentSchema);
