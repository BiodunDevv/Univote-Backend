const crypto = require("crypto");
const Tenant = require("../models/Tenant");
const Invoice = require("../models/Invoice");
const {
  clonePlanCatalog,
  normalizePlanDefinition,
  setPlanCatalog,
  cancelScheduledPlanChange,
  getPlatformBillingOverview,
  getTenantBillingSnapshotById,
  markInvoiceFailedByReference,
  requestPlanCheckout,
  serializeInvoice,
  serializeTenantBilling,
  syncInvoiceFromPaystackEvent,
} = require("../services/subscriptionService");
const { serializePlanCatalog } = require("../config/billingPlans");
const PlatformSetting = require("../models/PlatformSetting");
const emailService = require("../services/emailService");

class BillingController {
  async getTenantBillingSummary(req, res) {
    try {
      const tenantId = req.tenantId || req.tenant?._id;

      if (!tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const snapshot = await getTenantBillingSnapshotById(tenantId);
      if (!snapshot) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      return res.json(snapshot);
    } catch (error) {
      console.error("Get tenant billing summary error:", error);
      return res.status(500).json({ error: "Failed to fetch billing summary" });
    }
  }

  async getTenantInvoices(req, res) {
    try {
      const tenantId = req.tenantId || req.tenant?._id;

      if (!tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;

      const [invoices, total] = await Promise.all([
        Invoice.find({ tenant_id: tenantId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Invoice.countDocuments({ tenant_id: tenantId }),
      ]);

      return res.json({
        invoices: invoices.map(serializeInvoice),
        page,
        pages: Math.max(Math.ceil(total / limit), 1),
        total,
      });
    } catch (error) {
      console.error("Get tenant invoices error:", error);
      return res.status(500).json({ error: "Failed to fetch invoices" });
    }
  }

  async checkout(req, res) {
    try {
      const tenantId = req.tenantId || req.tenant?._id;
      const { plan_code } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      if (!plan_code) {
        return res.status(400).json({ error: "plan_code is required" });
      }

      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const result = await requestPlanCheckout({
        tenant,
        targetPlanCode: plan_code,
        actorAdminId: req.adminId || null,
      });

      const latestSnapshot = await getTenantBillingSnapshotById(tenantId);
      const contactEmail =
        tenant.onboarding?.contact_email || tenant.branding?.support_email || null;

      if (contactEmail && result.invoice) {
        emailService
          .sendBillingInvoiceAvailable({
            to: contactEmail,
            recipientName: tenant.onboarding?.contact_name || tenant.name,
            tenant,
            invoice: result.invoice,
            checkoutUrl:
              result.checkout_url || result.invoice?.provider_checkout_url || null,
            planName: plan_code,
          })
          .catch((err) => {
            console.error("Failed to send billing invoice email:", err);
          });
      }

      return res.json({
        message: result.message,
        action: result.action,
        scheduled_change: result.scheduled_change,
        invoice: result.invoice ? serializeInvoice(result.invoice) : null,
        checkout_url:
          result.checkout_url ||
          result.invoice?.provider_checkout_url ||
          null,
        ...latestSnapshot,
      });
    } catch (error) {
      console.error("Tenant checkout error:", error);
      return res.status(500).json({ error: "Failed to process plan change" });
    }
  }

  async cancelScheduledChange(req, res) {
    try {
      const tenantId = req.tenantId || req.tenant?._id;

      if (!tenantId) {
        return res.status(400).json({ error: "Tenant context is required" });
      }

      const tenant = await Tenant.findById(tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const result = await cancelScheduledPlanChange(tenant, req.adminId || null);
      const latestSnapshot = await getTenantBillingSnapshotById(tenantId);

      return res.json({
        message: result.message,
        cancelled: result.cancelled,
        ...latestSnapshot,
      });
    } catch (error) {
      console.error("Cancel scheduled change error:", error);
      return res
        .status(500)
        .json({ error: "Failed to cancel scheduled plan change" });
    }
  }

  async getPlatformBillingOverview(_req, res) {
    try {
      const overview = await getPlatformBillingOverview();
      return res.json(overview);
    } catch (error) {
      console.error("Get platform billing overview error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch platform billing overview" });
    }
  }

  async getPlatformPlans(_req, res) {
    try {
      return res.json({
        plans: serializePlanCatalog(),
      });
    } catch (error) {
      console.error("Get platform plans error:", error);
      return res.status(500).json({ error: "Failed to fetch plans" });
    }
  }

  async updatePlatformPlan(req, res) {
    try {
      const { code } = req.params;
      const platformSetting =
        (await PlatformSetting.findOne({ key: "defaults" })) ||
        (await PlatformSetting.create({ key: "defaults" }));
      const currentCatalog = clonePlanCatalog(platformSetting.plan_catalog || undefined);
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

  async getPlatformTenantBilling(req, res) {
    try {
      const { id } = req.params;

      const tenant = await Tenant.findById(id);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const invoices = await Invoice.find({ tenant_id: tenant._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      return res.json(serializeTenantBilling(tenant, invoices));
    } catch (error) {
      console.error("Get platform tenant billing error:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch tenant billing detail" });
    }
  }

  async handlePaystackWebhook(req, res) {
    try {
      const secretKey = process.env.PAYSTACK_SECRET_KEY;
      if (!secretKey) {
        return res.status(503).json({ error: "Paystack is not configured" });
      }

      const signature = req.headers["x-paystack-signature"];
      if (!signature || !req.rawBody) {
        return res.status(401).json({ error: "Missing webhook signature" });
      }

      const expectedSignature = crypto
        .createHmac("sha512", secretKey)
        .update(req.rawBody)
        .digest("hex");

      const isValid =
        typeof signature === "string" &&
        signature.length === expectedSignature.length &&
        crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSignature),
        );

      if (!isValid) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      const event = req.body;
      if (!event?.event) {
        return res.status(400).json({ error: "Webhook event is required" });
      }

      if (event.event === "charge.success") {
        const result = await syncInvoiceFromPaystackEvent(event.data || {});
        if (result?.invoice) {
          const tenant = await Tenant.findById(result.invoice.tenant_id);
          const contactEmail =
            tenant?.onboarding?.contact_email || tenant?.branding?.support_email;
          if (tenant && contactEmail) {
            emailService
              .sendBillingPlanChange({
                to: contactEmail,
                recipientName: tenant.onboarding?.contact_name || tenant.name,
                tenant,
                title: "Payment confirmed",
                message: `Payment for invoice ${result.invoice.invoice_number} has been confirmed and your subscription is now up to date.`,
              })
              .catch((err) => {
                console.error("Failed to send payment success email:", err);
              });
          }
        }
      } else if (event.event === "charge.failed") {
        const invoice = await markInvoiceFailedByReference(
          event.data?.reference,
          event.data || {},
        );
        if (invoice) {
          const tenant = await Tenant.findById(invoice.tenant_id);
          const contactEmail =
            tenant?.onboarding?.contact_email || tenant?.branding?.support_email;
          if (tenant && contactEmail) {
            emailService
              .sendBillingPlanChange({
                to: contactEmail,
                recipientName: tenant.onboarding?.contact_name || tenant.name,
                tenant,
                title: "Payment attempt failed",
                message: `We could not complete payment for invoice ${invoice.invoice_number}. Review the billing workspace to retry or update your payment flow.`,
              })
              .catch((err) => {
                console.error("Failed to send payment failure email:", err);
              });
          }
        }
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("Paystack webhook error:", error);
      return res.status(500).json({ error: "Failed to process billing webhook" });
    }
  }
}

module.exports = new BillingController();
