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
        default: () => [
          "matric_no",
          "email",
          "member_id",
          "employee_id",
          "username",
        ],
      },
      allowed_eligibility_dimensions: {
        type: [String],
        default: () => ["college", "department", "level"],
      },
    },
    biometrics: {
      active_provider: {
        type: String,
        enum: ["facepp", "aws_rekognition", "azure_face", "google_vision"],
        default: "facepp",
      },
      providers: {
        facepp: {
          enabled: {
            type: Boolean,
            default: true,
          },
          api_key: {
            type: String,
            default: null,
          },
          api_secret: {
            type: String,
            default: null,
          },
          base_url: {
            type: String,
            default: "https://api-us.faceplusplus.com/facepp/v3",
          },
          confidence_threshold: {
            type: Number,
            default: 80,
          },
        },
        aws_rekognition: {
          enabled: {
            type: Boolean,
            default: false,
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
            default: 90,
          },
        },
        azure_face: {
          enabled: {
            type: Boolean,
            default: false,
          },
          endpoint: {
            type: String,
            default: null,
          },
          api_key: {
            type: String,
            default: null,
          },
          confidence_threshold: {
            type: Number,
            default: 80,
          },
        },
        google_vision: {
          enabled: {
            type: Boolean,
            default: false,
          },
          project_id: {
            type: String,
            default: null,
          },
          api_key: {
            type: String,
            default: null,
          },
          confidence_threshold: {
            type: Number,
            default: 80,
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
