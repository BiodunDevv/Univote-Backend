const Tenant = require("../models/Tenant");
const Admin = require("../models/Admin");
const Student = require("../models/Student");
const Vote = require("../models/Vote");
const Testimonial = require("../models/Testimonial");
const { randomBytes } = require("crypto");
const { serializeTestimonial } = require("../utils/testimonials");
const {
  getTenantIdentityMetadata,
  getTenantSettings,
} = require("../utils/tenantSettings");
const emailService = require("../services/emailService");
const cacheService = require("../services/cacheService");

function getDefaultUniversityStructure() {
  return {
    uses_college: true,
    uses_department: true,
    uses_level: true,
    requires_photo: true,
    requires_face_verification: true,
  };
}

function getMandatoryVerificationSettings() {
  return {
    auth: {
      require_email: true,
      require_photo: true,
      require_face_verification: true,
    },
    features: {
      face_verification: true,
    },
    voting: {
      require_face_verification: true,
    },
    participant_fields: {
      face_verification: {
        enabled: true,
        required: true,
        show_in_profile: false,
        show_in_filters: true,
        allow_in_eligibility: false,
      },
    },
  };
}

function buildTenantApplicationPayload(body) {
  return {
    institution_name: String(body.institution_name || body.name || "").trim(),
    slug: String(body.slug || "")
      .trim()
      .toLowerCase(),
    primary_domain: body.primary_domain
      ? String(body.primary_domain).trim().toLowerCase()
      : null,
    contact_name: String(body.contact_name || "").trim(),
    contact_email: String(body.contact_email || "")
      .trim()
      .toLowerCase(),
    contact_phone: body.contact_phone
      ? String(body.contact_phone).trim()
      : null,
    institution_type: "university",
    student_count_estimate:
      body.student_count_estimate !== undefined &&
      body.student_count_estimate !== null
        ? Number(body.student_count_estimate)
        : null,
    admin_count_estimate:
      body.admin_count_estimate !== undefined &&
      body.admin_count_estimate !== null
        ? Number(body.admin_count_estimate)
        : null,
    notes: body.notes ? String(body.notes).trim() : null,
    demo_requested: Boolean(body.demo_requested),
  };
}

function createApplicationReference() {
  return `APP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(
    3,
  )
    .toString("hex")
    .toUpperCase()}`;
}

function appendStatusTimeline(tenant, status, label, note = null) {
  if (!tenant.onboarding) {
    tenant.onboarding = {};
  }

  const timeline = Array.isArray(tenant.onboarding.status_timeline)
    ? tenant.onboarding.status_timeline
    : [];

  timeline.push({
    status,
    label,
    note,
    at: new Date(),
  });

  tenant.onboarding.status_timeline = timeline;
}

function serializeApplication(tenant) {
  return {
    id: tenant._id,
    reference: tenant.application_reference,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    contact_email: tenant.onboarding?.contact_email || null,
    status_timeline: tenant.onboarding?.status_timeline || [],
    application_submitted_at:
      tenant.onboarding?.application_submitted_at || tenant.createdAt,
    application_last_updated_at:
      tenant.onboarding?.application_last_updated_at || tenant.updatedAt,
    approved_at: tenant.onboarding?.approved_at || null,
    rejected_at: tenant.onboarding?.rejected_at || null,
    rejection_reason: tenant.onboarding?.rejection_reason || null,
  };
}

function applyApplicationPayloadToTenant(tenant, payload) {
  tenant.name = payload.institution_name;
  tenant.slug = payload.slug;
  tenant.primary_domain = payload.primary_domain;
  tenant.onboarding.contact_name = payload.contact_name;
  tenant.onboarding.contact_email = payload.contact_email;
  tenant.onboarding.contact_phone = payload.contact_phone;
  tenant.onboarding.institution_type = payload.institution_type;
  tenant.onboarding.student_count_estimate = payload.student_count_estimate;
  tenant.onboarding.admin_count_estimate = payload.admin_count_estimate;
  tenant.onboarding.notes = payload.notes;
  tenant.onboarding.demo_requested = payload.demo_requested;
  tenant.onboarding.application_last_updated_at = new Date();
  tenant.onboarding.structure_preferences = getDefaultUniversityStructure();
  tenant.onboarding.identity_preferences = null;
}

class PublicController {
  async listOrganizations(req, res) {
    try {
      const search = String(req.query.search || "").trim();
      const cacheKey = `public:organizations:${search.toLowerCase() || "all"}`;
      const cached = await cacheService.get(cacheKey);

      if (cached) {
        return res.json({
          ...cached,
          cached: true,
        });
      }

      const filter = {
        status: "active",
        is_active: true,
      };

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { slug: { $regex: search, $options: "i" } },
        ];
      }

      const tenants = await Tenant.find(filter)
        .select("_id name slug primary_domain branding settings")
        .sort({ name: 1 })
        .limit(30)
        .lean();

      const payload = {
        organizations: tenants.map((tenant) => {
          const settings = getTenantSettings(tenant);
          return {
            id: tenant._id,
            name: tenant.name,
            slug: tenant.slug,
            primary_domain: tenant.primary_domain || null,
            branding: tenant.branding || {},
            labels: settings.labels,
            identity: getTenantIdentityMetadata(tenant),
          };
        }),
      };

      await cacheService.set(cacheKey, payload, search ? 120 : 300);

      return res.json({
        ...payload,
        cached: false,
      });
    } catch (error) {
      console.error("List public organizations error:", error);
      return res.status(500).json({ error: "Failed to fetch organizations" });
    }
  }

  async getOrganizationBySlug(req, res) {
    try {
      const slug = String(req.params.slug || "")
        .trim()
        .toLowerCase();
      const cacheKey = `public:organization:${slug}`;
      const cached = await cacheService.get(cacheKey);

      if (cached) {
        return res.json({
          ...cached,
          cached: true,
        });
      }

      const tenant = await Tenant.findOne({
        slug,
        status: "active",
        is_active: true,
      })
        .select("_id name slug primary_domain branding settings")
        .lean();

      if (!tenant) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const settings = getTenantSettings(tenant);
      const payload = {
        organization: {
          id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
          primary_domain: tenant.primary_domain || null,
          branding: tenant.branding || {},
          labels: settings.labels,
          identity: getTenantIdentityMetadata(tenant),
        },
      };

      await cacheService.set(cacheKey, payload, 300);

      return res.json({
        ...payload,
        cached: false,
      });
    } catch (error) {
      console.error("Get public organization error:", error);
      return res.status(500).json({ error: "Failed to fetch organization" });
    }
  }

  async getLandingData(_req, res) {
    try {
      const cacheKey = "public:landing";
      const cached = await cacheService.get(cacheKey);

      if (cached) {
        return res.json({
          ...cached,
          cached: true,
        });
      }

      const [testimonials, activeTenants, activeStudents, acceptedVotes] =
        await Promise.all([
          Testimonial.find({ status: "published" })
            .sort({
              highlighted: -1,
              sort_order: 1,
              published_at: -1,
              createdAt: -1,
            })
            .limit(8)
            .lean(),
          Tenant.countDocuments({ status: "active", is_active: true }),
          Student.countDocuments({ is_active: true }),
          Vote.countDocuments({ status: "accepted" }),
        ]);
      const payload = {
        stats: {
          active_tenants: activeTenants,
          active_students: activeStudents,
          accepted_votes: acceptedVotes,
        },
        testimonials: testimonials.map(serializeTestimonial),
      };

      await cacheService.set(cacheKey, payload, 300);

      return res.json({
        ...payload,
        cached: false,
      });
    } catch (error) {
      console.error("Get public landing data error:", error);
      return res.status(500).json({ error: "Failed to fetch landing data" });
    }
  }

  async listTestimonials(_req, res) {
    try {
      const cacheKey = "public:testimonials";
      const cached = await cacheService.get(cacheKey);

      if (cached) {
        return res.json({
          ...cached,
          cached: true,
        });
      }

      const testimonials = await Testimonial.find({ status: "published" })
        .sort({
          highlighted: -1,
          sort_order: 1,
          published_at: -1,
          createdAt: -1,
        })
        .limit(24)
        .lean();

      const payload = {
        testimonials: testimonials.map(serializeTestimonial),
      };

      await cacheService.set(cacheKey, payload, 600);

      return res.json({
        ...payload,
        cached: false,
      });
    } catch (error) {
      console.error("List public testimonials error:", error);
      return res.status(500).json({ error: "Failed to fetch testimonials" });
    }
  }

  async submitTenantApplication(req, res) {
    try {
      const payload = buildTenantApplicationPayload(req.body);
      const submit = req.body.submit !== false;

      const existingTenant = await Tenant.findOne({
        $or: [
          { slug: payload.slug },
          ...(payload.primary_domain
            ? [{ primary_domain: payload.primary_domain }]
            : []),
          { "onboarding.contact_email": payload.contact_email },
        ],
      }).select("_id slug status onboarding.contact_email");

      if (existingTenant) {
        return res.status(409).json({
          error:
            "A tenant application with this slug, domain, or contact email already exists",
        });
      }

      const now = new Date();
      const tenant = await Tenant.create({
        name: payload.institution_name,
        slug: payload.slug,
        application_reference: createApplicationReference(),
        primary_domain: payload.primary_domain,
        plan_code: "university",
        status: submit ? "pending_approval" : "draft",
        is_active: true,
        settings: getMandatoryVerificationSettings(),
        onboarding: {
          contact_name: payload.contact_name,
          contact_email: payload.contact_email,
          contact_phone: payload.contact_phone,
          institution_type: payload.institution_type,
          student_count_estimate: payload.student_count_estimate,
          admin_count_estimate: payload.admin_count_estimate,
          notes: payload.notes,
          demo_requested: payload.demo_requested,
          application_submitted_at: submit ? now : null,
          application_last_updated_at: now,
          structure_preferences: getDefaultUniversityStructure(),
          identity_preferences: null,
        },
      });
      appendStatusTimeline(
        tenant,
        tenant.status,
        submit ? "Application submitted" : "Draft created",
      );
      await tenant.save();

      if (!submit) {
        return res.status(201).json({
          message: "Application draft saved",
          application: serializeApplication(tenant),
        });
      }

      appendStatusTimeline(tenant, "pending_approval", "Waiting for approval");
      await tenant.save();

      emailService
        .sendTenantApplicationSubmitted({
          to: payload.contact_email,
          contactName: payload.contact_name,
          tenantName: tenant.name,
          applicationReference: tenant.application_reference,
        })
        .catch((err) => {
          console.error("Failed to send tenant application email:", err);
        });

      const superAdmins = await Admin.find({
        role: "super_admin",
        is_active: true,
      })
        .select("email full_name")
        .lean();

      await Promise.all(
        superAdmins.map((admin) =>
          emailService
            .sendTenantApplicationSubmitted({
              to: admin.email,
              contactName: admin.full_name,
              tenantName: tenant.name,
              applicationReference: tenant.application_reference,
              recipientType: "platform_admin",
            })
            .catch((err) => {
              console.error(
                "Failed to notify platform admin about tenant application:",
                err,
              );
            }),
        ),
      );

      return res.status(201).json({
        message: "Tenant application submitted successfully",
        application: serializeApplication(tenant),
      });
    } catch (error) {
      console.error("Submit tenant application error:", error);
      return res
        .status(500)
        .json({ error: "Failed to submit tenant application" });
    }
  }

  async updateTenantApplication(req, res) {
    try {
      const reference = String(req.params.reference || "")
        .trim()
        .toUpperCase();
      const submit = Boolean(req.body.submit);
      const payload = buildTenantApplicationPayload(req.body);
      const tenant = await Tenant.findOne({ application_reference: reference });

      if (!tenant) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (tenant.status === "active" || tenant.status === "suspended") {
        return res
          .status(400)
          .json({ error: "This application can no longer be edited" });
      }

      const existingConflict = await Tenant.findOne({
        _id: { $ne: tenant._id },
        $or: [
          { slug: payload.slug },
          ...(payload.primary_domain
            ? [{ primary_domain: payload.primary_domain }]
            : []),
        ],
      }).select("_id");

      if (existingConflict) {
        return res.status(409).json({
          error: "Another application already uses that slug or domain",
        });
      }

      applyApplicationPayloadToTenant(tenant, payload);
      tenant.settings = {
        ...(tenant.settings || {}),
        ...getMandatoryVerificationSettings(),
      };

      if (!submit) {
        if (tenant.status !== "draft") {
          tenant.status = "draft";
        }
        appendStatusTimeline(tenant, tenant.status, "Draft updated");
        await tenant.save();

        return res.json({
          message: "Application updated",
          application: serializeApplication(tenant),
        });
      }

      tenant.status = "pending_approval";
      tenant.onboarding.application_submitted_at =
        tenant.onboarding.application_submitted_at || new Date();
      appendStatusTimeline(tenant, "pending_approval", "Application submitted");
      await tenant.save();

      return res.json({
        message: "Application submitted successfully",
        application: serializeApplication(tenant),
      });
    } catch (error) {
      console.error("Update tenant application error:", error);
      return res
        .status(500)
        .json({ error: "Failed to update tenant application" });
    }
  }

  async getTenantApplicationStatus(req, res) {
    try {
      const reference = String(req.query.reference || "")
        .trim()
        .toUpperCase();
      const email = String(
        req.query.email ||
          req.query.contact_email ||
          req.query.work_email ||
          req.query.primary_email ||
          "",
      )
        .trim()
        .toLowerCase();

      if (!email) {
        return res.status(400).json({ error: "email is required" });
      }

      const filter = {
        "onboarding.contact_email": email,
      };

      if (reference) {
        filter.application_reference = reference;
      }

      const tenant = await Tenant.findOne(filter)
        .sort({ "onboarding.application_last_updated_at": -1, updatedAt: -1 })
        .lean();

      if (!tenant) {
        return res.status(404).json({ error: "Application not found" });
      }

      const nextActions = [];

      if (tenant.status === "pending_approval") {
        nextActions.push({
          key: "review",
          label: "Await platform approval",
          href: "/application-status",
        });
      }

      if (tenant.status === "draft") {
        nextActions.push({
          key: "update",
          label: "Review draft application",
          href: `/application-status?reference=${encodeURIComponent(
            tenant.application_reference || "",
          )}&email=${encodeURIComponent(email)}`,
        });
      }

      if (tenant.status === "active") {
        nextActions.push({
          key: "homepage",
          label: "Return to homepage",
          href: "/",
        });
      }

      return res.json({
        application: serializeApplication(tenant),
        next_actions: nextActions,
      });
    } catch (error) {
      console.error("Get tenant application status error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch application status" });
    }
  }

  async submitTestimonial(req, res) {
    try {
      const testimonial = await Testimonial.create({
        tenant_id: req.body.tenant_id || null,
        author_name: String(req.body.author_name || "").trim(),
        author_role: String(req.body.author_role || "").trim(),
        institution_name: String(req.body.institution_name || "").trim(),
        quote: String(req.body.quote || "").trim(),
        avatar_url: req.body.avatar_url
          ? String(req.body.avatar_url).trim()
          : null,
        rating: Number(req.body.rating || 5),
        source: req.body.source === "tenant" ? "tenant" : "public",
        status: "pending_review",
      });

      const superAdmins = await Admin.find({
        role: "super_admin",
        is_active: true,
      })
        .select("email full_name")
        .lean();

      await Promise.all(
        superAdmins.map((admin) =>
          emailService
            .sendAnnouncementEmail({
              to: admin.email,
              recipientName: admin.full_name,
              title: "New testimonial submission awaiting moderation",
              body: `${testimonial.author_name} submitted a testimonial for ${testimonial.institution_name}.`,
              roleLabel: "Platform",
            })
            .catch((err) => {
              console.error(
                "Failed to notify super admin about testimonial submission:",
                err,
              );
            }),
        ),
      );

      return res.status(201).json({
        message: "Testimonial submitted successfully",
        testimonial: serializeTestimonial(testimonial),
      });
    } catch (error) {
      console.error("Submit testimonial error:", error);
      return res.status(500).json({ error: "Failed to submit testimonial" });
    }
  }
}

module.exports = new PublicController();
