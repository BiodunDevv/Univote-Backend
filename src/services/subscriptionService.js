const crypto = require("crypto");
const axios = require("axios");
const Tenant = require("../models/Tenant");
const Invoice = require("../models/Invoice");
const SubscriptionEvent = require("../models/SubscriptionEvent");
const { comparePlanRank, getPlanDefinition, serializePlanCatalog } = require("../config/billingPlans");
const {
  getTenantLimit,
  getTenantUsageSnapshot,
  hasTenantFeature,
} = require("./planAccessService");

const GRACE_PERIOD_DAYS = 7;

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfNow() {
  return new Date();
}

function getPaymentProvider() {
  return process.env.PAYSTACK_SECRET_KEY ? "paystack" : "mock";
}

function getPaystackApiBaseUrl() {
  return process.env.PAYSTACK_API_BASE_URL || "https://api.paystack.co";
}

function getPaystackPlanCode(planCode) {
  switch (planCode) {
    case "pro":
      return process.env.PAYSTACK_PLAN_CODE_PRO || null;
    case "pro_plus":
      return process.env.PAYSTACK_PLAN_CODE_PRO_PLUS || null;
    case "enterprise":
      return process.env.PAYSTACK_PLAN_CODE_ENTERPRISE || null;
    default:
      return null;
  }
}

function toMetadataObject(metadata) {
  if (!metadata) return {};
  if (metadata instanceof Map) {
    return Object.fromEntries(metadata.entries());
  }
  return { ...metadata };
}

function getMetadataValue(metadata, key) {
  const values = toMetadataObject(metadata);
  return values[key];
}

function buildMetadataMap(metadata = {}) {
  return new Map(Object.entries(metadata).filter(([, value]) => value !== undefined));
}

function getBillingContactEmail(tenant) {
  return (
    tenant?.onboarding?.contact_email ||
    tenant?.branding?.support_email ||
    `${tenant.slug}@billing.univote.local`
  );
}

function normalizeBaseUrl(value, defaultProtocol = "https") {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return `${defaultProtocol}://${raw}`;
}

function getFrontendBaseUrl() {
  return (
    normalizeBaseUrl(process.env.PAYSTACK_CALLBACK_BASE_URL) ||
    normalizeBaseUrl(process.env.PUBLIC_APP_URL) ||
    normalizeBaseUrl(process.env.APP_ROOT_DOMAIN) ||
    normalizeBaseUrl(process.env.WEB_APP_URL) ||
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    "https://univote.online"
  );
}

function buildCheckoutCallbackUrl(tenant, source) {
  const frontendBaseUrl = getFrontendBaseUrl();
  const callback = new URL("/checkout", frontendBaseUrl);
  callback.searchParams.set("source", source || "billing");
  if (tenant?.slug) {
    callback.searchParams.set("tenant", tenant.slug);
  }
  return callback.toString();
}

function createInvoiceNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `INV-${stamp}-${random}`;
}

function createPaymentReference(prefix = "uv") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function ensureBillingFields(tenant) {
  if (!tenant.billing) {
    tenant.billing = {};
  }

  if (!tenant.billing.billing_cycle) {
    tenant.billing.billing_cycle = "monthly";
  }

  if (!tenant.billing.currency) {
    tenant.billing.currency = "NGN";
  }

  return tenant.billing;
}

function serializeInvoice(invoice) {
  return {
    id: invoice._id,
    invoice_number: invoice.invoice_number,
    plan_code: invoice.plan_code,
    amount_ngn: invoice.amount_ngn,
    amount_kobo: invoice.amount_kobo,
    currency: invoice.currency,
    interval: invoice.interval,
    status: invoice.status,
    payment_provider: invoice.payment_provider,
    payment_reference: invoice.payment_reference,
    provider_checkout_url: invoice.provider_checkout_url,
    issued_at: invoice.issued_at,
    paid_at: invoice.paid_at,
    period_start: invoice.period_start,
    period_end: invoice.period_end,
    createdAt: invoice.createdAt,
  };
}

function serializeTenantBilling(tenant, invoices = [], usage = null) {
  const billing = ensureBillingFields(tenant);
  const currentPlan = getPlanDefinition(tenant.plan_code);
  const nextPlan = billing.next_plan_code
    ? getPlanDefinition(billing.next_plan_code)
    : null;
  const usageSnapshot = usage || {
    admins: 0,
    students: 0,
    active_sessions: 0,
  };

  const usageSummary = Object.entries(usageSnapshot).reduce(
    (accumulator, [key, used]) => {
      const limit = getTenantLimit(tenant, key);
      accumulator[key] = {
        used,
        limit,
        remaining: Math.max(limit - used, 0),
      };
      return accumulator;
    },
    {},
  );

  return {
    tenant: {
      id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan_code: tenant.plan_code,
      subscription_status: tenant.subscription_status,
    },
    billing: {
      billing_cycle: billing.billing_cycle,
      currency: billing.currency,
      current_period_start: billing.current_period_start,
      current_period_end: billing.current_period_end,
      grace_ends_at: billing.grace_ends_at,
      last_payment_at: billing.last_payment_at,
      current_plan: {
        ...currentPlan,
        monthly_price_kobo: currentPlan.monthly_price_ngn * 100,
      },
      scheduled_change: nextPlan
        ? {
            plan_code: billing.next_plan_code,
            name: nextPlan.name,
            effective_at: billing.next_plan_effective_at,
            requested_at: billing.next_plan_requested_at,
          }
        : null,
      invoices: invoices.map(serializeInvoice),
    },
    capabilities: {
      usage: usageSummary,
      features: {
        custom_terminology: hasTenantFeature(tenant, "custom_terminology"),
        custom_identity_policy: hasTenantFeature(tenant, "custom_identity_policy"),
        custom_participant_structure: hasTenantFeature(
          tenant,
          "custom_participant_structure",
        ),
        advanced_analytics: hasTenantFeature(tenant, "advanced_analytics"),
        advanced_reports: hasTenantFeature(tenant, "advanced_reports"),
        realtime_support: hasTenantFeature(tenant, "realtime_support"),
        push_notifications: hasTenantFeature(tenant, "push_notifications"),
        custom_branding: hasTenantFeature(tenant, "custom_branding"),
        face_verification: hasTenantFeature(tenant, "face_verification"),
      },
    },
    plans: serializePlanCatalog(),
  };
}

async function recordEvent({
  tenantId,
  type,
  previousPlanCode = null,
  nextPlanCode = null,
  previousStatus = null,
  nextStatus = null,
  invoiceId = null,
  actorAdminId = null,
  effectiveAt = new Date(),
  metadata = {},
}) {
  await SubscriptionEvent.create({
    tenant_id: tenantId,
    type,
    previous_plan_code: previousPlanCode,
    next_plan_code: nextPlanCode,
    previous_subscription_status: previousStatus,
    next_subscription_status: nextStatus,
    invoice_id: invoiceId,
    actor_admin_id: actorAdminId,
    effective_at: effectiveAt,
    metadata,
  });
}

async function createInvoice({
  tenant,
  planCode,
  actorAdminId = null,
  issuedAt = new Date(),
  periodStart = null,
  periodEnd = null,
  status = "paid",
  metadata = {},
  paymentProvider = getPaymentProvider(),
  paymentReference = createPaymentReference("pay"),
  providerCheckoutUrl = null,
  amountNgn = null,
  amountKobo = null,
}) {
  const plan = getPlanDefinition(planCode);
  const resolvedAmountNgn = amountNgn ?? plan.monthly_price_ngn;
  const resolvedAmountKobo = amountKobo ?? resolvedAmountNgn * 100;
  const invoice = await Invoice.create({
    tenant_id: tenant._id,
    invoice_number: createInvoiceNumber(),
    plan_code: plan.code,
    amount_ngn: resolvedAmountNgn,
    amount_kobo: resolvedAmountKobo,
    currency: "NGN",
    interval: "monthly",
    status,
    payment_provider: paymentProvider,
    payment_reference: paymentReference,
    provider_checkout_url: providerCheckoutUrl,
    issued_at: issuedAt,
    paid_at: status === "paid" ? issuedAt : null,
    period_start: periodStart,
    period_end: periodEnd,
    created_by: actorAdminId,
    metadata: buildMetadataMap(metadata),
  });

  return invoice;
}

async function initializePaystackCheckout({
  tenant,
  invoice,
  source,
  targetPlanCode,
  actorAdminId = null,
}) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }

  const callbackUrl = buildCheckoutCallbackUrl(tenant, source);
  const planCode = getPaystackPlanCode(targetPlanCode);
  const payload = {
    email: getBillingContactEmail(tenant),
    reference: invoice.payment_reference,
    currency: "NGN",
    callback_url: callbackUrl,
    metadata: {
      tenant_id: String(tenant._id),
      tenant_slug: tenant.slug,
      invoice_id: String(invoice._id),
      source,
      target_plan_code: targetPlanCode,
      actor_admin_id: actorAdminId ? String(actorAdminId) : null,
    },
  };

  if (planCode) {
    payload.plan = planCode;
    payload.invoice_limit = 1;
  } else {
    payload.amount = invoice.amount_kobo;
  }

  const response = await axios.post(
    `${getPaystackApiBaseUrl()}/transaction/initialize`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    },
  );

  const checkoutUrl = response?.data?.data?.authorization_url;
  if (!checkoutUrl) {
    throw new Error("Paystack did not return an authorization URL");
  }

  invoice.provider_checkout_url = checkoutUrl;
  await invoice.save();

  return checkoutUrl;
}

async function voidPendingInvoicesForTenant(tenantId) {
  await Invoice.updateMany(
    {
      tenant_id: tenantId,
      status: "pending",
    },
    {
      $set: {
        status: "void",
      },
    },
  );
}

async function activateInvoicePayment(invoice, providerPayload = {}) {
  const tenant = await Tenant.findById(invoice.tenant_id);
  if (!tenant) {
    return { tenant: null, invoice };
  }

  ensureBillingFields(tenant);
  if (!tenant.billing_refs) {
    tenant.billing_refs = {};
  }

  if (invoice.status === "paid") {
    return { tenant, invoice };
  }

  const paidAt = providerPayload.paid_at
    ? new Date(providerPayload.paid_at)
    : new Date();
  const source = getMetadataValue(invoice.metadata, "source") || "upgrade";
  const previousPlanCode = tenant.plan_code;
  const previousStatus = tenant.subscription_status;

  invoice.status = "paid";
  invoice.paid_at = paidAt;
  await invoice.save();

  tenant.plan_code = invoice.plan_code;
  tenant.subscription_status = "active";
  tenant.billing.last_invoice_id = invoice._id;
  tenant.billing.last_payment_at = paidAt;
  tenant.billing.grace_ends_at = null;

  if (source === "tenant_application") {
    tenant.status =
      tenant.status === "suspended" ? tenant.status : "pending_approval";
    tenant.billing.current_period_start = paidAt;
    tenant.billing.current_period_end = addDays(paidAt, 30);
  } else {
    tenant.status = tenant.status === "suspended" ? tenant.status : "active";
    if (!tenant.billing.current_period_start || !tenant.billing.current_period_end) {
      tenant.billing.current_period_start = paidAt;
      tenant.billing.current_period_end = addDays(paidAt, 30);
    }
  }

  tenant.billing.next_plan_code = null;
  tenant.billing.next_plan_effective_at = null;
  tenant.billing.next_plan_requested_at = null;

  if (providerPayload.customer?.customer_code) {
    tenant.billing_refs.paystack_customer_code =
      providerPayload.customer.customer_code;
  }

  const configuredPlanCode = getPaystackPlanCode(invoice.plan_code);
  if (configuredPlanCode) {
    tenant.billing_refs.paystack_plan_code = configuredPlanCode;
  }

  await tenant.save();

  await recordEvent({
    tenantId: tenant._id,
    type: "payment_received",
    previousPlanCode,
    nextPlanCode: tenant.plan_code,
    previousStatus,
    nextStatus: tenant.subscription_status,
    invoiceId: invoice._id,
    actorAdminId: null,
    effectiveAt: paidAt,
    metadata: {
      source,
      payment_reference: invoice.payment_reference,
      paystack_reference: providerPayload.reference || invoice.payment_reference,
    },
  });

  if (source !== "tenant_application" && previousPlanCode !== tenant.plan_code) {
    await recordEvent({
      tenantId: tenant._id,
      type: "plan_upgraded",
      previousPlanCode,
      nextPlanCode: tenant.plan_code,
      previousStatus,
      nextStatus: tenant.subscription_status,
      invoiceId: invoice._id,
      actorAdminId: null,
      effectiveAt: paidAt,
      metadata: {
        source,
      },
    });
  } else if (previousStatus !== tenant.subscription_status) {
    await recordEvent({
      tenantId: tenant._id,
      type: "subscription_status_changed",
      previousPlanCode,
      nextPlanCode: tenant.plan_code,
      previousStatus,
      nextStatus: tenant.subscription_status,
      invoiceId: invoice._id,
      actorAdminId: null,
      effectiveAt: paidAt,
      metadata: {
        source,
      },
    });
  }

  return { tenant, invoice };
}

async function getInvoiceCheckoutResolution(reference) {
  if (!reference) {
    return null;
  }

  const invoice = await Invoice.findOne({ payment_reference: reference }).lean();
  if (!invoice) {
    return null;
  }

  const tenant = await Tenant.findById(invoice.tenant_id).lean();
  const source = getMetadataValue(invoice.metadata, "source") || "upgrade";
  const tenantSlug = tenant?.slug || null;
  const tenantPrimaryDomain = tenant?.primary_domain || null;
  const applicationReference =
    getMetadataValue(invoice.metadata, "application_reference") ||
    tenant?.application_reference ||
    null;

  let status = invoice.status;
  if (status === "pending" && invoice.provider_checkout_url) {
    status = "pending";
  }

  return {
    reference,
    source,
    status,
    tenant: tenant
      ? {
          id: tenant._id,
          name: tenant.name,
          slug: tenantSlug,
          primary_domain: tenantPrimaryDomain,
          status: tenant.status,
          plan_code: tenant.plan_code,
          subscription_status: tenant.subscription_status,
        }
      : null,
    invoice: serializeInvoice(invoice),
    application_reference: applicationReference,
    retry_checkout_url:
      invoice.status === "pending" || invoice.status === "failed"
        ? invoice.provider_checkout_url || null
        : null,
  };
}

async function markInvoiceFailedByReference(reference, providerPayload = {}) {
  if (!reference) return null;

  const invoice = await Invoice.findOne({ payment_reference: reference });
  if (!invoice || invoice.status === "paid" || invoice.status === "void") {
    return invoice;
  }

  invoice.status = "failed";
  await invoice.save();

  await recordEvent({
    tenantId: invoice.tenant_id,
    type: "subscription_status_changed",
    previousPlanCode: null,
    nextPlanCode: invoice.plan_code,
    previousStatus: null,
    nextStatus: null,
    invoiceId: invoice._id,
    actorAdminId: null,
    effectiveAt: new Date(),
    metadata: {
      source: getMetadataValue(invoice.metadata, "source") || "unknown",
      payment_reference: reference,
      failure_status: providerPayload.status || "failed",
    },
  });

  return invoice;
}

async function syncInvoiceFromPaystackEvent(eventPayload = {}) {
  const reference = eventPayload.reference;
  if (!reference) {
    return { status: "ignored", reason: "missing_reference" };
  }

  const invoice = await Invoice.findOne({ payment_reference: reference });
  if (!invoice) {
    return { status: "ignored", reason: "invoice_not_found" };
  }

  if (invoice.status === "void") {
    return { status: "ignored", reason: "invoice_void" };
  }

  if (invoice.status === "paid") {
    return { status: "noop", invoice };
  }

  await activateInvoicePayment(invoice, eventPayload);
  return { status: "paid", invoice };
}

async function applyLifecycleMutations(tenant, actorAdminId = null) {
  const billing = ensureBillingFields(tenant);
  const now = startOfNow();
  let changed = false;

  if (
    billing.next_plan_code &&
    billing.next_plan_effective_at &&
    billing.next_plan_effective_at <= now
  ) {
    const previousPlan = tenant.plan_code;
    const previousStatus = tenant.subscription_status;
    tenant.plan_code = billing.next_plan_code;
    tenant.subscription_status = "active";
    tenant.status = tenant.status === "suspended" ? tenant.status : "active";
    billing.current_period_start = now;
    billing.current_period_end = addDays(now, 30);
    billing.last_payment_at = now;

    const invoice = await createInvoice({
      tenant,
      planCode: tenant.plan_code,
      actorAdminId,
      issuedAt: now,
      periodStart: billing.current_period_start,
      periodEnd: billing.current_period_end,
      metadata: {
        source: "scheduled_change",
      },
    });

    billing.last_invoice_id = invoice._id;
    billing.next_plan_code = null;
    billing.next_plan_effective_at = null;
    billing.next_plan_requested_at = null;
    billing.grace_ends_at = null;

    await recordEvent({
      tenantId: tenant._id,
      type: "scheduled_change_applied",
      previousPlanCode: previousPlan,
      nextPlanCode: tenant.plan_code,
      previousStatus,
      nextStatus: tenant.subscription_status,
      invoiceId: invoice._id,
      actorAdminId,
      effectiveAt: now,
      metadata: {
        source: "lifecycle_sync",
      },
    });
    changed = true;
  }

  if (billing.current_period_end && billing.current_period_end < now) {
    if (
      tenant.subscription_status === "active" ||
      tenant.subscription_status === "trial"
    ) {
      tenant.subscription_status = "grace";
      billing.grace_ends_at = addDays(now, GRACE_PERIOD_DAYS);
      changed = true;
    } else if (
      tenant.subscription_status === "grace" &&
      billing.grace_ends_at &&
      billing.grace_ends_at < now
    ) {
      tenant.subscription_status = "expired";
      changed = true;
    }
  }

  if (changed) {
    await tenant.save();
  }

  return tenant;
}

async function getTenantBillingSnapshotById(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    return null;
  }

  await applyLifecycleMutations(tenant);
  const usage = await getTenantUsageSnapshot(tenant._id);

  const invoices = await Invoice.find({ tenant_id: tenant._id })
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();

  return serializeTenantBilling(tenant, invoices, usage);
}

async function getTenantBillingSnapshotBySlug(slug) {
  const tenant = await Tenant.findOne({
    slug,
    is_active: true,
  });

  if (!tenant) {
    return null;
  }

  await applyLifecycleMutations(tenant);

  return tenant.toObject();
}

async function requestPlanCheckout({
  tenant,
  targetPlanCode,
  actorAdminId = null,
  metadata = {},
  amountNgn = null,
  amountKobo = null,
}) {
  ensureBillingFields(tenant);

  const now = startOfNow();
  const currentPlan = tenant.plan_code || "pro";
  const comparison = comparePlanRank(targetPlanCode, currentPlan);
  const provider = getPaymentProvider();
  const isActivationFlow =
    tenant.status === "pending_payment" || tenant.status === "draft";
  const resolvedAmountNgn =
    amountNgn ?? getPlanDefinition(targetPlanCode).monthly_price_ngn;
  const resolvedAmountKobo = amountKobo ?? resolvedAmountNgn * 100;

  if (targetPlanCode === currentPlan && !isActivationFlow) {
    return {
      message: "Tenant is already on this plan",
      tenant,
      invoice: null,
      scheduled_change: null,
      action: "noop",
      checkout_url: null,
    };
  }

  if (comparison > 0 || isActivationFlow) {
    const previousStatus = tenant.subscription_status;
    const source = isActivationFlow ? "tenant_application" : "upgrade";

    if (resolvedAmountNgn <= 0) {
      await voidPendingInvoicesForTenant(tenant._id);

      const invoice = await createInvoice({
        tenant,
        planCode: targetPlanCode,
        actorAdminId,
        issuedAt: now,
        periodStart: tenant.billing.current_period_start || now,
        periodEnd: tenant.billing.current_period_end || addDays(now, 30),
        status: "paid",
        metadata: {
          source,
          current_plan_code: currentPlan,
          ...metadata,
        },
        paymentProvider: "mock",
        amountNgn: resolvedAmountNgn,
        amountKobo: resolvedAmountKobo,
      });

      await activateInvoicePayment(invoice, {
        paid_at: now.toISOString(),
        reference: invoice.payment_reference,
      });

      const refreshedTenant = await Tenant.findById(tenant._id);

      return {
        message: isActivationFlow
          ? "Application submitted successfully and moved straight into approval."
          : `${getPlanDefinition(targetPlanCode).name} activated successfully`,
        tenant: refreshedTenant || tenant,
        invoice,
        scheduled_change: null,
        action: isActivationFlow ? "pending_approval" : "upgraded",
        checkout_url: null,
      };
    }

    if (provider === "paystack") {
      await voidPendingInvoicesForTenant(tenant._id);

      const invoice = await createInvoice({
        tenant,
        planCode: targetPlanCode,
        actorAdminId,
        issuedAt: now,
        periodStart: tenant.billing.current_period_start,
        periodEnd: tenant.billing.current_period_end,
        status: "pending",
        metadata: {
          source,
          current_plan_code: currentPlan,
          ...metadata,
        },
        paymentProvider: "paystack",
        amountNgn: resolvedAmountNgn,
        amountKobo: resolvedAmountKobo,
      });

      const checkoutUrl = await initializePaystackCheckout({
        tenant,
        invoice,
        source,
        targetPlanCode,
        actorAdminId,
      });

      tenant.billing.last_invoice_id = invoice._id;
      await tenant.save();

      await recordEvent({
        tenantId: tenant._id,
        type: "checkout_created",
        previousPlanCode: currentPlan,
        nextPlanCode: targetPlanCode,
        previousStatus,
        nextStatus: tenant.subscription_status,
        invoiceId: invoice._id,
        actorAdminId,
        effectiveAt: now,
        metadata: {
          source,
          checkout_url: checkoutUrl,
        },
      });

      return {
        message: isActivationFlow
          ? `Complete payment to continue ${tenant.name}'s onboarding`
          : `Complete payment to activate ${getPlanDefinition(targetPlanCode).name}`,
        tenant,
        invoice,
        scheduled_change: null,
        action: "checkout_required",
        checkout_url: checkoutUrl,
      };
    }

    const invoice = await createInvoice({
      tenant,
      planCode: targetPlanCode,
      actorAdminId,
      issuedAt: now,
      periodStart: tenant.billing.current_period_start || now,
      periodEnd: tenant.billing.current_period_end || addDays(now, 30),
      metadata: {
        source,
        ...metadata,
      },
      paymentProvider: "mock",
      amountNgn: resolvedAmountNgn,
      amountKobo: resolvedAmountKobo,
    });

    await activateInvoicePayment(invoice, {
      paid_at: now.toISOString(),
      reference: invoice.payment_reference,
    });

    const refreshedTenant = await Tenant.findById(tenant._id);

    return {
      message: isActivationFlow
        ? "Payment simulated. Tenant is now pending approval."
        : `${getPlanDefinition(targetPlanCode).name} activated immediately`,
      tenant: refreshedTenant || tenant,
      invoice,
      scheduled_change: null,
      action: isActivationFlow ? "mock_activated" : "upgraded",
      checkout_url: null,
    };
  }

  const effectiveAt = tenant.billing.current_period_end || addDays(now, 30);
  tenant.billing.next_plan_code = targetPlanCode;
  tenant.billing.next_plan_effective_at = effectiveAt;
  tenant.billing.next_plan_requested_at = now;
  await tenant.save();

  await recordEvent({
    tenantId: tenant._id,
    type: "downgrade_scheduled",
    previousPlanCode: currentPlan,
    nextPlanCode: targetPlanCode,
    previousStatus: tenant.subscription_status,
    nextStatus: tenant.subscription_status,
    actorAdminId,
    effectiveAt,
  });

  return {
    message: `${getPlanDefinition(targetPlanCode).name} is scheduled for the end of the current billing period`,
    tenant,
    invoice: null,
    scheduled_change: {
      plan_code: targetPlanCode,
      effective_at: effectiveAt,
      requested_at: now,
    },
    action: "scheduled_downgrade",
    checkout_url: null,
  };
}

async function cancelScheduledPlanChange(tenant, actorAdminId = null) {
  ensureBillingFields(tenant);

  if (!tenant.billing.next_plan_code) {
    return {
      message: "No scheduled plan change found",
      tenant,
      cancelled: false,
    };
  }

  const nextPlanCode = tenant.billing.next_plan_code;
  const effectiveAt = tenant.billing.next_plan_effective_at;

  tenant.billing.next_plan_code = null;
  tenant.billing.next_plan_effective_at = null;
  tenant.billing.next_plan_requested_at = null;
  await tenant.save();

  await recordEvent({
    tenantId: tenant._id,
    type: "scheduled_change_cancelled",
    previousPlanCode: tenant.plan_code,
    nextPlanCode,
    previousStatus: tenant.subscription_status,
    nextStatus: tenant.subscription_status,
    actorAdminId,
    effectiveAt,
  });

  return {
    message: "Scheduled plan change cancelled",
    tenant,
    cancelled: true,
  };
}

async function getPlatformBillingOverview() {
  const tenantDocs = await Tenant.find({}).sort({ createdAt: -1 });
  await Promise.all(tenantDocs.map((tenant) => applyLifecycleMutations(tenant)));
  const tenants = tenantDocs.map((tenant) => tenant.toObject());
  const invoices = await Invoice.find({})
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const monthlyRecurringRevenue = paidInvoices.reduce(
    (sum, invoice) => sum + invoice.amount_ngn,
    0,
  );

  return {
    plans: serializePlanCatalog(),
    metrics: {
      total_tenants: tenants.length,
      active_subscriptions: tenants.filter(
        (tenant) => tenant.subscription_status === "active",
      ).length,
      scheduled_downgrades: tenants.filter(
        (tenant) => tenant.billing?.next_plan_code,
      ).length,
      monthly_recurring_revenue_ngn: monthlyRecurringRevenue,
    },
    tenants: tenants.map((tenant) => ({
      id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      plan_code: tenant.plan_code,
      subscription_status: tenant.subscription_status,
      current_period_end: tenant.billing?.current_period_end || null,
      scheduled_plan_code: tenant.billing?.next_plan_code || null,
      scheduled_plan_effective_at: tenant.billing?.next_plan_effective_at || null,
      limits: {
        admins: getTenantLimit(tenant, "admins"),
        students: getTenantLimit(tenant, "students"),
        active_sessions: getTenantLimit(tenant, "active_sessions"),
      },
    })),
    invoices: paidInvoices.slice(0, 15).map(serializeInvoice),
  };
}

module.exports = {
  addDays,
  activateInvoicePayment,
  applyLifecycleMutations,
  cancelScheduledPlanChange,
  createInvoice,
  getPaymentProvider,
  getTenantBillingSnapshotById,
  getTenantBillingSnapshotBySlug,
  getPlatformBillingOverview,
  markInvoiceFailedByReference,
  requestPlanCheckout,
  serializeInvoice,
  serializeTenantBilling,
  syncInvoiceFromPaystackEvent,
  toMetadataObject,
  getFrontendBaseUrl,
  getInvoiceCheckoutResolution,
};
