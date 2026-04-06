const { buildEmailShell } = require("../shell");
const {
  renderKeyValueRows,
  renderNoticeBox,
  renderSection,
  renderSummaryStrip,
} = require("../fragments");
const { escapeHtml, formatDateTime } = require("../utils");

function buildAdminInvitationEmail({
  branding,
  to,
  fullName,
  roleLabel,
  password,
  signInUrl,
  platformScope,
}) {
  return {
    subject: platformScope ? "Platform admin invitation" : "Tenant admin invitation",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: "Your Univote administrator account has been created.",
      badge: platformScope ? "Platform access" : "Workspace invitation",
      headline: platformScope
        ? "You were added as a platform admin"
        : "You were invited as a tenant admin",
      intro: `An administrator account has been created for ${escapeHtml(fullName)}.`,
      bodyHtml: `
        ${renderSection(
          "Access details",
          renderKeyValueRows([
            { label: "Role", value: roleLabel || "Admin" },
            { label: "Email", value: to },
            { label: "Temporary password", value: password || "Provided separately" },
          ]),
        )}
      `,
      cta: signInUrl ? { label: "Open sign in", url: signInUrl } : null,
      footerNoteHtml:
        "<p style=\"margin:0;font-size:13px;line-height:1.8;color:#687567;\">For security, sign in and rotate this password as soon as possible.</p>",
    }),
  };
}

function buildAdminWelcomeEmail({
  branding,
  to,
  fullName,
  temporaryPassword,
  loginUrl,
  roleLabel,
  platformScope,
}) {
  return {
    subject: platformScope
      ? "Welcome to Univote platform"
      : "Your Univote admin account is ready",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: "Your Univote administrator account is ready.",
      badge: platformScope ? "Platform access" : "Account created",
      headline: platformScope
        ? "Welcome to the Univote platform"
        : "Your admin account is ready",
      intro: `Hello ${escapeHtml(
        fullName,
      )}, your administrator account has been created. You can sign in immediately using your temporary credentials below.`,
      bodyHtml: `
        ${renderSection(
          "Credentials",
          renderKeyValueRows([
            { label: "Email", value: to },
            { label: "Temporary password", value: temporaryPassword },
            { label: "Role", value: roleLabel },
          ]),
        )}
        ${renderSection(
          "Important",
          renderNoticeBox(
            "<strong>Important:</strong> For security, you must change this temporary password immediately after signing in. You will be prompted to set a new password on your first login.",
            "warning",
          ),
        )}
      `,
      cta: loginUrl ? { label: "Sign in now", url: loginUrl } : null,
      footerNoteHtml:
        "<p style=\"margin:0;font-size:13px;line-height:1.8;color:#687567;\">If you did not expect this account, or have questions, contact your organization administrator.</p>",
    }),
  };
}

function buildProviderAlertEmail({ branding, recipientName, providerName, message, ctaLink }) {
  return {
    subject: `${providerName} provider alert`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `${providerName} requires platform attention.`,
      badge: "Biometric provider alert",
      headline: `${providerName} needs attention`,
      intro: recipientName
        ? `Hello ${escapeHtml(recipientName)}, a platform biometric provider requires review.`
        : "A platform biometric provider requires review.",
      bodyHtml: renderSection(
        "Provider alert",
        `<p style="margin:0;font-size:14px;line-height:1.8;color:#233126;">${escapeHtml(
          message,
        )}</p>`,
      ),
      cta: ctaLink ? { label: "Open platform settings", url: ctaLink } : null,
    }),
  };
}

function buildOperationalTestEmail({ branding, senderName, senderEmail }) {
  return {
    subject: "Transactional email test",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: "This confirms that the email transport is configured correctly.",
      badge: "Configuration test",
      headline: "Transactional email test",
      intro: "This confirms that the email transport is configured correctly.",
      statusStripHtml: renderSummaryStrip([
        { label: "Sent by", value: `${senderName} (${senderEmail})` },
        { label: "Timestamp", value: formatDateTime(Date.now()) },
      ]),
      bodyHtml: renderSection(
        "Transport status",
        `<p style="margin:0;font-size:14px;line-height:1.8;color:#233126;">Your Brevo transport completed the configured notification test path successfully.</p>`,
      ),
    }),
  };
}

module.exports = {
  buildAdminInvitationEmail,
  buildAdminWelcomeEmail,
  buildOperationalTestEmail,
  buildProviderAlertEmail,
};
