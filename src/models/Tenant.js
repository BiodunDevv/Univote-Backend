const mongoose = require("mongoose");
const { cloneDefaultTenantSettings } = require("../utils/tenantSettings");

const brandingSchema = new mongoose.Schema(
  {
    support_email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },
  },
  { _id: false },
);

const tenantSettingsSchema = new mongoose.Schema(
  {
    labels: {
      participant_singular: {
        type: String,
        default: "Student",
        trim: true,
      },
      participant_plural: {
        type: String,
        default: "Students",
        trim: true,
      },
    },
    identity: {
      primary_identifier: {
        type: String,
        enum: ["matric_no", "email", "member_id", "employee_id", "username"],
        default: "matric_no",
      },
      allowed_identifiers: {
        type: [String],
        default: () => ["matric_no"],
      },
      recovery_identifiers: {
        type: [String],
        default: () => ["email"],
      },
      display_identifier: {
        type: String,
        enum: ["matric_no", "email", "member_id", "employee_id", "username"],
        default: "matric_no",
      },
    },
    auth: {
      require_email: {
        type: Boolean,
        default: true,
      },
      require_photo: {
        type: Boolean,
        default: false,
      },
      require_face_verification: {
        type: Boolean,
        default: false,
      },
    },
    participant_fields: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    features: {
      custom_terminology: {
        type: Boolean,
        default: false,
      },
      custom_identity_policy: {
        type: Boolean,
        default: false,
      },
      custom_participant_structure: {
        type: Boolean,
        default: false,
      },
      advanced_notifications: {
        type: Boolean,
        default: false,
      },
      advanced_reports: {
        type: Boolean,
        default: false,
      },
      face_verification: {
        type: Boolean,
        default: false,
      },
    },
    support: {
      allow_participant_tickets: {
        type: Boolean,
        default: true,
      },
    },
    notifications: {
      email_enabled: {
        type: Boolean,
        default: true,
      },
      in_app_enabled: {
        type: Boolean,
        default: true,
      },
      push_enabled: {
        type: Boolean,
        default: false,
      },
    },
    voting: {
      require_face_verification: {
        type: Boolean,
        default: false,
      },
      face_match_threshold: {
        type: Number,
        default: 80,
        min: 0,
        max: 100,
      },
    },
  },
  { _id: false },
);

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    application_reference: {
      type: String,
      default: undefined,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: ["draft", "pending_approval", "active", "suspended"],
      default: "draft",
    },
    primary_domain: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },
    plan_code: {
      type: String,
      enum: ["university"],
      default: "university",
    },
    branding: {
      type: brandingSchema,
      default: () => ({}),
    },
    settings: {
      type: tenantSettingsSchema,
      default: () => cloneDefaultTenantSettings(),
    },
    feature_flags: {
      type: Map,
      of: Boolean,
      default: () => new Map(),
    },
    quota_overrides: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    onboarding: {
      contact_name: {
        type: String,
        default: null,
      },
      contact_email: {
        type: String,
        default: null,
        lowercase: true,
        trim: true,
      },
      contact_phone: {
        type: String,
        default: null,
        trim: true,
      },
      institution_type: {
        type: String,
        enum: ["university", null],
        default: "university",
      },
      student_count_estimate: {
        type: Number,
        default: null,
      },
      admin_count_estimate: {
        type: Number,
        default: null,
      },
      notes: {
        type: String,
        default: null,
      },
      demo_requested: {
        type: Boolean,
        default: false,
      },
      application_submitted_at: {
        type: Date,
        default: null,
      },
      application_last_updated_at: {
        type: Date,
        default: null,
      },
      activated_at: {
        type: Date,
        default: null,
      },
      approved_at: {
        type: Date,
        default: null,
      },
      rejected_at: {
        type: Date,
        default: null,
      },
      rejection_reason: {
        type: String,
        default: null,
      },
      structure_preferences: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      identity_preferences: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      status_timeline: {
        type: [
          new mongoose.Schema(
            {
              status: {
                type: String,
                required: true,
                trim: true,
              },
              label: {
                type: String,
                default: null,
              },
              note: {
                type: String,
                default: null,
              },
              at: {
                type: Date,
                default: Date.now,
              },
            },
            { _id: false },
          ),
        ],
        default: () => [],
      },
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

tenantSchema.index({ status: 1 });
tenantSchema.index({ primary_domain: 1 }, { sparse: true });

module.exports = mongoose.model("Tenant", tenantSchema);
