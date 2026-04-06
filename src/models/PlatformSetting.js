const mongoose = require("mongoose");
const { cloneDefaultTenantSettings } = require("../utils/tenantSettings");

const platformSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    defaults: {
      type: mongoose.Schema.Types.Mixed,
      default: () => cloneDefaultTenantSettings(),
    },
    identity_catalog: {
      allowed_identifiers: {
        type: [String],
        default: () => ["matric_no", "email"],
      },
      allowed_eligibility_dimensions: {
        type: [String],
        default: () => ["college", "department", "level"],
      },
    },
    biometrics: {
      active_provider: {
        type: String,
        enum: ["aws_rekognition"],
        default: "aws_rekognition",
      },
      providers: {
        aws_rekognition: {
          enabled: {
            type: Boolean,
            default: true,
          },
          region: {
            type: String,
            default: "us-east-1",
          },
          access_key_id: {
            type: String,
            default: null,
          },
          secret_access_key: {
            type: String,
            default: null,
          },
          similarity_threshold: {
            type: Number,
            default: 70,
          },
          collection_prefix: {
            type: String,
            default: "univote-students",
          },
          liveness_required: {
            type: Boolean,
            default: true,
          },
          liveness_threshold: {
            type: Number,
            default: 70,
          },
        },
      },
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("PlatformSetting", platformSettingSchema);
