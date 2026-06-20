const { buildEmailShell } = require("../shell");
const {
  renderCodeBlock,
  renderKeyValueRows,
  renderNoticeBox,
  renderSection,
  renderSummaryStrip,
} = require("../fragments");
const { escapeHtml, formatDateTime } = require("../utils");
const { COLORS, FONT_SANS } = require("../theme");

function buildWelcomeEmail({ branding, student }) {
  const recipientName = student.full_name || "student";
  const identifier =
    student.matric_no || student.display_identifier || student.email || "Available after sign in";
  const orgName = branding.appName || "your university";

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(recipientName)}, your ${escapeHtml(orgName)} voting account has been verified and is now active.
    </p>
    ${renderSection(
      "Account details",
      renderKeyValueRows([
        { label: "Name", value: recipientName },
        { label: "Identifier", value: identifier },
        { label: "Email", value: student.email || "Your registered email" },
        { label: "Activated", value: formatDateTime(Date.now()) },
      ]),
    )}
    ${renderSection(
      "Next steps",
      renderNoticeBox(
        "Sign in to your student portal to view active elections, cast your vote, and check published results.",
        "success",
      ),
    )}
  `;

  return {
    subject: `Welcome to ${branding.appName} — your account is active`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: "Your account is verified and ready to use.",
      badge: "Account activated",
      headline: "Your account is ready",
      intro: `Your ${escapeHtml(orgName)} voting portal account is verified and active. Sign in to get started.`,
      bodyHtml,
      cta: student?.ctaUrl
        ? { label: student.ctaLabel || "Sign in to portal", url: student.ctaUrl }
        : null,
    }),
  };
}

function buildStudentAccountCreatedEmail({
  branding,
  student,
  temporaryPassword,
}) {
  const recipientName = student.full_name || "student";
  const matricNumber = student.matric_no || "Not provided";
  const orgName = branding.appName || "your university";

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(recipientName)}, an account has been created for you on the ${escapeHtml(orgName)} voting portal. Use the credentials below to sign in.
    </p>
    ${renderSection(
      "Sign-in details",
      renderKeyValueRows([
        { label: "Organisation", value: orgName },
        { label: "Matric number", value: matricNumber },
        { label: "Email", value: student.email || "Your registered email" },
        { label: "Temporary password", value: temporaryPassword },
      ]),
    )}
    ${renderSection(
      "Security note",
      renderNoticeBox(
        "<strong>Action required:</strong> You will be prompted to set a new password the first time you sign in. Do not share your temporary password with anyone.",
        "warning",
      ),
    )}
  `;

  return {
    subject: `Your ${branding.appName} student account is ready`,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: "Your student voting account has been created. Sign in to get started.",
      badge: "Account created",
      headline: "Your voting account is ready",
      intro: `An account has been created for you on the ${escapeHtml(orgName)} student portal. Use the temporary password below to sign in.`,
      bodyHtml,
      cta: student?.ctaUrl
        ? { label: "Sign in to student portal", url: student.ctaUrl }
        : null,
    }),
  };
}

function buildNewDeviceAlertEmail({ branding, student, deviceInfo }) {
  const recipientName = student.full_name || "student";
  const orgName = branding.appName || "your university";

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(recipientName)}, we detected a sign-in from a device not previously associated with your account.
    </p>
    ${renderSection(
      "Activity details",
      renderKeyValueRows([
        { label: "Account", value: student.full_name || student.email || "Your account" },
        { label: "Organisation", value: orgName },
        { label: "Device", value: deviceInfo || "Unknown device" },
        { label: "Time", value: formatDateTime(Date.now()) },
      ]),
    )}
    ${renderSection(
      "What to do",
      renderNoticeBox(
        "<strong>If this was you:</strong> No action is needed. Your account is safe.<br/><br/><strong>If this was not you:</strong> Reset your password immediately and contact your institution's support team.",
        "warning",
      ),
    )}
  `;

  return {
    subject: "New device sign-in detected on your account",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: "We noticed a sign-in from a new device on your account.",
      badge: "Security alert",
      headline: "New device sign-in detected",
      intro: "A sign-in was recorded from a device that is not part of your recent activity.",
      bodyHtml,
    }),
  };
}

function buildPasswordResetEmail({
  branding,
  audience,
  email,
  recipientName,
  resetCode,
}) {
  const badge = audience === "admin" ? "Admin security" : "Password reset";
  const headline =
    audience === "admin"
      ? "Reset your administrator password"
      : "Reset your account password";
  const intro =
    audience === "admin"
      ? "We received a password reset request for an administrator account on this platform."
      : `We received a password reset request for your ${escapeHtml(branding.appName || "Univote")} participant account.`;
  const helper =
    audience === "admin"
      ? "This code expires in 1 hour. If you did not request this reset, review your sign-in activity and contact platform support immediately."
      : "This code expires in 1 hour. If you did not request a password reset, you can safely ignore this message.";
  const greeting = recipientName
    ? `Hello ${escapeHtml(recipientName)},`
    : "Hello,";

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">${greeting}</p>
    ${renderSection(
      "Verification code",
      renderCodeBlock(
        resetCode,
        "Enter this code on the password reset page. It expires in 1 hour.",
      ),
      { titleAlign: "center" },
    )}
    ${renderSection(
      "Security note",
      `<p class="univote-body-text" style="margin: 0 0 10px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">${escapeHtml(helper)}</p>
      ${renderNoticeBox(
        `This reset was requested for <strong>${escapeHtml(email || "your registered email")}</strong>.`,
        audience === "admin" ? "warning" : "success",
      )}`,
    )}
  `;

  return {
    subject:
      audience === "admin"
        ? "Admin password reset code"
        : "Your password reset code",
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: `${resetCode} is your ${branding.appName || "Univote"} verification code. Valid for 1 hour.`,
      badge,
      headline,
      intro,
      bodyHtml,
      cta:
        audience !== "admin" && email && branding?.resetPasswordUrl
          ? { label: "Reset password", url: branding.resetPasswordUrl }
          : branding?.signInUrl
            ? {
                label: audience === "admin" ? "Sign in to admin portal" : "Back to sign in",
                url: branding.signInUrl,
              }
            : null,
    }),
  };
}

module.exports = {
  buildNewDeviceAlertEmail,
  buildPasswordResetEmail,
  buildStudentAccountCreatedEmail,
  buildWelcomeEmail,
};
