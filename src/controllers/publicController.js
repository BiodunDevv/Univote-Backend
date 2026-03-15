const Tenant = require("../models/Tenant");
const Admin = require("../models/Admin");
const Student = require("../models/Student");
const Vote = require("../models/Vote");
const Invoice = require("../models/Invoice");
const Coupon = require("../models/Coupon");
const Testimonial = require("../models/Testimonial");
const { randomBytes } = require("crypto");
const { getPlanDefinition, serializePlanCatalog } = require("../config/billingPlans");
const {
  getInvoiceCheckoutResolution,
  requestPlanCheckout,
  serializeInvoice,
} = require("../services/subscriptionService");
const { serializeTestimonial } = require("../utils/testimonials");
const {
  getTenantIdentityMetadata,
  getTenantSettings,
} = require("../utils/tenantSettings");
const emailService = require("../services/emailService");
const cacheService = require("../services/cacheService");

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
    participant_structure: body.participant_structure || null,
    identity_preferences: body.identity_preferences || null,
    coupon_code: body.coupon_code ? String(body.coupon_code).trim().toUpperCase() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    demo_requested: Boolean(body.demo_requested),
  };
}

function createApplicationReference() {
  return `APP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3)
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

async function getLatestTenantInvoice(tenantId) {
  return Invoice.findOne({ tenant_id: tenantId }).sort({ createdAt: -1 });
}

function serializeApplication(tenant, invoice = null) {
  const latestInvoice = invoice || null;
  return {
    id: tenant._id,
    reference: tenant.application_reference,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    plan_code: tenant.plan_code,
    subscription_status: tenant.subscription_status,
    payment_required: tenant.onboarding?.payment_required !== false,
    payment_status: latestInvoice?.status || (tenant.status === "pending_approval" ? "paid" : "pending"),
    contact_email: tenant.onboarding?.contact_email || null,
    coupon_code: tenant.onboarding?.coupon_code || null,
    coupon_snapshot: tenant.onboarding?.coupon_snapshot || null,
    billing_snapshot: tenant.onboarding?.billing_snapshot || null,
    structure_preferences: tenant.onboarding?.structure_preferences || null,
    identity_preferences: tenant.onboarding?.identity_preferences || null,
    status_timeline: tenant.onboarding?.status_timeline || [],
    application_submitted_at: tenant.onboarding?.application_submitted_at || tenant.createdAt,
    application_last_updated_at:
      tenant.onboarding?.application_last_updated_at || tenant.updatedAt,
    approved_at: tenant.onboarding?.approved_at || null,
    rejected_at: tenant.onboarding?.rejected_at || null,
    rejection_reason: tenant.onboarding?.rejection_reason || null,
  };
}

async function validateCouponForPlan(code, planCode, email = null) {
  if (!code) {
    return { valid: false, error: "Coupon code is required" };
  }

  const coupon = await Coupon.findOne({ code: String(code).trim().toUpperCase() });
  if (!coupon || !coupon.is_active) {
    return { valid: false, error: "Coupon is not active" };
  }

  const now = new Date();
  if (coupon.active_from && coupon.active_from > now) {
    return { valid: false, error: "Coupon is not active yet" };
  }

  if (coupon.active_until && coupon.active_until < now) {
    return { valid: false, error: "Coupon has expired" };
  }

  if (coupon.plan_scope === "selected" && !coupon.plan_codes.includes(planCode)) {
    return { valid: false, error: "Coupon does not apply to this plan" };
  }

  if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
    return { valid: false, error: "Coupon usage limit has been reached" };
  }

  if (email && coupon.per_applicant_limit) {
    const applicantUsage = (coupon.redemptions || []).filter(
      (entry) => entry.email && entry.email === email.toLowerCase(),
    ).length;
    if (applicantUsage >= coupon.per_applicant_limit) {
      return { valid: false, error: "Coupon usage limit reached for this applicant" };
    }
  }

  const plan = getPlanDefinition(planCode);
  const baseAmount = plan.monthly_price_ngn;
  if (coupon.minimum_amount_ngn && baseAmount < coupon.minimum_amount_ngn) {
    return { valid: false, error: "Coupon minimum purchase requirement not met" };
  }

  const discountAmount =
    coupon.discount_type === "percentage"
      ? Math.min(baseAmount, Math.round((baseAmount * coupon.discount_value) / 100))
      : Math.min(baseAmount, coupon.discount_value);
  const finalAmount = Math.max(baseAmount - discountAmount, 0);

  return {
    valid: true,
    coupon,
    snapshot: {
      code: coupon.code,
      name: coupon.name,
      description: coupon.description || null,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      discount_amount_ngn: discountAmount,
      original_amount_ngn: baseAmount,
      final_amount_ngn: finalAmount,
      plan_code: planCode,
      applied_at: new Date(),
    },
  };
}

function applyApplicationPayloadToTenant(tenant, payload) {
  tenant.name = payload.institution_name;
  tenant.slug = payload.slug;
  tenant.primary_domain = payload.primary_domain;
  tenant.plan_code = payload.plan_code;
  tenant.onboarding.contact_name = payload.contact_name;
  tenant.onboarding.contact_email = payload.contact_email;
  tenant.onboarding.contact_phone = payload.contact_phone;
  tenant.onboarding.institution_type = payload.institution_type;
  tenant.onboarding.student_count_estimate = payload.student_count_estimate;
  tenant.onboarding.admin_count_estimate = payload.admin_count_estimate;
  tenant.onboarding.notes = payload.notes;
  tenant.onboarding.demo_requested = payload.demo_requested;
  tenant.onboarding.application_last_updated_at = new Date();
  tenant.onboarding.structure_preferences = payload.participant_structure;
  tenant.onboarding.identity_preferences = payload.identity_preferences;
  tenant.onboarding.coupon_code = payload.coupon_code || null;
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
        .select(
          "_id name slug primary_domain branding status subscription_status settings",
        )
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
      const slug = String(req.params.slug || "").trim().toLowerCase();
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
        .select(
          "_id name slug primary_domain branding status subscription_status settings",
        )
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

      const payload = {
        stats: {
          active_tenants: activeTenants,
          active_students: activeStudents,
          accepted_votes: acceptedVotes,
        },
        plans,
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
        .sort({ highlighted: -1, sort_order: 1, published_at: -1, createdAt: -1 })
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
      const couponValidation = payload.coupon_code
        ? await validateCouponForPlan(payload.coupon_code, payload.plan_code, payload.contact_email)
        : null;

      if (couponValidation && !couponValidation.valid) {
        return res.status(400).json({ error: couponValidation.error });
      }

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
        application_reference: createApplicationReference(),
        primary_domain: payload.primary_domain,
        plan_code: payload.plan_code,
        status: submit ? "pending_payment" : "draft",
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
          application_submitted_at: submit ? now : null,
          application_last_updated_at: now,
          payment_required:
            (couponValidation?.snapshot?.final_amount_ngn ??
              getPlanDefinition(payload.plan_code).monthly_price_ngn) > 0,
          coupon_code: payload.coupon_code || null,
          coupon_snapshot: couponValidation?.snapshot || null,
          billing_snapshot: {
            original_amount_ngn: getPlanDefinition(payload.plan_code).monthly_price_ngn,
            payable_amount_ngn:
              couponValidation?.snapshot?.final_amount_ngn ??
              getPlanDefinition(payload.plan_code).monthly_price_ngn,
          },
          structure_preferences: payload.participant_structure,
          identity_preferences: payload.identity_preferences,
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
          action: "draft_saved",
          checkout_url: null,
          invoice: null,
          next_steps: [
            "Continue the application whenever you are ready.",
            "Review the selected plan, participant structure, and billing summary before submission.",
          ],
          application: serializeApplication(tenant),
        });
      }

      const checkout = await requestPlanCheckout({
        tenant,
        targetPlanCode: tenant.plan_code,
        actorAdminId: null,
        metadata: {
          application_reference: tenant.application_reference,
          coupon_code: payload.coupon_code || null,
          coupon_snapshot: couponValidation?.snapshot || null,
        },
        amountNgn:
          couponValidation?.snapshot?.final_amount_ngn ??
          getPlanDefinition(tenant.plan_code).monthly_price_ngn,
      });

      const refreshedTenant = await Tenant.findById(tenant._id);
      const applicationTenant = refreshedTenant || tenant;
      if (checkout.invoice && couponValidation?.coupon) {
        couponValidation.coupon.usage_count += 1;
        couponValidation.coupon.redemptions.push({
          application_reference: applicationTenant.application_reference,
          tenant_id: applicationTenant._id,
          invoice_id: checkout.invoice._id,
          email: payload.contact_email,
          amount_ngn:
            couponValidation.snapshot?.original_amount_ngn ||
            getPlanDefinition(applicationTenant.plan_code).monthly_price_ngn,
          discount_amount_ngn: couponValidation.snapshot?.discount_amount_ngn || 0,
        });
        await couponValidation.coupon.save();
      }
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
      appendStatusTimeline(
        applicationTenant,
        applicationTenant.status,
        checkout.action === "checkout_required"
          ? "Awaiting payment"
          : "Waiting for approval",
      );
      await applicationTenant.save();

      emailService
        .sendTenantApplicationSubmitted({
          to: payload.contact_email,
          contactName: payload.contact_name,
          tenantName: applicationTenant.name,
          planCode: applicationTenant.plan_code,
          checkoutUrl,
          applicationReference: applicationTenant.application_reference,
        })
        .catch((err) => {
          console.error("Failed to send tenant application email:", err);
        });

      if (checkout.action === "checkout_required") {
        emailService
          .sendTenantApplicationPaymentRequired({
            to: payload.contact_email,
            contactName: payload.contact_name,
            tenantName: applicationTenant.name,
            planCode: applicationTenant.plan_code,
            checkoutUrl,
            applicationReference: applicationTenant.application_reference,
            amountLabel:
              checkout.invoice?.amount_ngn !== undefined
                ? `${checkout.invoice.amount_ngn} NGN`
                : null,
          })
          .catch((err) => {
            console.error("Failed to send tenant payment-required email:", err);
          });
      }

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
              applicationReference: applicationTenant.application_reference,
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
        application: serializeApplication(applicationTenant, checkout.invoice || null),
      });
    } catch (error) {
      console.error("Submit tenant application error:", error);
      return res.status(500).json({ error: "Failed to submit tenant application" });
    }
  }

  async updateTenantApplication(req, res) {
    try {
      const reference = String(req.params.reference || "").trim().toUpperCase();
      const submit = Boolean(req.body.submit);
      const payload = buildTenantApplicationPayload(req.body);
      const tenant = await Tenant.findOne({ application_reference: reference });

      if (!tenant) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (tenant.status === "active" || tenant.status === "suspended") {
        return res.status(400).json({ error: "This application can no longer be edited" });
      }

      const existingConflict = await Tenant.findOne({
        _id: { $ne: tenant._id },
        $or: [
          { slug: payload.slug },
          ...(payload.primary_domain ? [{ primary_domain: payload.primary_domain }] : []),
        ],
      }).select("_id");

      if (existingConflict) {
        return res.status(409).json({ error: "Another application already uses that slug or domain" });
      }

      const couponValidation = payload.coupon_code
        ? await validateCouponForPlan(payload.coupon_code, payload.plan_code, payload.contact_email)
        : null;

      if (couponValidation && !couponValidation.valid) {
        return res.status(400).json({ error: couponValidation.error });
      }

      applyApplicationPayloadToTenant(tenant, payload);
      tenant.onboarding.coupon_snapshot = couponValidation?.snapshot || null;
      tenant.onboarding.billing_snapshot = {
        original_amount_ngn: getPlanDefinition(payload.plan_code).monthly_price_ngn,
        payable_amount_ngn:
          couponValidation?.snapshot?.final_amount_ngn ??
          getPlanDefinition(payload.plan_code).monthly_price_ngn,
      };
      tenant.onboarding.payment_required = tenant.onboarding.billing_snapshot.payable_amount_ngn > 0;

      if (!submit) {
        if (tenant.status !== "draft") {
          tenant.status = "draft";
        }
        appendStatusTimeline(tenant, tenant.status, "Draft updated");
        await tenant.save();

        return res.json({
          message: "Application updated",
          action: "draft_saved",
          checkout_url: null,
          invoice: null,
          next_steps: [
            "Continue editing until you are ready to submit the application.",
            "Your latest coupon and billing summary have been saved.",
          ],
          application: serializeApplication(tenant),
        });
      }

      tenant.status = "pending_payment";
      tenant.onboarding.application_submitted_at =
        tenant.onboarding.application_submitted_at || new Date();
      appendStatusTimeline(tenant, "pending_payment", "Application submitted");
      await tenant.save();

      const checkout = await requestPlanCheckout({
        tenant,
        targetPlanCode: tenant.plan_code,
        actorAdminId: null,
        metadata: {
          application_reference: tenant.application_reference,
          coupon_code: payload.coupon_code || null,
          coupon_snapshot: couponValidation?.snapshot || null,
        },
        amountNgn:
          couponValidation?.snapshot?.final_amount_ngn ??
          getPlanDefinition(tenant.plan_code).monthly_price_ngn,
      });

      const refreshedTenant = (await Tenant.findById(tenant._id)) || tenant;
      const latestInvoice = checkout.invoice || (await getLatestTenantInvoice(tenant._id));
      const checkoutUrl =
        checkout.checkout_url || latestInvoice?.provider_checkout_url || null;

      if (checkout.action === "checkout_required" && tenant.onboarding?.contact_email) {
        emailService
          .sendTenantApplicationPaymentRequired({
            to: tenant.onboarding.contact_email,
            contactName: tenant.onboarding.contact_name,
            tenantName: tenant.name,
            planCode: tenant.plan_code,
            checkoutUrl,
            applicationReference: tenant.application_reference,
            amountLabel:
              latestInvoice?.amount_ngn !== undefined
                ? `${latestInvoice.amount_ngn} NGN`
                : null,
          })
          .catch((err) => {
            console.error("Failed to send updated tenant payment-required email:", err);
          });
      }

      return res.json({
        message: checkout.message || "Application submitted successfully",
        action: checkout.action,
        checkout_url: checkoutUrl,
        invoice: latestInvoice ? serializeInvoice(latestInvoice) : null,
        next_steps:
          checkout.action === "checkout_required"
            ? [
                "Complete payment to move this application into review.",
                "Return to the status page anytime to track approval.",
              ]
            : ["The application is now waiting for platform approval."],
        application: serializeApplication(refreshedTenant, latestInvoice),
      });
    } catch (error) {
      console.error("Update tenant application error:", error);
      return res.status(500).json({ error: "Failed to update tenant application" });
    }
  }

  async getTenantApplicationStatus(req, res) {
    try {
      const reference = String(req.query.reference || "").trim().toUpperCase();
      const email = String(req.query.email || "")
        .trim()
        .toLowerCase();

      if (!reference || !email) {
        return res
          .status(400)
          .json({ error: "reference and email are required" });
      }

      const tenant = await Tenant.findOne({
        application_reference: reference,
        "onboarding.contact_email": email,
      }).lean();

      if (!tenant) {
        return res.status(404).json({ error: "Application not found" });
      }

      const invoice = await getLatestTenantInvoice(tenant._id);
      const nextActions = [];
      if (
        invoice &&
        ["pending", "failed"].includes(invoice.status) &&
        invoice.provider_checkout_url
      ) {
        nextActions.push({
          key: "checkout",
          label: invoice.status === "failed" ? "Retry payment" : "Continue payment",
          href: invoice.provider_checkout_url,
        });
      }

      if (tenant.status === "pending_approval") {
        nextActions.push({
          key: "review",
          label: "Await platform approval",
          href: null,
        });
      }

      return res.json({
        application: serializeApplication(tenant, invoice),
        invoice: invoice ? serializeInvoice(invoice) : null,
        next_actions: nextActions,
      });
    } catch (error) {
      console.error("Get tenant application status error:", error);
      return res.status(500).json({ error: "Failed to fetch application status" });
    }
  }

  async retryTenantApplicationCheckout(req, res) {
    try {
      const reference = String(req.params.reference || "").trim().toUpperCase();
      const tenant = await Tenant.findOne({ application_reference: reference });

      if (!tenant) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (!["draft", "pending_payment", "pending_approval"].includes(tenant.status)) {
        return res.status(400).json({ error: "Application is no longer eligible for checkout" });
      }

      const checkout = await requestPlanCheckout({
        tenant,
        targetPlanCode: tenant.plan_code,
        actorAdminId: null,
        metadata: {
          application_reference: tenant.application_reference,
          coupon_code: tenant.onboarding?.coupon_code || null,
          coupon_snapshot: tenant.onboarding?.coupon_snapshot || null,
        },
        amountNgn:
          tenant.onboarding?.billing_snapshot?.payable_amount_ngn ??
          getPlanDefinition(tenant.plan_code).monthly_price_ngn,
      });

      const latestInvoice = checkout.invoice || (await getLatestTenantInvoice(tenant._id));
      const checkoutUrl =
        checkout.checkout_url || latestInvoice?.provider_checkout_url || null;

      if (tenant.onboarding?.contact_email) {
        emailService
          .sendTenantApplicationPaymentRequired({
            to: tenant.onboarding.contact_email,
            contactName: tenant.onboarding.contact_name,
            tenantName: tenant.name,
            planCode: tenant.plan_code,
            checkoutUrl,
            applicationReference: tenant.application_reference,
            amountLabel:
              latestInvoice?.amount_ngn !== undefined
                ? `${latestInvoice.amount_ngn} NGN`
                : null,
          })
          .catch((err) => {
            console.error("Failed to send retry payment email:", err);
          });
      }

      return res.json({
        message: checkout.message || "Checkout created",
        action: checkout.action,
        checkout_url: checkoutUrl,
        invoice: latestInvoice ? serializeInvoice(latestInvoice) : null,
        application: serializeApplication(tenant, latestInvoice),
      });
    } catch (error) {
      console.error("Retry tenant application checkout error:", error);
      return res.status(500).json({ error: "Failed to create checkout" });
    }
  }

  async validateCoupon(req, res) {
    try {
      const code = String(req.params.code || "").trim().toUpperCase();
      const planCode = String(req.query.plan_code || "pro")
        .trim()
        .toLowerCase();
      const email = req.query.email ? String(req.query.email).trim().toLowerCase() : null;

      const result = await validateCouponForPlan(code, planCode, email);
      if (!result.valid) {
        return res.status(400).json({
          valid: false,
          error: result.error,
        });
      }

      return res.json({
        valid: true,
        coupon: result.snapshot,
      });
    } catch (error) {
      console.error("Validate coupon error:", error);
      return res.status(500).json({ error: "Failed to validate coupon" });
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
        avatar_url: req.body.avatar_url ? String(req.body.avatar_url).trim() : null,
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
              console.error("Failed to notify super admin about testimonial submission:", err);
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

  async resolveCheckout(req, res) {
    try {
      const reference = String(req.body.reference || req.query.reference || "").trim();
      const resolution = await getInvoiceCheckoutResolution(reference);

      if (!resolution) {
        return res.status(404).json({ error: "Checkout reference not found" });
      }

      return res.json({
        resolution,
      });
    } catch (error) {
      console.error("Resolve checkout error:", error);
      return res.status(500).json({ error: "Failed to resolve checkout" });
    }
  }
}

module.exports = new PublicController();
