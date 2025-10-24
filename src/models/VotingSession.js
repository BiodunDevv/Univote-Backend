const mongoose = require("mongoose");

const votingSessionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    start_time: {
      type: Date,
      required: true,
    },
    end_time: {
      type: Date,
      required: true,
    },
    eligible_college: {
      type: String,
      default: null,
    },
    eligible_departments: {
      type: [String],
      default: null,
    },
    eligible_levels: {
      type: [String],
      default: null,
    },
    categories: {
      type: [String],
      required: true,
      default: [],
    },
    status: {
      type: String,
      enum: ["upcoming", "active", "ended"],
      default: "upcoming",
    },
    candidates: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Candidate",
      },
    ],
    location: {
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
      radius_meters: {
        type: Number,
        required: true,
        default: 5000,
      },
    },
    is_off_campus_allowed: {
      type: Boolean,
      default: false,
    },
    azure_persongroup_id: {
      type: String,
      default: null,
    },
    results_public: {
      type: Boolean,
      default: false,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
votingSessionSchema.index({ status: 1, start_time: 1, end_time: 1 });

// Virtual to check if session is currently active
votingSessionSchema.virtual("is_active").get(function () {
  const now = new Date();
  return now >= this.start_time && now <= this.end_time;
});

// Method to update status based on time
votingSessionSchema.methods.updateStatus = function () {
  const now = new Date();
  if (now < this.start_time) {
    this.status = "upcoming";
  } else if (now >= this.start_time && now <= this.end_time) {
    this.status = "active";
  } else {
    this.status = "ended";
  }
  return this.save();
};

module.exports = mongoose.model("VotingSession", votingSessionSchema);
