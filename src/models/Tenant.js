const mongoose = require("mongoose");
const { cloneDefaultTenantSettings } = require("../utils/tenantSettings");

const brandingSchema = new mongoose.Schema(
  {
    primary_color: {
      type: String,
      default: "#0f172a",
    },
    accent_color: {
      type: String,
      default: "#2563eb",
    },
    logo_url: {
      type: String,
      default: null,
    },
    support_email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },
  },
  { _id: false },
);

const billingRefsSchema = new mongoose.Schema(
  {
    paystack_customer_code: {
      type: String,
      default: null,
    },
    paystack_subscription_code: {
      type: String,
      default: null,
    },
    paystack_plan_code: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const billingStateSchema = new mongoose.Schema(
  {
    billing_cycle: {
      type: String,
      enum: ["monthly", "annual"],
      default: "monthly",
    },
    currency: {
      type: String,
      default: "NGN",
    },
    current_period_start: {
      type: Date,
      default: null,
    },
    current_period_end: {
      type: Date,
      default: null,
    },
    grace_ends_at: {
      type: Date,
      default: null,
    },
    last_payment_at: {
      type: Date,
      default: null,
    },
    next_plan_code: {
      type: String,
      enum: ["pro", "pro_plus", "enterprise", null],
      default: null,
    },
    next_plan_effective_at: {
      type: Date,
      default: null,
    },
    next_plan_requested_at: {
      type: Date,
      default: null,
    },
    last_invoice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
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
    status: {
      type: String,
      enum: ["draft", "pending_payment", "pending_approval", "active", "suspended"],
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
      enum: ["pro", "pro_plus", "enterprise"],
      default: "pro",
    },
    subscription_status: {
      type: String,
      enum: ["trial", "active", "grace", "expired", "suspended"],
      default: "trial",
    },
    billing_refs: {
      type: billingRefsSchema,
      default: () => ({}),
    },
    billing: {
      type: billingStateSchema,
      default: () => ({}),
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
        enum: ["university", "college", "polytechnic", "faculty", "organization", null],
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
      activated_at: {
        type: Date,
        default: null,
      },
      approved_at: {
        type: Date,
        default: null,
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

tenantSchema.index({ status: 1, subscription_status: 1 });
tenantSchema.index({ primary_domain: 1 }, { sparse: true });
tenantSchema.index({ "billing.current_period_end": 1, subscription_status: 1 });
tenantSchema.index({ "billing.next_plan_effective_at": 1 });

module.exports = mongoose.model("Tenant", tenantSchema);
