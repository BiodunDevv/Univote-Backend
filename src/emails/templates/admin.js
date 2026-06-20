const { buildEmailShell } = require("../shell");
const {
  renderKeyValueRows,
  renderNoticeBox,
  renderSection,
  renderSummaryStrip,
} = require("../fragments");
const { escapeHtml, formatDateTime } = require("../utils");
const { COLORS, FONT_SANS } = require("../theme");

function buildAdminInvitationEmail({
  branding,
  to,
  fullName,
  roleLabel,
  password,
  signInUrl,
  platformScope,
}) {
  const scopeLabel = platformScope ? "platform" : "workspace";

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(fullName || "there")}, an administrator account has been created for you on the ${escapeHtml(branding.appName)} ${scopeLabel}.
    </p>
    ${renderSection(
      "Access details",
      renderKeyValueRows([
        { label: "Role", value: roleLabel || "Admin" },
        { label: "Email", value: to || "Your registered email" },
        { label: "Temporary password", value: password || "Provided separately" },
        { label: "Scope", value: platformScope ? "Platform-wide access" : "Organisation workspace" },
      ]),
    )}
    ${renderSection(
      "Security note",
      renderNoticeBox(
        "<strong>Action required:</strong> Sign in and change this temporary password immediately. Temporary credentials should not be stored or shared.",
        "warning",
      ),
    )}
  `;

  return {
    subject: platformScope
      ? "You have been added as a platform administrator"
      : "You have been invited as a workspace administrator",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `Your ${branding.appName} administrator account is ready. Sign in to get started.`,
      badge: platformScope ? "Platform access" : "Workspace invitation",
      headline: platformScope
        ? "You have been added as a platform admin"
        : "You have been invited as a workspace admin",
      intro: `An administrator account has been created for ${escapeHtml(fullName || "you")} on ${escapeHtml(branding.appName)}.`,
      bodyHtml,
      cta: signInUrl ? { label: "Sign in to admin portal", url: signInUrl } : null,
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
  const scopeLabel = platformScope ? "platform" : "organisation workspace";

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(fullName || "there")}, your ${escapeHtml(branding.appName)} administrator account is ready. Use the credentials below to sign in for the first time.
    </p>
    ${renderSection(
      "Credentials",
      renderKeyValueRows([
        { label: "Email", value: to || "Your registered email" },
        { label: "Temporary password", value: temporaryPassword || "Provided separately" },
        { label: "Role", value: roleLabel || "Admin" },
        { label: "Access scope", value: platformScope ? "Platform-wide" : scopeLabel },
      ]),
    )}
    ${renderSection(
      "Important",
      renderNoticeBox(
        "<strong>You must change this password on first sign-in.</strong> You will be prompted to set a permanent password before accessing the portal.",
        "warning",
      ),
    )}
  `;

  return {
    subject: platformScope
      ? `Welcome to the ${branding.appName} platform`
      : `Your ${branding.appName} admin account is ready`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `Your ${branding.appName} administrator account is ready. Sign in to get started.`,
      badge: platformScope ? "Platform access" : "Account created",
      headline: platformScope
        ? `Welcome to the ${escapeHtml(branding.appName)} platform`
        : "Your admin account is ready",
      intro: `Hello ${escapeHtml(fullName || "there")}, your administrator account has been set up. You can sign in immediately using the temporary credentials below.`,
      bodyHtml,
      cta: loginUrl ? { label: "Sign in to portal", url: loginUrl } : null,
    }),
  };
}

function buildProviderAlertEmail({
  branding,
  recipientName,
  providerName,
  message,
  ctaLink,
}) {
  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      ${recipientName ? `Hello ${escapeHtml(recipientName)}, a` : "A"} platform biometric provider requires your attention.
    </p>
    ${renderSection(
      "Provider details",
      renderKeyValueRows([
        { label: "Provider", value: providerName || "Unknown provider" },
        { label: "Alert time", value: formatDateTime(Date.now()) },
        { label: "Status", value: "Requires review" },
      ]),
    )}
    ${renderSection(
      "Alert message",
      `<p class="univote-body-text" style="margin: 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">${escapeHtml(message || "No additional detail provided.")}</p>`,
    )}
    ${renderSection(
      "Action required",
      renderNoticeBox(
        "Review the provider configuration in platform settings and resolve any outstanding issues to restore normal operation.",
        "warning",
      ),
    )}
  `;

  return {
    subject: `Provider alert — ${providerName || "biometric provider"} requires attention`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `${providerName || "A biometric provider"} on the ${branding.appName} platform requires review.`,
      badge: "Provider alert",
      headline: `${escapeHtml(providerName || "Biometric provider")} requires attention`,
      intro: "A platform provider has flagged an issue that requires administrator review.",
      statusStripHtml: renderSummaryStrip([
        { label: "Provider", value: providerName || "Unknown" },
        { label: "Logged", value: formatDateTime(Date.now()) },
      ]),
      bodyHtml,
      cta: ctaLink ? { label: "Open platform settings", url: ctaLink } : null,
    }),
  };
}

function buildOperationalTestEmail({ branding, senderName, senderEmail }) {
  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      This message confirms that the ${escapeHtml(branding.appName)} transactional email transport is correctly configured and operational.
    </p>
    ${renderSection(
      "Transport details",
      renderKeyValueRows([
        { label: "Sent by", value: senderName || "System" },
        { label: "Sender email", value: senderEmail || "noreply@univote.com" },
        { label: "Provider", value: "Brevo (transactional)" },
        { label: "Timestamp", value: formatDateTime(Date.now()) },
      ]),
    )}
    ${renderSection(
      "Status",
      renderNoticeBox(
        "Email delivery path is active. This test was dispatched through the configured Brevo transport and reached the recipient inbox successfully.",
        "success",
      ),
    )}
  `;

  return {
    subject: `${branding.appName} — transactional email test`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: "Email transport is configured and operational.",
      badge: "Configuration test",
      headline: "Email transport is operational",
      intro: "This is a test message sent to verify that transactional email delivery is working correctly.",
      statusStripHtml: renderSummaryStrip([
        { label: "Transport", value: "Brevo" },
        { label: "Status", value: "Delivered" },
        { label: "Sent at", value: formatDateTime(Date.now()) },
      ]),
      bodyHtml,
    }),
  };
}

module.exports = {
  buildAdminInvitationEmail,
  buildAdminWelcomeEmail,
  buildOperationalTestEmail,
  buildProviderAlertEmail,
};
