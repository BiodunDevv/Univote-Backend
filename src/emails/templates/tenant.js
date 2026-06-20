const { buildEmailShell } = require("../shell");
const {
  renderKeyValueRows,
  renderList,
  renderNoticeBox,
  renderSection,
  renderSummaryStrip,
} = require("../fragments");
const { escapeHtml, formatDateTime } = require("../utils");
const { COLORS, FONT_SANS } = require("../theme");

function buildTenantApplicationSubmittedEmail({
  branding,
  contactName,
  tenantName,
  applicationReference,
  recipientType = "contact",
}) {
  const isPlatformRecipient = recipientType === "platform_admin";
  const greeting = isPlatformRecipient
    ? `Hello ${escapeHtml(contactName || "team")},`
    : `Hello ${escapeHtml(contactName || "there")},`;

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      ${greeting} ${
        isPlatformRecipient
          ? `${escapeHtml(tenantName)} has submitted an organisation application and entered the onboarding pipeline.`
          : `Your application for ${escapeHtml(tenantName)} has been received and is under review.`
      }
    </p>
    ${renderSection(
      "Application details",
      renderKeyValueRows([
        { label: "Organisation", value: tenantName },
        ...(applicationReference
          ? [{ label: "Reference", value: applicationReference }]
          : []),
        { label: "Submitted", value: formatDateTime(Date.now()) },
        { label: "Status", value: "Under review" },
      ]),
    )}
    ${renderSection(
      isPlatformRecipient ? "Review note" : "What happens next",
      isPlatformRecipient
        ? renderNoticeBox(
            "Validate the submitted details and continue provisioning once the application has been approved.",
            "warning",
          )
        : renderNoticeBox(
            "The platform team will review your application and notify you at this email address as your workspace moves through each step. This typically takes 1–3 business days.",
            "success",
          ),
    )}
  `;

  return {
    subject: isPlatformRecipient
      ? `New organisation application — ${tenantName}`
      : "Your organisation application has been received",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: isPlatformRecipient
        ? `${tenantName} has entered the onboarding pipeline.`
        : `Your application for ${tenantName} is under review.`,
      badge: isPlatformRecipient ? "Onboarding queue" : "Application received",
      headline: isPlatformRecipient
        ? "A new organisation application is ready for review"
        : "Your application has been received",
      intro: isPlatformRecipient
        ? `${escapeHtml(tenantName)} has entered the onboarding pipeline and is awaiting platform review.`
        : `Thank you for submitting an application for ${escapeHtml(tenantName)}. Your workspace setup has started.`,
      bodyHtml,
    }),
  };
}

function buildTenantApplicationApprovedEmail({
  branding,
  contactName,
  tenantName,
  applicationReference,
  workspaceUrl,
}) {
  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(contactName || "there")}, your ${escapeHtml(tenantName)} workspace has passed platform review and is ready to use.
    </p>
    ${renderSection(
      "Approval details",
      renderKeyValueRows([
        { label: "Organisation", value: tenantName },
        ...(applicationReference
          ? [{ label: "Reference", value: applicationReference }]
          : []),
        { label: "Approved", value: formatDateTime(Date.now()) },
        { label: "Status", value: "Active" },
      ]),
    )}
    ${renderSection(
      "Getting started",
      renderList([
        "Sign in to your workspace using the button below.",
        "Invite administrators and set up your organisation profile.",
        "Create your first election and import your student list.",
        "Contact support at any time if you need assistance.",
      ]),
    )}
    ${renderSection(
      "Your workspace is ready",
      renderNoticeBox(
        "Your organisation is fully provisioned. You can now create elections, manage students, and configure your portal settings.",
        "success",
      ),
    )}
  `;

  return {
    subject: `Your ${tenantName} workspace has been approved`,
    html: buildEmailShell({
      branding,
      variant: "order",
      preheader: `${tenantName} has been approved and your workspace is ready.`,
      badge: "Application approved",
      headline: "Your workspace is approved",
      intro: `Hello ${escapeHtml(contactName || "there")}, ${escapeHtml(tenantName)} has been approved and your workspace is ready to use.`,
      statusStripHtml: renderSummaryStrip([
        { label: "Organisation", value: tenantName },
        { label: "Approved", value: formatDateTime(Date.now()) },
        { label: "Status", value: "Active" },
      ]),
      bodyHtml,
      cta: workspaceUrl ? { label: "Open workspace", url: workspaceUrl } : null,
    }),
  };
}

function buildTenantApplicationRejectedEmail({
  branding,
  contactName,
  tenantName,
  applicationReference,
  reason,
  statusUrl,
}) {
  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(contactName || "there")}, after reviewing the application for ${escapeHtml(tenantName)}, the platform team has returned it to draft so that some details can be updated.
    </p>
    ${renderSection(
      "Application details",
      renderKeyValueRows([
        { label: "Organisation", value: tenantName },
        ...(applicationReference
          ? [{ label: "Reference", value: applicationReference }]
          : []),
        { label: "Returned", value: formatDateTime(Date.now()) },
        { label: "Status", value: "Returned for update" },
      ]),
    )}
    ${
      reason
        ? renderSection(
            "Review note from platform team",
            `<p class="univote-body-text" style="margin: 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">${escapeHtml(reason)}</p>`,
          )
        : ""
    }
    ${renderSection(
      "Next steps",
      renderNoticeBox(
        `Please review the note above, update your application, and resubmit. If you have questions, contact support at <a href="mailto:${escapeHtml(branding.supportEmail)}" style="color: ${COLORS.green}; text-decoration: none;">${escapeHtml(branding.supportEmail)}</a>.`,
        "warning",
      ),
    )}
  `;

  return {
    subject: `Your ${tenantName} application needs updates`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `Your application for ${tenantName} has been returned for updates.`,
      badge: "Application update required",
      headline: "Your application needs updates",
      intro: `Hello ${escapeHtml(contactName || "there")}, your application for ${escapeHtml(tenantName)} has been returned. Please review the note below and resubmit.`,
      bodyHtml,
      cta: statusUrl
        ? { label: "Review application", url: statusUrl }
        : null,
    }),
  };
}

function buildTenantStatusUpdateEmail({
  branding,
  contactName,
  tenantName,
  status,
  message,
  ctaLabel,
  ctaLink,
}) {
  const statusLabel = status ? status.replace(/_/g, " ") : "updated";

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(contactName || "there")}, this is an update about your ${escapeHtml(tenantName)} organisation workspace on ${escapeHtml(branding.appName)}.
    </p>
    ${renderSection(
      "Workspace update",
      renderKeyValueRows([
        { label: "Organisation", value: tenantName },
        { label: "New status", value: statusLabel },
        { label: "Updated", value: formatDateTime(Date.now()) },
      ]),
    )}
    ${
      message
        ? renderSection(
            "Update message",
            `<p class="univote-body-text" style="margin: 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">${escapeHtml(message)}</p>`,
          )
        : ""
    }
  `;

  return {
    subject: `Workspace update — ${tenantName} is now ${statusLabel}`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `${tenantName} status has changed to ${statusLabel}.`,
      badge: "Workspace status",
      headline: `${escapeHtml(tenantName)} status updated`,
      intro: `Your organisation workspace has been updated. The current status is: ${escapeHtml(statusLabel)}.`,
      statusStripHtml: renderSummaryStrip([
        { label: "Organisation", value: tenantName },
        { label: "Status", value: statusLabel },
        { label: "Updated", value: formatDateTime(Date.now()) },
      ]),
      bodyHtml,
      cta: ctaLabel && ctaLink ? { label: ctaLabel, url: ctaLink } : null,
    }),
  };
}

module.exports = {
  buildTenantApplicationApprovedEmail,
  buildTenantApplicationRejectedEmail,
  buildTenantApplicationSubmittedEmail,
  buildTenantStatusUpdateEmail,
};
