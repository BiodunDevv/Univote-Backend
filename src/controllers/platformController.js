const Admin = require("../models/Admin");
const Tenant = require("../models/Tenant");
const TenantAdminMembership = require("../models/TenantAdminMembership");
const Student = require("../models/Student");
const College = require("../models/College");
const VotingSession = require("../models/VotingSession");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const PlatformSetting = require("../models/PlatformSetting");
const Coupon = require("../models/Coupon");
const { cloneDefaultTenantSettings, getTenantSettingsCatalog, mergeTenantSettings } = require("../utils/tenantSettings");
const faceProviderService = require("../services/faceProviderService");
const emailService = require("../services/emailService");
const {
  clonePlanCatalog,
  normalizePlanDefinition,
  serializePlanCatalog,
  setPlanCatalog,
} = require("../config/billingPlans");

function serializeTenant(tenant) {
  return {
    id: tenant._id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    primary_domain: tenant.primary_domain,
    plan_code: tenant.plan_code,
    subscription_status: tenant.subscription_status,
    is_active: tenant.is_active,
    branding: tenant.branding || {},
    onboarding: tenant.onboarding || {},
    billing: tenant.billing || {},
    settings: mergeTenantSettings(tenant.settings || {}),
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

async function getOrCreatePlatformSetting() {
  let platformSetting = await PlatformSetting.findOne({ key: "defaults" });
  if (!platformSetting) {
    platformSetting = await PlatformSetting.create({
      key: "defaults",
      defaults: cloneDefaultTenantSettings(),
      plan_entitlements: getTenantSettingsCatalog(),
      plan_catalog: clonePlanCatalog(),
    });
  }
  return platformSetting;
}

function normalizeBiometricProviderPayload(providerKey, payload = {}, current = {}) {
  switch (providerKey) {
    case "facepp":
      return {
        ...current,
        enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : current.enabled !== false,
        api_key:
          payload.api_key !== undefined && payload.api_key !== ""
            ? String(payload.api_key).trim()
            : current.api_key || null,
        api_secret:
          payload.api_secret !== undefined && payload.api_secret !== ""
            ? String(payload.api_secret).trim()
            : current.api_secret || null,
        base_url:
          payload.base_url !== undefined && payload.base_url !== ""
            ? String(payload.base_url).trim()
            : current.base_url || "https://api-us.faceplusplus.com/facepp/v3",
        confidence_threshold:
          payload.confidence_threshold !== undefined
            ? Number(payload.confidence_threshold)
            : current.confidence_threshold || 80,
      };
    case "aws_rekognition":
      return {
        ...current,
        enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : Boolean(current.enabled),
        region:
          payload.region !== undefined && payload.region !== ""
            ? String(payload.region).trim()
            : current.region || "us-east-1",
        access_key_id:
          payload.access_key_id !== undefined && payload.access_key_id !== ""
            ? String(payload.access_key_id).trim()
            : current.access_key_id || null,
        secret_access_key:
          payload.secret_access_key !== undefined && payload.secret_access_key !== ""
            ? String(payload.secret_access_key).trim()
            : current.secret_access_key || null,
        similarity_threshold:
          payload.similarity_threshold !== undefined
            ? Number(payload.similarity_threshold)
            : current.similarity_threshold || 90,
      };
    case "azure_face":
      return {
        ...current,
        enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : Boolean(current.enabled),
        endpoint:
          payload.endpoint !== undefined && payload.endpoint !== ""
            ? String(payload.endpoint).trim()
            : current.endpoint || null,
        api_key:
          payload.api_key !== undefined && payload.api_key !== ""
            ? String(payload.api_key).trim()
            : current.api_key || null,
        confidence_threshold:
          payload.confidence_threshold !== undefined
            ? Number(payload.confidence_threshold)
            : current.confidence_threshold || 80,
      };
    case "google_vision":
      return {
        ...current,
        enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : Boolean(current.enabled),
        project_id:
          payload.project_id !== undefined && payload.project_id !== ""
            ? String(payload.project_id).trim()
            : current.project_id || null,
        api_key:
          payload.api_key !== undefined && payload.api_key !== ""
            ? String(payload.api_key).trim()
            : current.api_key || null,
        confidence_threshold:
          payload.confidence_threshold !== undefined
            ? Number(payload.confidence_threshold)
            : current.confidence_threshold || 80,
      };
    default:
      return current;
  }
}

function validateBiometricProviderConfig(providerKey, payload = {}) {
  switch (providerKey) {
    case "facepp":
      if (!String(payload.api_key || "").trim()) {
        return "Face++ API key is required";
      }
      if (!String(payload.api_secret || "").trim()) {
        return "Face++ API secret is required";
      }
      return null;
    case "aws_rekognition":
      if (!String(payload.access_key_id || "").trim()) {
        return "AWS access key ID is required";
      }
      if (!String(payload.secret_access_key || "").trim()) {
        return "AWS secret access key is required";
      }
      return null;
    case "azure_face":
      if (!String(payload.endpoint || "").trim()) {
        return "Azure endpoint is required";
      }
      if (!String(payload.api_key || "").trim()) {
        return "Azure API key is required";
      }
      return null;
    case "google_vision":
      if (!String(payload.project_id || "").trim()) {
        return "Google project ID is required";
      }
      if (!String(payload.api_key || "").trim()) {
        return "Google API key is required";
      }
      return null;
    default:
      return "Unsupported biometric provider";
  }
}

async function buildTenantStats(tenantId) {
  const [membershipSummary, studentSummary, collegeCount, sessionSummary, candidateCount, voteSummary] =
    await Promise.all([
      TenantAdminMembership.aggregate([
        {
          $match: {
            tenant_id: tenantId,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: {
              $sum: {
                $cond: [{ $eq: ["$is_active", true] }, 1, 0],
              },
            },
            owners: {
              $sum: {
                $cond: [{ $eq: ["$role", "owner"] }, 1, 0],
              },
            },
          },
        },
      ]),
      Student.aggregate([
        {
          $match: {
            tenant_id: tenantId,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: {
              $sum: {
                $cond: [{ $eq: ["$is_active", true] }, 1, 0],
              },
            },
          },
        },
      ]),
      College.countDocuments({ tenant_id: tenantId }),
      VotingSession.aggregate([
        {
          $match: {
            tenant_id: tenantId,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: {
              $sum: {
                $cond: [{ $eq: ["$status", "active"] }, 1, 0],
              },
            },
            upcoming: {
              $sum: {
                $cond: [{ $eq: ["$status", "upcoming"] }, 1, 0],
              },
            },
            ended: {
              $sum: {
                $cond: [{ $eq: ["$status", "ended"] }, 1, 0],
              },
            },
          },
        },
      ]),
      Candidate.countDocuments({ tenant_id: tenantId }),
      Vote.aggregate([
        {
          $match: {
            tenant_id: tenantId,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            accepted: {
              $sum: {
                $cond: [{ $eq: ["$status", "accepted"] }, 1, 0],
              },
            },
            rejected: {
              $sum: {
                $cond: [{ $eq: ["$status", "rejected"] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

  return {
    admins: membershipSummary[0] || { total: 0, active: 0, owners: 0 },
    students: studentSummary[0] || { total: 0, active: 0 },
    colleges: collegeCount,
    sessions:
      sessionSummary[0] || { total: 0, active: 0, upcoming: 0, ended: 0 },
    candidates: candidateCount,
    votes: voteSummary[0] || { total: 0, accepted: 0, rejected: 0 },
  };
}

class PlatformController {
  async getOverview(_req, res) {
    try {
      const [
        totalTenants,
        activeTenants,
        suspendedTenants,
        expiringTenants,
        totalTenantAdmins,
      ] = await Promise.all([
        Tenant.countDocuments({}),
        Tenant.countDocuments({ status: "active", is_active: true }),
        Tenant.countDocuments({
          $or: [{ status: "suspended" }, { subscription_status: "suspended" }],
        }),
        Tenant.countDocuments({ subscription_status: "grace" }),
        TenantAdminMembership.countDocuments({ is_active: true }),
      ]);

      res.json({
        overview: {
          total_tenants: totalTenants,
          active_tenants: activeTenants,
          suspended_tenants: suspendedTenants,
          grace_period_tenants: expiringTenants,
          active_tenant_admins: totalTenantAdmins,
        },
      });
    } catch (error) {
      console.error("Get platform overview error:", error);
      res.status(500).json({ error: "Failed to fetch platform overview" });
    }
  }

  async listTenants(req, res) {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;
      const search = String(req.query.search || "").trim();
      const status = String(req.query.status || "").trim();
      const subscriptionStatus = String(req.query.subscription_status || "").trim();

      const filter = {};

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { slug: { $regex: search, $options: "i" } },
          { primary_domain: { $regex: search, $options: "i" } },
        ];
      }

      if (status) filter.status = status;
      if (subscriptionStatus) filter.subscription_status = subscriptionStatus;

      const [tenants, total] = await Promise.all([
        Tenant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Tenant.countDocuments(filter),
      ]);

      res.json({
        tenants: tenants.map(serializeTenant),
        page,
        pages: Math.max(Math.ceil(total / limit), 1),
        total,
      });
    } catch (error) {
      console.error("List tenants error:", error);
      res.status(500).json({ error: "Failed to fetch tenants" });
    }
  }

  async createTenant(req, res) {
    try {
      const {
        name,
        slug,
        primary_domain,
        plan_code,
        contact_name,
        contact_email,
        owner_admin_id,
      } = req.body;

      const normalizedSlug = String(slug).trim().toLowerCase();
      const existingTenant = await Tenant.findOne({
        $or: [{ slug: normalizedSlug }, ...(primary_domain ? [{ primary_domain: primary_domain.toLowerCase() }] : [])],
      }).select("_id slug primary_domain");

      if (existingTenant) {
        return res.status(409).json({
          error: "Tenant slug or primary domain already exists",
        });
      }

      let ownerAdmin = null;
      if (owner_admin_id) {
        ownerAdmin = await Admin.findById(owner_admin_id).select("_id role");
        if (!ownerAdmin) {
          return res.status(404).json({ error: "Owner admin not found" });
        }
      }

      const tenant = await Tenant.create({
        name: String(name).trim(),
        slug: normalizedSlug,
        primary_domain: primary_domain ? String(primary_domain).trim().toLowerCase() : null,
        plan_code: plan_code || "pro",
        status: "pending_payment",
        subscription_status: "trial",
        billing: {
          billing_cycle: "monthly",
          currency: "NGN",
        },
        onboarding: {
          contact_name: contact_name ? String(contact_name).trim() : null,
          contact_email: contact_email ? String(contact_email).trim().toLowerCase() : null,
        },
        settings: cloneDefaultTenantSettings(),
      });

      if (ownerAdmin) {
        await TenantAdminMembership.create({
          tenant_id: tenant._id,
          admin_id: ownerAdmin._id,
          role: "owner",
          permissions: [
            "tenant.manage",
            "billing.manage",
            "students.manage",
            "sessions.manage",
            "support.manage",
          ],
        });
      }

      res.status(201).json({
        message: "Tenant created successfully",
        tenant: serializeTenant(tenant),
      });
    } catch (error) {
      console.error("Create tenant error:", error);
      res.status(500).json({ error: "Failed to create tenant" });
    }
  }

  async getTenantById(req, res) {
    try {
      const { id } = req.params;
      const tenant = await Tenant.findById(id).lean();

      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const [stats, memberships] = await Promise.all([
        buildTenantStats(tenant._id),
        TenantAdminMembership.find({ tenant_id: tenant._id })
          .sort({ createdAt: 1 })
          .limit(10)
          .lean(),
      ]);

      const admins = await Admin.find({
        _id: { $in: memberships.map((membership) => membership.admin_id) },
      })
        .select("full_name email role is_active")
        .lean();

      const adminMap = new Map(admins.map((admin) => [admin._id.toString(), admin]));
      const team = memberships
        .map((membership) => {
          const admin = adminMap.get(membership.admin_id.toString());

          if (!admin) {
            return null;
          }

          return {
            id: membership._id,
            admin_id: admin._id,
            full_name: admin.full_name,
            email: admin.email,
            global_role: admin.role,
            is_global_active: admin.is_active,
            role: membership.role,
            is_active: membership.is_active,
            permissions: membership.permissions || [],
            last_access_at: membership.last_access_at,
          };
        })
        .filter(Boolean);

      return res.json({
        tenant: serializeTenant(tenant),
        stats,
        team,
      });
    } catch (error) {
      console.error("Get tenant detail error:", error);
      return res.status(500).json({ error: "Failed to fetch tenant detail" });
    }
  }

  async updateTenant(req, res) {
    try {
      const { id } = req.params;
      const {
        name,
        primary_domain,
        contact_name,
        contact_email,
        support_email,
        institution_type,
        student_count_estimate,
        admin_count_estimate,
        notes,
        demo_requested,
        payment_required,
        plan_code,
        status,
        subscription_status,
        is_active,
        rejection_reason,
      } = req.body;

      const tenant = await Tenant.findById(id);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      const previousStatus = tenant.status;
      const previousPlanCode = tenant.plan_code;
      const previousSubscriptionStatus = tenant.subscription_status;

      if (primary_domain) {
        const normalizedDomain = String(primary_domain).trim().toLowerCase();
        const conflictingTenant = await Tenant.findOne({
          _id: { $ne: tenant._id },
          primary_domain: normalizedDomain,
        }).select("_id");

        if (conflictingTenant) {
          return res.status(409).json({
            error: "Another tenant already uses this primary domain",
          });
        }

        tenant.primary_domain = normalizedDomain;
      } else if (primary_domain === "") {
        tenant.primary_domain = null;
      }

      if (name !== undefined) {
        tenant.name = String(name).trim();
      }

      if (contact_name !== undefined) {
        tenant.onboarding.contact_name = contact_name
          ? String(contact_name).trim()
          : null;
      }

      if (contact_email !== undefined) {
        tenant.onboarding.contact_email = contact_email
          ? String(contact_email).trim().toLowerCase()
          : null;
      }

      if (support_email !== undefined) {
        tenant.branding.support_email = support_email
          ? String(support_email).trim().toLowerCase()
          : null;
      }

      if (institution_type !== undefined) {
        tenant.onboarding.institution_type = institution_type
          ? String(institution_type).trim()
          : null;
      }

      if (student_count_estimate !== undefined) {
        tenant.onboarding.student_count_estimate =
          student_count_estimate === null || student_count_estimate === ""
            ? null
            : Number(student_count_estimate);
      }

      if (admin_count_estimate !== undefined) {
        tenant.onboarding.admin_count_estimate =
          admin_count_estimate === null || admin_count_estimate === ""
            ? null
            : Number(admin_count_estimate);
      }

      if (notes !== undefined) {
        tenant.onboarding.notes = notes ? String(notes).trim() : null;
      }

      if (demo_requested !== undefined) {
        tenant.onboarding.demo_requested = Boolean(demo_requested);
      }

      if (payment_required !== undefined) {
        tenant.onboarding.payment_required = Boolean(payment_required);
      }

      if (plan_code !== undefined) tenant.plan_code = plan_code;
      if (status !== undefined) tenant.status = status;
      if (subscription_status !== undefined) {
        tenant.subscription_status = subscription_status;
      }
      if (is_active !== undefined) tenant.is_active = Boolean(is_active);

      if (rejection_reason !== undefined) {
        tenant.onboarding.rejection_reason = rejection_reason
          ? String(rejection_reason).trim()
          : null;
      }

      if (tenant.status === "active" && !tenant.onboarding.activated_at) {
        tenant.onboarding.activated_at = new Date();
      }

      if (tenant.status === "active" && !tenant.onboarding.approved_at) {
        tenant.onboarding.approved_at = new Date();
      }

      if (tenant.status === "pending_approval") {
        tenant.onboarding.rejected_at = null;
      }

      if (tenant.status === "suspended" || tenant.status === "draft") {
        tenant.onboarding.activated_at = tenant.status === "draft"
          ? null
          : tenant.onboarding.activated_at;
      }

      if (tenant.status === "draft" && previousStatus !== "draft") {
        tenant.onboarding.rejected_at = new Date();
      }

      if (tenant.status === "active" && !tenant.billing?.current_period_end) {
        tenant.billing = {
          ...(tenant.billing?.toObject?.() || tenant.billing || {}),
          billing_cycle: tenant.billing?.billing_cycle || "monthly",
          currency: tenant.billing?.currency || "NGN",
          current_period_start: new Date(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          last_payment_at: new Date(),
        };
      }

      await tenant.save();

      if (
        tenant.onboarding?.contact_email &&
        (previousStatus !== tenant.status ||
          previousPlanCode !== tenant.plan_code ||
          previousSubscriptionStatus !== tenant.subscription_status)
      ) {
        const workspaceUrl = tenant.primary_domain
          ? `https://${tenant.primary_domain}`
          : `${process.env.PUBLIC_APP_URL || "http://localhost:3000"}`;
        const statusUrl = `${process.env.PUBLIC_APP_URL || "http://localhost:3000"}/application-status?reference=${encodeURIComponent(
          tenant.application_reference || "",
        )}&email=${encodeURIComponent(tenant.onboarding.contact_email)}`;

        let notificationPromise = null;

        if (tenant.status === "active" && previousStatus !== "active") {
          notificationPromise = emailService.sendTenantApplicationApproved({
            to: tenant.onboarding.contact_email,
            contactName: tenant.onboarding.contact_name,
            tenantName: tenant.name,
            applicationReference: tenant.application_reference || null,
            workspaceUrl,
          });
        } else if (tenant.status === "draft" && previousStatus !== "draft") {
          notificationPromise = emailService.sendTenantApplicationRejected({
            to: tenant.onboarding.contact_email,
            contactName: tenant.onboarding.contact_name,
            tenantName: tenant.name,
            applicationReference: tenant.application_reference || null,
            reason: tenant.onboarding.rejection_reason || null,
            statusUrl,
          });
        } else if (tenant.status === "pending_payment" && previousStatus !== "pending_payment") {
          notificationPromise = emailService.sendTenantApplicationPaymentRequired({
            to: tenant.onboarding.contact_email,
            contactName: tenant.onboarding.contact_name,
            tenantName: tenant.name,
            planCode: tenant.plan_code,
            applicationReference: tenant.application_reference || null,
            amountLabel:
              tenant.onboarding?.billing_snapshot?.payable_amount_ngn !== undefined
                ? `${tenant.onboarding.billing_snapshot.payable_amount_ngn} NGN`
                : null,
          });
        } else {
          notificationPromise = emailService.sendTenantStatusUpdate({
            to: tenant.onboarding.contact_email,
            contactName: tenant.onboarding.contact_name,
            tenantName: tenant.name,
            status: tenant.status,
            message: `Your workspace is currently ${tenant.status.replace(/_/g, " ")} on the ${tenant.plan_code} plan with subscription status ${tenant.subscription_status}.`,
            ctaLabel: tenant.status === "active" ? "Open workspace" : null,
            ctaLink: workspaceUrl,
          });
        }

        notificationPromise.catch((err) => {
          console.error("Failed to send tenant lifecycle email:", err);
        });
      }

      return res.json({
        message: "Tenant updated successfully",
        tenant: serializeTenant(tenant),
      });
    } catch (error) {
      console.error("Update tenant error:", error);
      return res.status(500).json({ error: "Failed to update tenant" });
    }
  }

  async updateTenantStatus(req, res) {
    return this.updateTenant(req, res);
  }

  async listCoupons(req, res) {
    try {
      const search = String(req.query.search || "").trim();
      const filter = {};

      if (search) {
        filter.$or = [
          { code: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
        ];
      }

      const coupons = await Coupon.find(filter).sort({ createdAt: -1 }).lean();
      return res.json({ coupons });
    } catch (error) {
      console.error("List coupons error:", error);
      return res.status(500).json({ error: "Failed to fetch coupons" });
    }
  }

  async createCoupon(req, res) {
    try {
      const coupon = await Coupon.create({
        ...req.body,
        code: String(req.body.code || "").trim().toUpperCase(),
      });
      return res.status(201).json({
        message: "Coupon created successfully",
        coupon,
      });
    } catch (error) {
      console.error("Create coupon error:", error);
      return res.status(500).json({ error: "Failed to create coupon" });
    }
  }

  async updateCoupon(req, res) {
    try {
      const coupon = await Coupon.findById(req.params.id);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }

      Object.assign(coupon, req.body || {});
      if (req.body.code !== undefined) {
        coupon.code = String(req.body.code || "").trim().toUpperCase();
      }

      await coupon.save();

      return res.json({
        message: "Coupon updated successfully",
        coupon,
      });
    } catch (error) {
      console.error("Update coupon error:", error);
      return res.status(500).json({ error: "Failed to update coupon" });
    }
  }

  async getPlatformSettings(_req, res) {
    try {
      const platformSetting = await getOrCreatePlatformSetting();
      res.json({
        defaults: platformSetting.defaults || cloneDefaultTenantSettings(),
        identity_catalog:
          platformSetting.identity_catalog || getTenantSettingsCatalog(),
        plan_entitlements: platformSetting.plan_entitlements || {},
        plans: serializePlanCatalog(),
        biometrics: await faceProviderService.getSettingsSummary(),
      });
    } catch (error) {
      console.error("Get platform settings error:", error);
      res.status(500).json({ error: "Failed to fetch platform settings" });
    }
  }

  async updatePlatformSettings(req, res) {
    try {
      const platformSetting = await getOrCreatePlatformSetting();

      if (req.body.defaults) {
        platformSetting.defaults = mergeTenantSettings(req.body.defaults);
      }

      if (req.body.identity_catalog) {
        platformSetting.identity_catalog = {
          ...(platformSetting.identity_catalog || {}),
          ...req.body.identity_catalog,
        };
      }

      if (req.body.plan_entitlements) {
        platformSetting.plan_entitlements = req.body.plan_entitlements;
      }

      if (req.body.biometrics) {
        const nextBiometrics = req.body.biometrics || {};
        const currentProviders = platformSetting.biometrics?.providers || {};
        const incomingProviders = nextBiometrics.providers || {};
        const supportedProviders = Object.keys(
          faceProviderService.getProviderCatalog(),
        );
        const nextProviders = { ...currentProviders };

        supportedProviders.forEach((providerKey) => {
          nextProviders[providerKey] = normalizeBiometricProviderPayload(
            providerKey,
            incomingProviders[providerKey] || {},
            currentProviders[providerKey] || {},
          );
        });

        platformSetting.biometrics = {
          active_provider: nextBiometrics.active_provider || platformSetting.biometrics?.active_provider || "facepp",
          providers: nextProviders,
        };
      }

      await platformSetting.save();

      res.json({
        message: "Platform settings updated successfully",
        defaults: platformSetting.defaults,
        identity_catalog: platformSetting.identity_catalog,
        plan_entitlements: platformSetting.plan_entitlements,
        plans: serializePlanCatalog(),
        biometrics: await faceProviderService.getSettingsSummary(),
      });
    } catch (error) {
      console.error("Update platform settings error:", error);
      res.status(500).json({ error: "Failed to update platform settings" });
    }
  }

  async createBiometricProvider(req, res) {
    try {
      const { provider_key, config = {}, set_active = false } = req.body || {};
      const providerCatalog = faceProviderService.getProviderCatalog();

      if (!provider_key || !providerCatalog[provider_key]) {
        return res.status(400).json({ error: "Valid provider_key is required" });
      }

      const validationError = validateBiometricProviderConfig(provider_key, config);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const platformSetting = await getOrCreatePlatformSetting();
      const currentProviders = platformSetting.biometrics?.providers || {};
      const defaultState =
        faceProviderService.getProviderDefaultState(provider_key) || {};
      const supportedProviders = Object.keys(
        faceProviderService.getProviderCatalog(),
      );
      const nextProviders = {};

      supportedProviders.forEach((supportedProviderKey) => {
        const baseState =
          currentProviders[supportedProviderKey] ||
          faceProviderService.getProviderDefaultState(supportedProviderKey) ||
          {};

        nextProviders[supportedProviderKey] =
          supportedProviderKey === provider_key
            ? normalizeBiometricProviderPayload(
                provider_key,
                { ...defaultState, ...config, enabled: true },
                baseState,
              )
            : normalizeBiometricProviderPayload(
                supportedProviderKey,
                {},
                baseState,
              );
      });

      platformSetting.biometrics = {
        active_provider:
          set_active || !platformSetting.biometrics?.active_provider
            ? provider_key
            : platformSetting.biometrics?.active_provider || "facepp",
        providers: nextProviders,
      };

      await platformSetting.save();

      return res.status(201).json({
        message: `${providerCatalog[provider_key].label} provider created successfully`,
        biometrics: await faceProviderService.getSettingsSummary(),
      });
    } catch (error) {
      console.error("Create biometric provider error:", error);
      return res.status(500).json({ error: "Failed to create biometric provider" });
    }
  }

  async deleteBiometricProvider(req, res) {
    try {
      const { providerKey } = req.params;
      const providerCatalog = faceProviderService.getProviderCatalog();

      if (!providerCatalog[providerKey]) {
        return res.status(404).json({ error: "Biometric provider not found" });
      }

      const platformSetting = await getOrCreatePlatformSetting();
      const currentProviders = platformSetting.biometrics?.providers || {};
      const defaultState =
        faceProviderService.getProviderDefaultState(providerKey) || {};
      const supportedProviders = Object.keys(
        faceProviderService.getProviderCatalog(),
      );
      const nextProviders = {};

      supportedProviders.forEach((supportedProviderKey) => {
        const baseState =
          currentProviders[supportedProviderKey] ||
          faceProviderService.getProviderDefaultState(supportedProviderKey) ||
          {};
        nextProviders[supportedProviderKey] =
          supportedProviderKey === providerKey
            ? defaultState
            : normalizeBiometricProviderPayload(
                supportedProviderKey,
                {},
                baseState,
              );
      });

      platformSetting.biometrics = {
        active_provider:
          platformSetting.biometrics?.active_provider === providerKey
            ? "facepp"
            : platformSetting.biometrics?.active_provider || "facepp",
        providers: nextProviders,
      };

      await platformSetting.save();

      return res.json({
        message: `${providerCatalog[providerKey].label} provider removed successfully`,
        biometrics: await faceProviderService.getSettingsSummary(),
      });
    } catch (error) {
      console.error("Delete biometric provider error:", error);
      return res.status(500).json({ error: "Failed to delete biometric provider" });
    }
  }

  async testBiometricProvider(req, res) {
    try {
      const { image_url, provider_key } = req.body;
      if (!image_url) {
        return res.status(400).json({ error: "Image URL is required" });
      }

      const providerCatalog = faceProviderService.getProviderCatalog();
      if (provider_key && !providerCatalog[provider_key]) {
        return res.status(400).json({ error: "Invalid provider_key supplied" });
      }

      const result = await faceProviderService.testConnectionForProvider(
        provider_key || null,
        image_url,
      );
      if (!result.success) {
        if (req.admin?.email) {
          emailService
            .sendProviderAlert({
              to: req.admin.email,
              recipientName: req.admin.full_name,
              providerName: result.provider || "Biometric provider",
              message: result.error || "The biometric provider test failed.",
              ctaLink: `${process.env.PUBLIC_APP_URL || "http://localhost:3000"}/super-admin/settings`,
            })
            .catch((err) => {
              console.error("Failed to send biometric provider alert email:", err);
            });
        }
        return res.status(400).json({
          error: result.error || "Biometric provider test failed",
          code: result.code || "BIOMETRIC_PROVIDER_TEST_FAILED",
          provider: result.provider || "facepp",
          provider_status: await faceProviderService.getStatus(provider_key || null),
          requirements:
            provider_key && providerCatalog[provider_key]
              ? providerCatalog[provider_key].requirements
              : undefined,
        });
      }

      return res.json({
        message: "Biometric provider test completed successfully",
        provider: result.provider || "facepp",
        provider_status: await faceProviderService.getStatus(provider_key || null),
        summary: {
          detection: result.face_token ? "Face detected" : "No face token returned",
          image_checked: image_url,
        },
        result: {
          face_token: result.face_token ? `${result.face_token.slice(0, 20)}...` : null,
          face_rectangle: result.face_rectangle || null,
          image_id: result.image_id || null,
        },
        provider_response: {
          success: Boolean(result.success),
          provider: result.provider || "facepp",
          readiness: result.readiness || null,
        },
      });
    } catch (error) {
      console.error("Test biometric provider error:", error);
      return res.status(500).json({ error: "Failed to test biometric provider" });
    }
  }

  async updatePlatformPlan(req, res) {
    try {
      const { code } = req.params;
      const platformSetting = await getOrCreatePlatformSetting();
      const currentCatalog = clonePlanCatalog(
        platformSetting.plan_catalog || undefined,
      );
      const existingPlan = currentCatalog[code];

      if (!existingPlan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const nextPlan = normalizePlanDefinition({
        ...existingPlan,
        ...req.body,
        code,
        limits: {
          ...existingPlan.limits,
          ...(req.body?.limits || {}),
        },
        entitlements: {
          ...existingPlan.entitlements,
          ...(req.body?.entitlements || {}),
        },
        features: Array.isArray(req.body?.features)
          ? req.body.features
          : existingPlan.features,
      });

      currentCatalog[code] = nextPlan;
      platformSetting.plan_catalog = currentCatalog;
      await platformSetting.save();
      setPlanCatalog(currentCatalog);

      return res.json({
        message: `${nextPlan.name} updated successfully`,
        plan: nextPlan,
        plans: serializePlanCatalog(),
      });
    } catch (error) {
      console.error("Update platform plan error:", error);
      return res.status(500).json({ error: "Failed to update plan" });
    }
  }
}

module.exports = new PlatformController();
