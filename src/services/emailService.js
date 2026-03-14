const SibApiV3Sdk = require("@sendinblue/client");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  return new Date(value || Date.now()).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "").trim();
}

class EmailService {
  constructor() {
    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const apiKey = this.apiInstance.authentications["apiKey"];
    apiKey.apiKey = process.env.BREVO_API_KEY;

    this.fromName = process.env.EMAIL_FROM_NAME || "Univote";
    this.fromEmail = process.env.EMAIL_FROM_EMAIL || "noreply@univote.com";
    this.defaultLogoUrl = process.env.EMAIL_LOGO_URL || null;
    this.defaultSupportEmail =
      process.env.EMAIL_SUPPORT_EMAIL || this.fromEmail || "support@univote.com";

    console.log("📧 Brevo Email Service initialized");
  }

  getBranding(tenant = null) {
    const primaryColor = tenant?.branding?.primary_color || "#0f172a";
    const accentColor = tenant?.branding?.accent_color || "#1d4ed8";
    const appName = tenant?.name || this.fromName;
    const logoUrl = tenant?.branding?.logo_url || this.defaultLogoUrl;
    const supportEmail =
      tenant?.branding?.support_email || this.defaultSupportEmail;

    return {
      appName,
      logoUrl,
      primaryColor,
      accentColor,
      supportEmail,
    };
  }

  canSendForTenant(tenant = null, { critical = false } = {}) {
    if (critical) return true;
    return tenant?.settings?.notifications?.email_enabled !== false;
  }

  renderList(items = []) {
    if (!items.length) return "";
    return `
      <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.7;">
        ${items
          .map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`)
          .join("")}
      </ul>
    `;
  }

  renderKeyValueRows(rows = []) {
    if (!rows.length) return "";
    return `
      <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#ffffff;">
        ${rows
          .map(
            (row, index) => `
              <div style="display:flex;justify-content:space-between;gap:16px;padding:12px 14px;${
                index < rows.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""
              }">
                <span style="font-size:12px;color:#64748b;">${escapeHtml(row.label)}</span>
                <span style="font-size:12px;color:#0f172a;font-weight:600;text-align:right;">${escapeHtml(row.value)}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  renderMessageCard({
    eyebrow,
    title,
    intro,
    sections = [],
    ctaLabel,
    ctaLink,
    footnote,
    tenant = null,
  }) {
    const branding = this.getBranding(tenant);

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${escapeHtml(title)}</title>
        </head>
        <body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;">
            <tr>
              <td style="padding-bottom:16px;">
                <div style="border:1px solid #e2e8f0;border-radius:24px;background:linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.accentColor} 100%);padding:24px;color:#ffffff;">
                  <div style="display:flex;align-items:center;gap:14px;">
                    ${
                      branding.logoUrl
                        ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(
                            branding.appName,
                          )}" style="height:40px;width:40px;border-radius:12px;object-fit:cover;background:rgba(255,255,255,0.12);" />`
                        : `<div style="height:40px;width:40px;border-radius:12px;background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;">U</div>`
                    }
                    <div>
                      <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;">
                        ${escapeHtml(eyebrow || "Transactional update")}
                      </p>
                      <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;font-weight:700;">
                        ${escapeHtml(title)}
                      </h1>
                    </div>
                  </div>
                  ${
                    intro
                      ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.92);">${escapeHtml(
                          intro,
                        )}</p>`
                      : ""
                  }
                </div>
              </td>
            </tr>
            <tr>
              <td>
                <div style="border:1px solid #e2e8f0;border-radius:24px;background:#ffffff;padding:24px;">
                  ${sections.join("")}
                  ${
                    ctaLabel && ctaLink
                      ? `<div style="margin-top:20px;">
                          <a href="${escapeHtml(
                            ctaLink,
                          )}" style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:${branding.primaryColor};color:#ffffff;text-decoration:none;padding:12px 18px;font-size:13px;font-weight:600;">
                            ${escapeHtml(ctaLabel)}
                          </a>
                        </div>`
                      : ""
                  }
                  ${
                    footnote
                      ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.7;color:#64748b;">${escapeHtml(
                          footnote,
                        )}</p>`
                      : ""
                  }
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 4px 0;">
                <p style="margin:0;font-size:11px;line-height:1.7;color:#64748b;text-align:center;">
                  ${escapeHtml(branding.appName)} · ${escapeHtml(
                    branding.supportEmail,
                  )} · ${new Date().getFullYear()}
                </p>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  async sendEmail(to, subject, html, text = null) {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;
    sendSmtpEmail.textContent = text || stripHtml(html);
    await this.apiInstance.sendTransacEmail(sendSmtpEmail);
    return { success: true };
  }

  async dispatch({ to, subject, html, text, tenant = null, critical = false }) {
    if (!to) return { skipped: true };
    if (!this.canSendForTenant(tenant, { critical })) {
      return { skipped: true, reason: "tenant_email_disabled" };
    }

    try {
      await this.sendEmail(to, subject, html, text);
      console.log(`✅ Email sent to ${to}`);
      return { success: true };
    } catch (error) {
      console.error(`Error sending email to ${to}:`, error);
      throw error;
    }
  }

  async sendWelcomeEmail(student, tenant = null) {
    const identifier =
      student.member_id ||
      student.matric_no ||
      student.employee_id ||
      student.username ||
      student.email;
    const html = this.renderMessageCard({
      eyebrow: "Account activated",
      title: "Welcome to your portal",
      intro: `Your account is ready. You can now sign in and manage your participation securely.`,
      tenant,
      sections: [
        `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155;">Hello ${escapeHtml(
          student.full_name,
        )}, your account has been activated successfully.</p>`,
        this.renderKeyValueRows([
          { label: "Identifier", value: identifier || "Available on sign in page" },
          { label: "Email", value: student.email || "Not provided" },
          { label: "Activated", value: formatDateTime(Date.now()) },
        ]),
      ],
    });

    return this.dispatch({
      to: student.email,
      subject: "Welcome to Univote",
      html,
      tenant,
      critical: false,
    });
  }

  async sendNewDeviceAlert(student, deviceInfo, tenant = null) {
    const html = this.renderMessageCard({
      eyebrow: "Security alert",
      title: "New device sign-in detected",
      intro: "We noticed a sign-in from a device that does not match your recent activity.",
      tenant,
      sections: [
        this.renderKeyValueRows([
          { label: "Account", value: student.full_name },
          { label: "Device", value: deviceInfo || "Unknown device" },
          { label: "Time", value: formatDateTime(Date.now()) },
        ]),
      ],
      footnote:
        "If this was not you, reset your password immediately and contact support.",
    });

    return this.dispatch({
      to: student.email,
      subject: "New device sign-in detected",
      html,
      tenant,
      critical: true,
    });
  }

  async sendVoteConfirmation(student, session, votes, tenant = null) {
    const html = this.renderMessageCard({
      eyebrow: "Vote recorded",
      title: `Vote confirmed for ${session.title}`,
      intro: "This is your transaction receipt for the ballot that was just accepted.",
      tenant,
      sections: [
        this.renderKeyValueRows([
          { label: "Participant", value: student.full_name },
          { label: "Session", value: session.title },
          { label: "Recorded", value: formatDateTime(Date.now()) },
        ]),
        this.renderList(
          votes.map((vote) => `${vote.position}: ${vote.candidate_name}`),
        ),
      ],
    });

    return this.dispatch({
      to: student.email,
      subject: `Vote confirmed - ${session.title}`,
      html,
      tenant,
      critical: true,
    });
  }

  async sendResultAnnouncement(
    student,
    session,
    resultsUrl,
    winners = [],
    totalVotes = 0,
    tenant = null,
  ) {
    const html = this.renderMessageCard({
      eyebrow: "Results published",
      title: `Results are live for ${session.title}`,
      intro: "The session has been completed and the official outcome is now available.",
      tenant,
      ctaLabel: resultsUrl ? "View results" : null,
      ctaLink: resultsUrl || null,
      sections: [
        this.renderKeyValueRows([
          { label: "Session", value: session.title },
          { label: "Published", value: formatDateTime(Date.now()) },
          { label: "Accepted votes", value: String(totalVotes) },
        ]),
        ...(winners.length
          ? [this.renderList(winners.map((winner) => `${winner.position}: ${winner.name}`))]
          : []),
      ],
    });

    return this.dispatch({
      to: student.email,
      subject: `Results available - ${session.title}`,
      html,
      tenant,
      critical: false,
    });
  }

  async sendPasswordReset(student, resetCode, tenant = null) {
    const html = this.renderMessageCard({
      eyebrow: "Password reset",
      title: "Use this code to reset your password",
      intro: "We received a password reset request for your participant account.",
      tenant,
      sections: [
        `<div style="border-radius:18px;background:#eff6ff;color:#1d4ed8;padding:18px;text-align:center;font-size:28px;font-weight:700;letter-spacing:0.18em;">${escapeHtml(
          resetCode,
        )}</div>`,
        `<p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#475569;">This code expires in one hour. If you did not request a password reset, you can ignore this message.</p>`,
      ],
    });

    return this.dispatch({
      to: student.email,
      subject: "Participant password reset code",
      html,
      tenant,
      critical: true,
    });
  }

  async sendAdminPasswordReset(admin, resetCode, tenant = null) {
    const html = this.renderMessageCard({
      eyebrow: "Admin security",
      title: "Use this code to reset your admin password",
      intro: "We received a password reset request for an administrator account.",
      tenant,
      sections: [
        `<div style="border-radius:18px;background:#fff7ed;color:#c2410c;padding:18px;text-align:center;font-size:28px;font-weight:700;letter-spacing:0.18em;">${escapeHtml(
          resetCode,
        )}</div>`,
        `<p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#475569;">This code expires in one hour. If you did not request this reset, review your sign-in history and contact support.</p>`,
      ],
    });

    return this.dispatch({
      to: admin.email,
      subject: "Admin password reset code",
      html,
      tenant,
      critical: true,
    });
  }

  async sendAnnouncementEmail({
    to,
    recipientName,
    title,
    body,
    ctaLabel,
    ctaLink,
    roleLabel,
    tenant = null,
  }) {
    const html = this.renderMessageCard({
      eyebrow: `${roleLabel || "System"} announcement`,
      title,
      intro: recipientName ? `Hello ${recipientName}, there is a new announcement for you.` : null,
      tenant,
      ctaLabel,
      ctaLink,
      sections: [
        `<p style="margin:0;font-size:14px;line-height:1.8;color:#334155;">${escapeHtml(
          body,
        )}</p>`,
      ],
    });

    return this.dispatch({
      to,
      subject: title,
      html,
      tenant,
      critical: false,
    });
  }

  async sendAdminInvitation({
    to,
    fullName,
    roleLabel,
    password,
    tenant = null,
    signInUrl = null,
    platformScope = false,
  }) {
    const html = this.renderMessageCard({
      eyebrow: platformScope ? "Platform access" : "Workspace invitation",
      title: platformScope ? "You were added as a platform admin" : "You were invited as a tenant admin",
      intro: `An administrator account has been created for ${escapeHtml(fullName)}.`,
      tenant,
      ctaLabel: signInUrl ? "Open sign in" : null,
      ctaLink: signInUrl || null,
      sections: [
        this.renderKeyValueRows([
          { label: "Role", value: roleLabel || "Admin" },
          { label: "Email", value: to },
          { label: "Temporary password", value: password || "Provided separately" },
        ]),
      ],
      footnote: "For security, sign in and rotate this password as soon as possible.",
    });

    return this.dispatch({
      to,
      subject: platformScope ? "Platform admin invitation" : "Tenant admin invitation",
      html,
      tenant,
      critical: true,
    });
  }

  async sendTenantApplicationSubmitted({
    to,
    contactName,
    tenantName,
    planCode,
    checkoutUrl,
    recipientType = "contact",
  }) {
    const isPlatformRecipient = recipientType === "platform_admin";
    const html = this.renderMessageCard({
      eyebrow: isPlatformRecipient ? "Onboarding queue" : "Application received",
      title: isPlatformRecipient
        ? "A new organisation application is ready for review"
        : "Your organisation setup has started",
      intro: isPlatformRecipient
        ? `Hello ${escapeHtml(contactName || "team")}, ${tenantName} has entered the onboarding pipeline.`
        : `${tenantName} has been captured and entered into the onboarding pipeline.`,
      ctaLabel: checkoutUrl ? (isPlatformRecipient ? "Review payment link" : "Continue payment") : null,
      ctaLink: checkoutUrl || null,
      sections: [
        this.renderKeyValueRows([
          { label: "Organisation", value: tenantName },
          { label: "Plan", value: planCode },
          { label: "Submitted", value: formatDateTime(Date.now()) },
        ]),
        isPlatformRecipient
          ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#475569;">The platform team should monitor payment confirmation, validate onboarding details, and continue provisioning after review.</p>`
          : `<p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#475569;">Hello ${escapeHtml(
              contactName || "there",
            )}, payment and review updates will be sent here as your workspace moves through approval.</p>`,
      ],
    });

    return this.dispatch({
      to,
      subject: isPlatformRecipient
        ? `New organisation application - ${tenantName}`
        : "Organisation application submitted",
      html,
      critical: isPlatformRecipient,
    });
  }

  async sendTenantStatusUpdate({
    to,
    contactName,
    tenantName,
    status,
    message,
    ctaLabel,
    ctaLink,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Tenant lifecycle",
      title: `${tenantName} is now ${status.replace(/_/g, " ")}`,
      intro: `Hello ${contactName || "there"}, this is an update about your organisation workspace.`,
      ctaLabel,
      ctaLink,
      sections: [
        `<p style="margin:0;font-size:14px;line-height:1.8;color:#334155;">${escapeHtml(
          message,
        )}</p>`,
      ],
    });

    return this.dispatch({
      to,
      subject: `Tenant update - ${tenantName}`,
      html,
      critical: false,
    });
  }

  async sendBillingInvoiceAvailable({
    to,
    recipientName,
    tenant = null,
    invoice,
    checkoutUrl = null,
    planName = null,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Billing",
      title: "A new invoice is ready",
      intro: recipientName ? `Hello ${recipientName}, a billing event requires your attention.` : null,
      tenant,
      ctaLabel: checkoutUrl ? "Open checkout" : null,
      ctaLink: checkoutUrl || null,
      sections: [
        this.renderKeyValueRows([
          { label: "Invoice", value: invoice.invoice_number || "Pending reference" },
          { label: "Plan", value: planName || invoice.plan_code || "Current plan" },
          { label: "Amount", value: String(invoice.amount_ngn || 0) + " NGN" },
          { label: "Status", value: invoice.status || "pending" },
        ]),
      ],
    });

    return this.dispatch({
      to,
      subject: "Billing invoice available",
      html,
      tenant,
      critical: false,
    });
  }

  async sendBillingPlanChange({
    to,
    recipientName,
    tenant = null,
    title,
    message,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Subscription update",
      title,
      intro: recipientName ? `Hello ${recipientName}, your billing plan has changed.` : null,
      tenant,
      sections: [
        `<p style="margin:0;font-size:14px;line-height:1.8;color:#334155;">${escapeHtml(
          message,
        )}</p>`,
      ],
    });

    return this.dispatch({
      to,
      subject: title,
      html,
      tenant,
      critical: false,
    });
  }

  async sendSupportTicketEmail({
    to,
    recipientName,
    tenant = null,
    subject,
    headline,
    message,
    ctaLabel,
    ctaLink,
    critical = false,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Support update",
      title: headline,
      intro: recipientName ? `Hello ${recipientName}, there is a new support activity update.` : null,
      tenant,
      ctaLabel,
      ctaLink,
      sections: [
        `<p style="margin:0;font-size:14px;line-height:1.8;color:#334155;">${escapeHtml(
          message,
        )}</p>`,
      ],
    });

    return this.dispatch({
      to,
      subject,
      html,
      tenant,
      critical,
    });
  }

  async sendProviderAlert({
    to,
    recipientName,
    providerName,
    message,
    ctaLink,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Biometric provider alert",
      title: `${providerName} needs attention`,
      intro: recipientName ? `Hello ${recipientName}, a platform biometric provider requires review.` : null,
      ctaLabel: ctaLink ? "Open platform settings" : null,
      ctaLink: ctaLink || null,
      sections: [
        `<p style="margin:0;font-size:14px;line-height:1.8;color:#334155;">${escapeHtml(
          message,
        )}</p>`,
      ],
    });

    return this.dispatch({
      to,
      subject: `${providerName} provider alert`,
      html,
      critical: true,
    });
  }

  async sendOperationalTestEmail({
    to,
    senderName,
    senderEmail,
    tenant = null,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Configuration test",
      title: "Transactional email test",
      intro: "This confirms that the email transport is configured correctly.",
      tenant,
      sections: [
        this.renderKeyValueRows([
          { label: "Sent by", value: `${senderName} (${senderEmail})` },
          { label: "Timestamp", value: formatDateTime(Date.now()) },
        ]),
      ],
    });

    return this.dispatch({
      to,
      subject: "Transactional email test",
      html,
      tenant,
      critical: true,
    });
  }
}

module.exports = new EmailService();
