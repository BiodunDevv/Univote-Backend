const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema(
  {
    session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VotingSession",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    position: {
      type: String,
      required: true,
      trim: true,
    },
    photo_url: {
      type: String,
      required: true,
    },
    vote_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    bio: {
      type: String,
      default: "",
    },
    manifesto: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
candidateSchema.index({ session_id: 1, position: 1 });

// Method to increment vote count atomically
candidateSchema.methods.incrementVote = async function () {
  return await this.constructor.findByIdAndUpdate(
    this._id,
    { $inc: { vote_count: 1 } },
    { new: true }
  );
};

module.exports = mongoose.model("Candidate", candidateSchema);
