const Tenant = require("../models/Tenant");
const Admin = require("../models/Admin");
const Student = require("../models/Student");
const Vote = require("../models/Vote");
const Testimonial = require("../models/Testimonial");
const { serializePlanCatalog } = require("../config/billingPlans");
const {
  requestPlanCheckout,
  serializeInvoice,
} = require("../services/subscriptionService");
const { serializeTestimonial } = require("../utils/testimonials");
const {
  getTenantIdentityMetadata,
  getTenantSettings,
} = require("../utils/tenantSettings");
const emailService = require("../services/emailService");

function buildTenantApplicationPayload(body) {
  return {
    institution_name: String(body.institution_name || body.name || "").trim(),
    slug: String(body.slug || "")
      .trim()
      .toLowerCase(),
    primary_domain: body.primary_domain
      ? String(body.primary_domain).trim().toLowerCase()
      : null,
    plan_code: body.plan_code || "pro",
    contact_name: String(body.contact_name || "").trim(),
    contact_email: String(body.contact_email || "")
      .trim()
      .toLowerCase(),
    contact_phone: body.contact_phone ? String(body.contact_phone).trim() : null,
    institution_type: body.institution_type || "university",
    student_count_estimate:
      body.student_count_estimate !== undefined && body.student_count_estimate !== null
        ? Number(body.student_count_estimate)
        : null,
    admin_count_estimate:
      body.admin_count_estimate !== undefined && body.admin_count_estimate !== null
        ? Number(body.admin_count_estimate)
        : null,
    notes: body.notes ? String(body.notes).trim() : null,
    demo_requested: Boolean(body.demo_requested),
  };
}

class PublicController {
  async listOrganizations(req, res) {
    try {
      const search = String(req.query.search || "").trim();
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
        .select(
          "_id name slug primary_domain branding status subscription_status settings",
        )
        .sort({ name: 1 })
        .limit(30)
        .lean();

      return res.json({
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
      });
    } catch (error) {
      console.error("List public organizations error:", error);
      return res.status(500).json({ error: "Failed to fetch organizations" });
    }
  }

  async getOrganizationBySlug(req, res) {
    try {
      const tenant = await Tenant.findOne({
        slug: String(req.params.slug || "").trim().toLowerCase(),
        status: "active",
        is_active: true,
      })
        .select(
          "_id name slug primary_domain branding status subscription_status settings",
        )
        .lean();

      if (!tenant) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const settings = getTenantSettings(tenant);
      return res.json({
        organization: {
          id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
          primary_domain: tenant.primary_domain || null,
          branding: tenant.branding || {},
          labels: settings.labels,
          identity: getTenantIdentityMetadata(tenant),
        },
      });
    } catch (error) {
      console.error("Get public organization error:", error);
      return res.status(500).json({ error: "Failed to fetch organization" });
    }
  }

  async getLandingData(_req, res) {
    try {
      const [plans, testimonials, activeTenants, activeStudents, acceptedVotes] =
        await Promise.all([
          Promise.resolve(serializePlanCatalog()),
          Testimonial.find({ status: "published" })
            .sort({ highlighted: -1, sort_order: 1, published_at: -1, createdAt: -1 })
            .limit(8)
            .lean(),
          Tenant.countDocuments({ status: "active", is_active: true }),
          Student.countDocuments({ is_active: true }),
          Vote.countDocuments({ status: "accepted" }),
        ]);

      return res.json({
        stats: {
          active_tenants: activeTenants,
          active_students: activeStudents,
          accepted_votes: acceptedVotes,
        },
        plans,
        testimonials: testimonials.map(serializeTestimonial),
      });
    } catch (error) {
      console.error("Get public landing data error:", error);
      return res.status(500).json({ error: "Failed to fetch landing data" });
    }
  }

  async listTestimonials(_req, res) {
    try {
      const testimonials = await Testimonial.find({ status: "published" })
        .sort({ highlighted: -1, sort_order: 1, published_at: -1, createdAt: -1 })
        .limit(24)
        .lean();

      return res.json({
        testimonials: testimonials.map(serializeTestimonial),
      });
    } catch (error) {
      console.error("List public testimonials error:", error);
      return res.status(500).json({ error: "Failed to fetch testimonials" });
    }
  }

  async submitTenantApplication(req, res) {
    try {
      const payload = buildTenantApplicationPayload(req.body);

      const existingTenant = await Tenant.findOne({
        $or: [
          { slug: payload.slug },
          ...(payload.primary_domain ? [{ primary_domain: payload.primary_domain }] : []),
          { "onboarding.contact_email": payload.contact_email },
        ],
      }).select("_id slug status onboarding.contact_email");

      if (existingTenant) {
        return res.status(409).json({
          error: "A tenant application with this slug, domain, or contact email already exists",
        });
      }

      const now = new Date();
      const tenant = await Tenant.create({
        name: payload.institution_name,
        slug: payload.slug,
        primary_domain: payload.primary_domain,
        plan_code: payload.plan_code,
        status: "pending_payment",
        subscription_status: "trial",
        is_active: true,
        billing: {
          billing_cycle: "monthly",
          currency: "NGN",
        },
        onboarding: {
          contact_name: payload.contact_name,
          contact_email: payload.contact_email,
          contact_phone: payload.contact_phone,
          institution_type: payload.institution_type,
          student_count_estimate: payload.student_count_estimate,
          admin_count_estimate: payload.admin_count_estimate,
          notes: payload.notes,
          demo_requested: payload.demo_requested,
          application_submitted_at: now,
        },
      });

      const checkout = await requestPlanCheckout({
        tenant,
        targetPlanCode: tenant.plan_code,
        actorAdminId: null,
      });

      const refreshedTenant = await Tenant.findById(tenant._id);
      const applicationTenant = refreshedTenant || tenant;
      const checkoutUrl =
        checkout.checkout_url || checkout.invoice?.provider_checkout_url || null;
      const nextSteps =
        checkout.action === "checkout_required"
          ? [
              "Complete payment to move this application out of pending payment.",
              "Univote reviews the tenant after payment confirmation.",
              "Provisioning continues once the tenant moves from pending approval to active.",
            ]
          : [
              "The application moved into the review queue.",
              "The Univote team will validate the tenant profile and rollout details.",
              "Provisioning continues once the tenant moves from pending approval to active.",
            ];

      emailService
        .sendTenantApplicationSubmitted({
          to: payload.contact_email,
          contactName: payload.contact_name,
          tenantName: applicationTenant.name,
          planCode: applicationTenant.plan_code,
          checkoutUrl,
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
              tenantName: applicationTenant.name,
              planCode: applicationTenant.plan_code,
              checkoutUrl,
              recipientType: "platform_admin",
            })
            .catch((err) => {
              console.error("Failed to notify platform admin about tenant application:", err);
            }),
        ),
      );

      return res.status(201).json({
        message: checkout.message || "Tenant application submitted successfully",
        action: checkout.action,
        checkout_url: checkoutUrl,
        invoice: checkout.invoice ? serializeInvoice(checkout.invoice) : null,
        next_steps: nextSteps,
        application: {
          id: applicationTenant._id,
          name: applicationTenant.name,
          slug: applicationTenant.slug,
          status: applicationTenant.status,
          plan_code: applicationTenant.plan_code,
          subscription_status: applicationTenant.subscription_status,
          contact_email: applicationTenant.onboarding?.contact_email || null,
          application_submitted_at:
            applicationTenant.onboarding?.application_submitted_at || now,
        },
      });
    } catch (error) {
      console.error("Submit tenant application error:", error);
      return res.status(500).json({ error: "Failed to submit tenant application" });
    }
  }
}

module.exports = new PublicController();
