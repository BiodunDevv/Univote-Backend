const mongoose = require("mongoose");

const voteSchema = new mongoose.Schema(
  {
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VotingSession",
      required: true,
    },
    candidate_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
    },
    position: {
      type: String,
      required: true,
    },
    geo_location: {
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
    },
    face_match_score: {
      type: Number,
      default: null,
    },
    face_verification_passed: {
      type: Boolean,
      default: false,
    },
    face_token: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["valid", "duplicate", "rejected"],
      default: "valid",
    },
    device_id: {
      type: String,
      default: null,
    },
    ip_address: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
voteSchema.index({ student_id: 1, session_id: 1 });
voteSchema.index({ session_id: 1, candidate_id: 1 });
voteSchema.index({ session_id: 1, status: 1 });
voteSchema.index({ session_id: 1, status: 1, position: 1 }); // For aggregation queries

// Ensure student can only vote once per session per position
voteSchema.index(
  { student_id: 1, session_id: 1, position: 1 },
  { unique: true }
);

module.exports = mongoose.model("Vote", voteSchema);
