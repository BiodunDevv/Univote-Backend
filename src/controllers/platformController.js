const Admin = require("../models/Admin");
const Tenant = require("../models/Tenant");
const TenantAdminMembership = require("../models/TenantAdminMembership");
const Student = require("../models/Student");
const College = require("../models/College");
const VotingSession = require("../models/VotingSession");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const PlatformSetting = require("../models/PlatformSetting");
const VerificationLog = require("../models/VerificationLog");
const {
  cloneDefaultTenantSettings,
  getTenantSettingsCatalog,
  mergeTenantSettings,
} = require("../utils/tenantSettings");
const faceProviderService = require("../services/faceProviderService");
const emailService = require("../services/emailService");
const { getVerificationMetrics } = require("../services/biometricAnalyticsService");

function serializePlatformVerificationLog(log) {
  return {
    id: log._id,
    tenant: log.tenant_id
      ? {
          id: log.tenant_id._id,
          name: log.tenant_id.name,
          slug: log.tenant_id.slug,
        }
      : null,
    student: log.user_id
      ? {
          id: log.user_id._id,
          full_name: log.user_id.full_name,
          matric_no: log.user_id.matric_no,
          email: log.user_id.email,
        }
      : null,
    session: log.session_id
      ? {
          id: log.session_id._id,
          title: log.session_id.title,
          status: log.session_id.status,
        }
      : null,
    confidence_score: log.confidence_score,
    threshold_used: log.threshold_used,
    liveness_session_id: log.liveness_session_id || null,
    liveness_status: log.liveness_status || null,
    liveness_confidence: log.liveness_confidence ?? null,
    liveness_threshold: log.liveness_threshold ?? null,
    compare_confidence: log.compare_confidence ?? log.confidence_score ?? null,
    compare_threshold: log.compare_threshold ?? log.threshold_used ?? null,
    matched_face_id: log.matched_face_id || null,
    decision_source: log.decision_source || null,
    fail_streak: log.fail_streak || 0,
    lockout_triggered: log.lockout_triggered === true,
    lockout_expires_at: log.lockout_expires_at || null,
    result: log.result,
    failure_reason: log.failure_reason,
    is_genuine_attempt: log.is_genuine_attempt,
    provider: log.provider,
    reviewed_by: log.reviewed_by
      ? {
          id: log.reviewed_by._id,
          full_name: log.reviewed_by.full_name,
          email: log.reviewed_by.email,
        }
      : null,
    reviewed_at: log.reviewed_at,
    review_note: log.review_note,
    device_id: log.device_id || null,
    ip_address: log.ip_address || null,
    geo_location: log.geo_location || null,
    image_url: log.image_url || null,
    timestamp: log.timestamp,
  };
}

function serializeTenant(tenant) {
  return {
    id: tenant._id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    primary_domain: tenant.primary_domain,
    is_active: tenant.is_active,
    branding: tenant.branding || {},
    onboarding: tenant.onboarding || {},
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
    });
  }
  return platformSetting;
}

function normalizeBiometricProviderPayload(
  providerKey,
  payload = {},
  current = {},
) {
  switch (providerKey) {
    case "aws_rekognition":
      return {
        ...current,
        enabled:
          payload.enabled !== undefined
            ? Boolean(payload.enabled)
            : Boolean(current.enabled),
        region:
          payload.region !== undefined && payload.region !== ""
            ? String(payload.region).trim()
            : current.region || "us-east-1",
        access_key_id:
          payload.access_key_id !== undefined && payload.access_key_id !== ""
            ? String(payload.access_key_id).trim()
            : current.access_key_id || null,
        secret_access_key:
          payload.secret_access_key !== undefined &&
          payload.secret_access_key !== ""
            ? String(payload.secret_access_key).trim()
            : current.secret_access_key || null,
        similarity_threshold:
          payload.similarity_threshold !== undefined
            ? Number(payload.similarity_threshold)
            : current.similarity_threshold || 70,
        collection_prefix:
          payload.collection_prefix !== undefined && payload.collection_prefix !== ""
            ? String(payload.collection_prefix).trim()
            : current.collection_prefix || "univote-students",
        liveness_required:
          payload.liveness_required !== undefined
            ? Boolean(payload.liveness_required)
            : current.liveness_required !== false,
        liveness_threshold:
          payload.liveness_threshold !== undefined
            ? Number(payload.liveness_threshold)
            : current.liveness_threshold || 70,
      };
    default:
      return current;
  }
}

function validateBiometricProviderConfig(providerKey, payload = {}) {
  switch (providerKey) {
    case "aws_rekognition":
      if (!String(payload.access_key_id || "").trim()) {
        return "AWS access key ID is required";
      }
      if (!String(payload.secret_access_key || "").trim()) {
        return "AWS secret access key is required";
      }
      return null;
    default:
      return "Unsupported biometric provider";
  }
}

async function buildTenantStats(tenantId) {
  const [
    membershipSummary,
    studentSummary,
    collegeCount,
    sessionSummary,
    candidateCount,
    voteSummary,
  ] = await Promise.all([
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
    sessions: sessionSummary[0] || {
      total: 0,
      active: 0,
      upcoming: 0,
      ended: 0,
    },
    candidates: candidateCount,
    votes: voteSummary[0] || { total: 0, accepted: 0, rejected: 0 },
  };
}

class PlatformController {
  async getBiometricMetrics(req, res) {
    try {
      const tenantId = req.query.tenant_id || null;
      const tenant = tenantId ? await Tenant.findById(tenantId).lean() : null;
      const tenantScopedReq = {
        ...req,
        tenantId,
        tenant,
      };
      const metrics = await getVerificationMetrics(tenantScopedReq, req.query || {});

      res.json({
        tenant: tenant
          ? {
              id: tenant._id,
              name: tenant.name,
              slug: tenant.slug,
            }
          : null,
        metrics,
      });
    } catch (error) {
      console.error("Get platform biometric metrics error:", error);
      res.status(500).json({ error: "Failed to get biometric metrics" });
    }
  }

  async getVerificationLogs(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page || 1, 10), 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit || 25, 10), 1), 100);
      const filter = {};

      if (req.query.tenant_id) {
        filter.tenant_id = req.query.tenant_id;
      }
      if (req.query.session_id) {
        filter.session_id = req.query.session_id;
      }
      if (req.query.result) {
        filter.result = req.query.result;
      }
      if (req.query.failure_reason) {
        filter.failure_reason = req.query.failure_reason;
      }
      if (req.query.start_date || req.query.end_date) {
        filter.timestamp = {};
        if (req.query.start_date) {
          filter.timestamp.$gte = new Date(req.query.start_date);
        }
        if (req.query.end_date) {
          filter.timestamp.$lte = new Date(req.query.end_date);
        }
      }

      const [logs, total] = await Promise.all([
        VerificationLog.find(filter)
          .populate("tenant_id", "name slug")
          .populate("user_id", "full_name matric_no email")
          .populate("session_id", "title status")
          .populate("reviewed_by", "full_name email")
          .sort({ timestamp: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        VerificationLog.countDocuments(filter),
      ]);

      res.json({
        logs: logs.map(serializePlatformVerificationLog),
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get platform verification logs error:", error);
      res.status(500).json({ error: "Failed to get verification logs" });
    }
  }

  async getOverview(_req, res) {
    try {
      const [
        totalTenants,
        activeTenants,
        suspendedTenants,
        totalTenantAdmins,
      ] = await Promise.all([
        Tenant.countDocuments({}),
        Tenant.countDocuments({ status: "active", is_active: true }),
        Tenant.countDocuments({ status: "suspended" }),
        TenantAdminMembership.countDocuments({ is_active: true }),
      ]);

      res.json({
        overview: {
          total_tenants: totalTenants,
          active_tenants: activeTenants,
          suspended_tenants: suspendedTenants,
          grace_period_tenants: 0,
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
      const filter = {};

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { slug: { $regex: search, $options: "i" } },
          { primary_domain: { $regex: search, $options: "i" } },
        ];
      }

      if (status) filter.status = status;
      const [tenants, total] = await Promise.all([
        Tenant.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
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
        contact_name,
        contact_email,
        owner_admin_id,
      } = req.body;

      const normalizedSlug = String(slug).trim().toLowerCase();
      const existingTenant = await Tenant.findOne({
        $or: [
          { slug: normalizedSlug },
          ...(primary_domain
            ? [{ primary_domain: primary_domain.toLowerCase() }]
            : []),
        ],
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
        primary_domain: primary_domain
          ? String(primary_domain).trim().toLowerCase()
          : null,
        plan_code: "university",
        status: "pending_approval",
        onboarding: {
          contact_name: contact_name ? String(contact_name).trim() : null,
          contact_email: contact_email
            ? String(contact_email).trim().toLowerCase()
            : null,
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

      const adminMap = new Map(
        admins.map((admin) => [admin._id.toString(), admin]),
      );
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
        status,
        is_active,
        rejection_reason,
      } = req.body;

      const tenant = await Tenant.findById(id);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      const previousStatus = tenant.status;
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

      tenant.plan_code = "university";
      if (status !== undefined) tenant.status = status;
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
        tenant.onboarding.activated_at =
          tenant.status === "draft" ? null : tenant.onboarding.activated_at;
      }

      if (tenant.status === "draft" && previousStatus !== "draft") {
        tenant.onboarding.rejected_at = new Date();
      }

      await tenant.save();

      if (
        tenant.onboarding?.contact_email &&
        previousStatus !== tenant.status
      ) {
        let notificationPromise = null;

        if (tenant.status === "active" && previousStatus !== "active") {
          notificationPromise = emailService.sendTenantApplicationApproved({
            to: tenant.onboarding.contact_email,
            contactName: tenant.onboarding.contact_name,
            tenantName: tenant.name,
            applicationReference: tenant.application_reference || null,
            tenantDomain: tenant.primary_domain || null,
          });
        } else if (tenant.status === "draft" && previousStatus !== "draft") {
          notificationPromise = emailService.sendTenantApplicationRejected({
            to: tenant.onboarding.contact_email,
            contactName: tenant.onboarding.contact_name,
            tenantName: tenant.name,
            applicationReference: tenant.application_reference || null,
            reason: tenant.onboarding.rejection_reason || null,
          });
        } else {
          notificationPromise = emailService.sendTenantStatusUpdate({
            to: tenant.onboarding.contact_email,
            contactName: tenant.onboarding.contact_name,
            tenantName: tenant.name,
            status: tenant.status,
            message: `Your workspace is currently ${tenant.status.replace(/_/g, " ")} and is being provisioned.`,
            tenantDomain: tenant.primary_domain || null,
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

  async getPlatformSettings(_req, res) {
    try {
      const platformSetting = await getOrCreatePlatformSetting();
      res.json({
        defaults: platformSetting.defaults || cloneDefaultTenantSettings(),
        identity_catalog:
          platformSetting.identity_catalog || getTenantSettingsCatalog(),
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
          active_provider:
            nextBiometrics.active_provider ||
            platformSetting.biometrics?.active_provider ||
            "aws_rekognition",
          providers: nextProviders,
        };
      }

      await platformSetting.save();

      res.json({
        message: "Platform settings updated successfully",
        defaults: platformSetting.defaults,
        identity_catalog: platformSetting.identity_catalog,
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
        return res
          .status(400)
          .json({ error: "Valid provider_key is required" });
      }

      const validationError = validateBiometricProviderConfig(
        provider_key,
        config,
      );
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
            : platformSetting.biometrics?.active_provider || "aws_rekognition",
        providers: nextProviders,
      };

      await platformSetting.save();

      return res.status(201).json({
        message: `${providerCatalog[provider_key].label} provider created successfully`,
        biometrics: await faceProviderService.getSettingsSummary(),
      });
    } catch (error) {
      console.error("Create biometric provider error:", error);
      return res
        .status(500)
        .json({ error: "Failed to create biometric provider" });
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
            ? "aws_rekognition"
            : platformSetting.biometrics?.active_provider || "aws_rekognition",
        providers: nextProviders,
      };

      await platformSetting.save();

      return res.json({
        message: `${providerCatalog[providerKey].label} provider removed successfully`,
        biometrics: await faceProviderService.getSettingsSummary(),
      });
    } catch (error) {
      console.error("Delete biometric provider error:", error);
      return res
        .status(500)
        .json({ error: "Failed to delete biometric provider" });
    }
  }

  async testBiometricProvider(req, res) {
    try {
      const { image_url } = req.body;
      const provider_key = "aws_rekognition";
      if (!image_url) {
        return res.status(400).json({ error: "Image URL is required" });
      }

      const providerCatalog = faceProviderService.getProviderCatalog();
      if (provider_key && !providerCatalog[provider_key]) {
        return res.status(400).json({ error: "Invalid provider_key supplied" });
      }

      const result = await faceProviderService.testConnectionForProvider(
        provider_key,
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
            })
            .catch((err) => {
              console.error(
                "Failed to send biometric provider alert email:",
                err,
              );
            });
        }
        return res.status(400).json({
          error: result.error || "Biometric provider test failed",
          code: result.code || "BIOMETRIC_PROVIDER_TEST_FAILED",
          provider: result.provider || "aws_rekognition",
          provider_status: await faceProviderService.getStatus(
            provider_key,
          ),
          requirements:
            provider_key && providerCatalog[provider_key]
              ? providerCatalog[provider_key].requirements
              : undefined,
        });
      }

      return res.json({
        message: "Biometric provider test completed successfully",
        provider: result.provider || "aws_rekognition",
        provider_status: await faceProviderService.getStatus(
          provider_key,
        ),
        summary: {
          detection: result.success ? "Face detected" : "No face detected",
          image_checked: image_url,
        },
        result: {
          face_count: result.face_count || 0,
          quality: result.quality || null,
        },
        provider_response: {
          success: Boolean(result.success),
          provider: result.provider || "aws_rekognition",
          readiness: result.readiness || null,
        },
      });
    } catch (error) {
      console.error("Test biometric provider error:", error);
      return res
        .status(500)
        .json({ error: "Failed to test biometric provider" });
    }
  }
}

module.exports = new PlatformController();
