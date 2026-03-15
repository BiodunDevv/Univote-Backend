const SibApiV3Sdk = require("@sendinblue/client");
const {
  escapeHtml,
  formatDateTime,
  renderKeyValueRows,
  renderList,
  renderMessageCard,
  stripHtml,
} = require("../emails");

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

  renderList(items = []) {
    return renderList(items);
  }

  renderKeyValueRows(rows = []) {
    return renderKeyValueRows(rows);
  }

  renderMessageCard({ tenant = null, ...rest }) {
    return renderMessageCard({
      branding: this.getBranding(tenant),
      ...rest,
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
    applicationReference = null,
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
          ...(applicationReference
            ? [{ label: "Reference", value: applicationReference }]
            : []),
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

  async sendTenantApplicationPaymentRequired({
    to,
    contactName,
    tenantName,
    planCode,
    checkoutUrl = null,
    applicationReference = null,
    amountLabel = null,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Payment required",
      title: "Complete payment to continue onboarding",
      intro: `Hello ${escapeHtml(
        contactName || "there",
      )}, your organisation application has been captured and is waiting for billing confirmation.`,
      ctaLabel: checkoutUrl ? "Continue payment" : null,
      ctaLink: checkoutUrl || null,
      sections: [
        this.renderKeyValueRows([
          { label: "Organisation", value: tenantName },
          { label: "Plan", value: planCode },
          ...(applicationReference
            ? [{ label: "Reference", value: applicationReference }]
            : []),
          ...(amountLabel ? [{ label: "Payable", value: amountLabel }] : []),
        ]),
        `<p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#475569;">Once payment is confirmed, the application moves into platform review automatically.</p>`,
      ],
    });

    return this.dispatch({
      to,
      subject: "Complete payment to continue onboarding",
      html,
      critical: false,
    });
  }

  async sendTenantApplicationApproved({
    to,
    contactName,
    tenantName,
    applicationReference = null,
    workspaceUrl = null,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Application approved",
      title: "Your workspace is now approved",
      intro: `Hello ${escapeHtml(
        contactName || "there",
      )}, ${escapeHtml(tenantName)} has passed platform review and is ready to use.`,
      ctaLabel: workspaceUrl ? "Open workspace" : null,
      ctaLink: workspaceUrl || null,
      sections: [
        this.renderKeyValueRows([
          { label: "Organisation", value: tenantName },
          ...(applicationReference
            ? [{ label: "Reference", value: applicationReference }]
            : []),
          { label: "Approved", value: formatDateTime(Date.now()) },
        ]),
      ],
    });

    return this.dispatch({
      to,
      subject: "Your organisation workspace has been approved",
      html,
      critical: false,
    });
  }

  async sendTenantApplicationRejected({
    to,
    contactName,
    tenantName,
    applicationReference = null,
    reason = null,
    statusUrl = null,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Application update",
      title: "Your application needs changes",
      intro: `Hello ${escapeHtml(
        contactName || "there",
      )}, the platform team returned ${escapeHtml(
        tenantName,
      )} to draft so the submitted details can be updated.`,
      ctaLabel: statusUrl ? "Review application status" : null,
      ctaLink: statusUrl || null,
      sections: [
        this.renderKeyValueRows([
          { label: "Organisation", value: tenantName },
          ...(applicationReference
            ? [{ label: "Reference", value: applicationReference }]
            : []),
        ]),
        reason
          ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.8;color:#334155;"><strong>Review note:</strong> ${escapeHtml(
              reason,
            )}</p>`
          : "",
      ].filter(Boolean),
    });

    return this.dispatch({
      to,
      subject: "Your application needs changes",
      html,
      critical: false,
    });
  }

  async sendTenantPaymentConfirmed({
    to,
    recipientName,
    tenant = null,
    invoiceNumber,
    applicationReference = null,
    workspaceUrl = null,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Payment confirmed",
      title: "Your payment was received",
      intro: recipientName
        ? `Hello ${escapeHtml(recipientName)}, payment for your organisation has been confirmed.`
        : "Payment for your organisation has been confirmed.",
      tenant,
      ctaLabel: workspaceUrl ? "Open workspace" : null,
      ctaLink: workspaceUrl || null,
      sections: [
        this.renderKeyValueRows([
          { label: "Invoice", value: invoiceNumber || "Pending reference" },
          ...(applicationReference
            ? [{ label: "Reference", value: applicationReference }]
            : []),
          { label: "Processed", value: formatDateTime(Date.now()) },
        ]),
      ],
    });

    return this.dispatch({
      to,
      subject: "Payment confirmed",
      html,
      tenant,
      critical: false,
    });
  }

  async sendTenantPaymentFailed({
    to,
    recipientName,
    tenant = null,
    invoiceNumber,
    retryUrl = null,
    applicationReference = null,
  }) {
    const html = this.renderMessageCard({
      eyebrow: "Payment failed",
      title: "We could not complete your payment",
      intro: recipientName
        ? `Hello ${escapeHtml(recipientName)}, the latest payment attempt for your organisation did not complete successfully.`
        : "The latest payment attempt for your organisation did not complete successfully.",
      tenant,
      ctaLabel: retryUrl ? "Retry payment" : null,
      ctaLink: retryUrl || null,
      sections: [
        this.renderKeyValueRows([
          { label: "Invoice", value: invoiceNumber || "Pending reference" },
          ...(applicationReference
            ? [{ label: "Reference", value: applicationReference }]
            : []),
        ]),
        `<p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#475569;">You can retry payment from the billing workspace or the public application status page.</p>`,
      ],
    });

    return this.dispatch({
      to,
      subject: "Payment attempt failed",
      html,
      tenant,
      critical: false,
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
