const { buildEmailShell } = require("../shell");
const {
  renderKeyValueRows,
  renderSection,
} = require("../fragments");
const { escapeHtml, formatDateTime } = require("../utils");

function buildTenantApplicationSubmittedEmail({
  branding,
  contactName,
  tenantName,
  applicationReference,
  recipientType = "contact",
}) {
  const isPlatformRecipient = recipientType === "platform_admin";
  return {
    subject: isPlatformRecipient
      ? `New organisation application - ${tenantName}`
      : "Organisation application submitted",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `${tenantName} has entered the onboarding pipeline.`,
      badge: isPlatformRecipient ? "Onboarding queue" : "Application received",
      headline: isPlatformRecipient
        ? "A new organisation application is ready for review"
        : "Your organisation setup has started",
      intro: isPlatformRecipient
        ? `Hello ${escapeHtml(contactName || "team")}, ${escapeHtml(
            tenantName,
          )} has entered the onboarding pipeline.`
        : `${escapeHtml(
            tenantName,
          )} has been captured and entered into the onboarding pipeline.`,
      bodyHtml: `
        ${renderSection(
          "Application details",
          renderKeyValueRows([
            { label: "Organisation", value: tenantName },
            ...(applicationReference
              ? [{ label: "Reference", value: applicationReference }]
              : []),
            { label: "Submitted", value: formatDateTime(Date.now()) },
          ]),
        )}
        ${renderSection(
          isPlatformRecipient ? "Review note" : "Next steps",
          `<p style="margin:0;font-size:14px;line-height:1.8;color:#233126;">${
            isPlatformRecipient
              ? "The platform team should validate onboarding details and continue provisioning after review."
              : `Hello ${escapeHtml(
                  contactName || "there",
                )}, review updates will be sent here as your workspace moves through approval.`
          }</p>`,
        )}
      `,
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
  return {
    subject: "Your organisation workspace has been approved",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `${tenantName} has been approved and is ready to use.`,
      badge: "Application approved",
      headline: "Your workspace is now approved",
      intro: `Hello ${escapeHtml(
        contactName || "there",
      )}, ${escapeHtml(tenantName)} has passed platform review and is ready to use.`,
      bodyHtml: renderSection(
        "Approval details",
        renderKeyValueRows([
          { label: "Organisation", value: tenantName },
          ...(applicationReference
            ? [{ label: "Reference", value: applicationReference }]
            : []),
          { label: "Approved", value: formatDateTime(Date.now()) },
        ]),
      ),
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
  return {
    subject: "Your application needs changes",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `${tenantName} was returned for updates.`,
      badge: "Application update",
      headline: "Your application needs changes",
      intro: `Hello ${escapeHtml(
        contactName || "there",
      )}, the platform team returned ${escapeHtml(
        tenantName,
      )} to draft so the submitted details can be updated.`,
      bodyHtml: `
        ${renderSection(
          "Application details",
          renderKeyValueRows([
            { label: "Organisation", value: tenantName },
            ...(applicationReference
              ? [{ label: "Reference", value: applicationReference }]
              : []),
          ]),
        )}
        ${
          reason
            ? renderSection(
                "Review note",
                `<p style="margin:0;font-size:14px;line-height:1.8;color:#233126;">${escapeHtml(
                  reason,
                )}</p>`,
              )
            : ""
        }
      `,
      cta: statusUrl ? { label: "Review application status", url: statusUrl } : null,
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
  return {
    subject: `Tenant update - ${tenantName}`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `${tenantName} status changed to ${status.replace(/_/g, " ")}.`,
      badge: "Tenant lifecycle",
      headline: `${tenantName} is now ${status.replace(/_/g, " ")}`,
      intro: `Hello ${escapeHtml(
        contactName || "there",
      )}, this is an update about your organisation workspace.`,
      bodyHtml: renderSection(
        "Update message",
        `<p style="margin:0;font-size:14px;line-height:1.8;color:#233126;">${escapeHtml(
          message,
        )}</p>`,
      ),
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
