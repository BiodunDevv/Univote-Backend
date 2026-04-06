const { buildEmailShell } = require("../shell");
const {
  renderCodeBlock,
  renderKeyValueRows,
  renderNoticeBox,
  renderSection,
  renderSummaryStrip,
} = require("../fragments");
const { escapeHtml, formatDateTime } = require("../utils");

function buildWelcomeEmail({ branding, student }) {
  const identifier = student.matric_no || student.email || "Available on sign in page";
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.8;color:#233126;">Hello ${escapeHtml(
      student.full_name,
    )}, your account has been activated successfully.</p>
    ${renderSection(
      "Account details",
      renderKeyValueRows([
        { label: "Identifier", value: identifier },
        { label: "Email", value: student.email || "Not provided" },
        { label: "Activated", value: formatDateTime(Date.now()) },
      ]),
    )}
  `;

  return {
    subject: "Welcome to Univote",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: "Your Univote account is ready.",
      badge: "Account activated",
      headline: "Welcome to your portal",
      intro:
        "Your account is ready. You can now sign in and manage your participation securely.",
      bodyHtml,
    }),
  };
}

function buildNewDeviceAlertEmail({ branding, student, deviceInfo }) {
  return {
    subject: "New device sign-in detected",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: "We noticed a sign-in from a new device.",
      badge: "Security alert",
      headline: "New device sign-in detected",
      intro:
        "We noticed a sign-in from a device that does not match your recent activity.",
      bodyHtml: renderSection(
        "Activity details",
        renderKeyValueRows([
          { label: "Account", value: student.full_name },
          { label: "Device", value: deviceInfo || "Unknown device" },
          { label: "Time", value: formatDateTime(Date.now()) },
        ]),
      ),
      footerNoteHtml:
        "<p style=\"margin:0;font-size:13px;line-height:1.8;color:#687567;\">If this was not you, reset your password immediately and contact support.</p>",
    }),
  };
}

function buildPasswordResetEmail({ branding, audience, email, recipientName, resetCode }) {
  const badge = audience === "admin" ? "Admin security" : "Password reset";
  const headline =
    audience === "admin"
      ? "Use this code to reset your admin password"
      : "Use this code to reset your password";
  const intro =
    audience === "admin"
      ? "We received a password reset request for an administrator account."
      : "We received a password reset request for your participant account.";
  const helper =
    audience === "admin"
      ? "This code expires in one hour. If you did not request this reset, review your sign-in history and contact support."
      : "This code expires in one hour. If you did not request a password reset, you can ignore this message.";
  const greeting = recipientName ? `Hello ${escapeHtml(recipientName)},` : "Hello,";

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.8;color:#233126;">${greeting}</p>
    ${renderSection("Verification code", renderCodeBlock(resetCode))}
    ${renderSection(
      "Security note",
      `<p style="margin:0;font-size:14px;line-height:1.8;color:#233126;">${escapeHtml(
        helper,
      )}</p>${renderNoticeBox(
        `This reset was requested for ${escapeHtml(email)}.`,
        audience === "admin" ? "warning" : "success",
      )}`,
    )}
  `;

  return {
    subject:
      audience === "admin"
        ? "Admin password reset code"
        : "Participant password reset code",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `${resetCode} is your Univote verification code.`,
      badge,
      headline,
      intro,
      bodyHtml,
    }),
  };
}

module.exports = {
  buildNewDeviceAlertEmail,
  buildPasswordResetEmail,
  buildWelcomeEmail,
};
