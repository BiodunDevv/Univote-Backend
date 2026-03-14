const Admin = require("../models/Admin");
const Tenant = require("../models/Tenant");
const TenantAdminMembership = require("../models/TenantAdminMembership");
const Student = require("../models/Student");
const College = require("../models/College");
const VotingSession = require("../models/VotingSession");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const PlatformSetting = require("../models/PlatformSetting");
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
        plan_code,
        status,
        subscription_status,
        is_active,
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

      if (plan_code !== undefined) tenant.plan_code = plan_code;
      if (status !== undefined) tenant.status = status;
      if (subscription_status !== undefined) {
        tenant.subscription_status = subscription_status;
      }
      if (is_active !== undefined) tenant.is_active = Boolean(is_active);

      if (tenant.status === "active" && !tenant.onboarding.activated_at) {
        tenant.onboarding.activated_at = new Date();
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
        emailService
          .sendTenantStatusUpdate({
            to: tenant.onboarding.contact_email,
            contactName: tenant.onboarding.contact_name,
            tenantName: tenant.name,
            status: tenant.status,
            message: `Your workspace is currently ${tenant.status.replace(/_/g, " ")} on the ${tenant.plan_code} plan with subscription status ${tenant.subscription_status}.`,
            ctaLabel: tenant.status === "active" ? "Open workspace" : null,
            ctaLink: tenant.primary_domain
              ? `https://${tenant.primary_domain}`
              : `${process.env.PUBLIC_APP_URL || "http://localhost:3000"}`,
          })
          .catch((err) => {
            console.error("Failed to send tenant status update email:", err);
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
        const currentFacepp = currentProviders.facepp || {};
        const currentAws = currentProviders.aws_rekognition || {};
        const currentAzure = currentProviders.azure_face || {};
        const currentGoogle = currentProviders.google_vision || {};
        const facepp = incomingProviders.facepp || {};
        const awsRekognition = incomingProviders.aws_rekognition || {};
        const azureFace = incomingProviders.azure_face || {};
        const googleVision = incomingProviders.google_vision || {};

        platformSetting.biometrics = {
          active_provider: nextBiometrics.active_provider || platformSetting.biometrics?.active_provider || "facepp",
          providers: {
            ...currentProviders,
            facepp: {
              ...currentFacepp,
              enabled: facepp.enabled !== undefined ? Boolean(facepp.enabled) : currentFacepp.enabled !== false,
              api_key:
                facepp.api_key !== undefined && facepp.api_key !== ""
                  ? String(facepp.api_key).trim()
                  : currentFacepp.api_key || null,
              api_secret:
                facepp.api_secret !== undefined && facepp.api_secret !== ""
                  ? String(facepp.api_secret).trim()
                  : currentFacepp.api_secret || null,
              base_url:
                facepp.base_url !== undefined && facepp.base_url !== ""
                  ? String(facepp.base_url).trim()
                  : currentFacepp.base_url || "https://api-us.faceplusplus.com/facepp/v3",
              confidence_threshold:
                facepp.confidence_threshold !== undefined
                  ? Number(facepp.confidence_threshold)
                  : currentFacepp.confidence_threshold || 80,
            },
            aws_rekognition: {
              ...currentAws,
              enabled:
                awsRekognition.enabled !== undefined
                  ? Boolean(awsRekognition.enabled)
                  : Boolean(currentAws.enabled),
              region:
                awsRekognition.region !== undefined && awsRekognition.region !== ""
                  ? String(awsRekognition.region).trim()
                  : currentAws.region || "us-east-1",
              access_key_id:
                awsRekognition.access_key_id !== undefined &&
                awsRekognition.access_key_id !== ""
                  ? String(awsRekognition.access_key_id).trim()
                  : currentAws.access_key_id || null,
              secret_access_key:
                awsRekognition.secret_access_key !== undefined &&
                awsRekognition.secret_access_key !== ""
                  ? String(awsRekognition.secret_access_key).trim()
                  : currentAws.secret_access_key || null,
              similarity_threshold:
                awsRekognition.similarity_threshold !== undefined
                  ? Number(awsRekognition.similarity_threshold)
                  : currentAws.similarity_threshold || 90,
            },
            azure_face: {
              ...currentAzure,
              enabled:
                azureFace.enabled !== undefined
                  ? Boolean(azureFace.enabled)
                  : Boolean(currentAzure.enabled),
              endpoint:
                azureFace.endpoint !== undefined && azureFace.endpoint !== ""
                  ? String(azureFace.endpoint).trim()
                  : currentAzure.endpoint || null,
              api_key:
                azureFace.api_key !== undefined && azureFace.api_key !== ""
                  ? String(azureFace.api_key).trim()
                  : currentAzure.api_key || null,
              confidence_threshold:
                azureFace.confidence_threshold !== undefined
                  ? Number(azureFace.confidence_threshold)
                  : currentAzure.confidence_threshold || 80,
            },
            google_vision: {
              ...currentGoogle,
              enabled:
                googleVision.enabled !== undefined
                  ? Boolean(googleVision.enabled)
                  : Boolean(currentGoogle.enabled),
              project_id:
                googleVision.project_id !== undefined && googleVision.project_id !== ""
                  ? String(googleVision.project_id).trim()
                  : currentGoogle.project_id || null,
              api_key:
                googleVision.api_key !== undefined && googleVision.api_key !== ""
                  ? String(googleVision.api_key).trim()
                  : currentGoogle.api_key || null,
              confidence_threshold:
                googleVision.confidence_threshold !== undefined
                  ? Number(googleVision.confidence_threshold)
                  : currentGoogle.confidence_threshold || 80,
            },
          },
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

  async testBiometricProvider(req, res) {
    try {
      const { image_url } = req.body;
      if (!image_url) {
        return res.status(400).json({ error: "Image URL is required" });
      }

      const result = await faceProviderService.testConnection(image_url);
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
        });
      }

      return res.json({
        message: "Biometric provider test completed successfully",
        provider: result.provider || "facepp",
        result: {
          face_token: result.face_token ? `${result.face_token.slice(0, 20)}...` : null,
          face_rectangle: result.face_rectangle || null,
          image_id: result.image_id || null,
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
