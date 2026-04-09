const SibApiV3Sdk = require("@sendinblue/client");
const {
  buildAdminInvitationEmail,
  buildAdminWelcomeEmail,
  buildAnnouncementEmail,
  buildNewDeviceAlertEmail,
  buildOperationalTestEmail,
  buildPasswordResetEmail,
  buildProviderAlertEmail,
  buildResultAnnouncementEmail,
  buildSupportTicketEmail,
  buildTenantApplicationApprovedEmail,
  buildTenantApplicationRejectedEmail,
  buildTenantApplicationSubmittedEmail,
  buildTenantStatusUpdateEmail,
  buildVoteConfirmationEmail,
  buildWelcomeEmail,
  getBranding,
  stripHtml,
} = require("../emails");
const {
  buildAdminSignInUrl,
  buildApplicationStatusUrl,
  buildEmailRoute,
  buildPlatformSettingsUrl,
  buildStudentResetPasswordUrl,
  buildStudentResultsUrl,
  buildStudentSignInUrl,
  buildStudentSubmittedBallotUrl,
  buildStudentSupportUrl,
  buildTenantWorkspaceUrl,
} = require("../emails/routes");

class EmailService {
  constructor() {
    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const apiKey = this.apiInstance.authentications["apiKey"];
    apiKey.apiKey = process.env.BREVO_API_KEY;

    this.fromName = process.env.EMAIL_FROM_NAME || "Univote";
    this.fromEmail = process.env.EMAIL_FROM_EMAIL || "noreply@univote.com";
    this.publicAppUrl =
      process.env.FRONTEND_URL ||
      process.env.PUBLIC_APP_URL ||
      "http://localhost:3000";
    this.defaultSupportEmail =
      process.env.EMAIL_SUPPORT_EMAIL ||
      this.fromEmail ||
      "support@univote.com";

    console.log("📧 Brevo Email Service initialized");
  }

  getBranding(tenant = null) {
    const branding = getBranding(tenant, {
      fromName: this.fromName,
      fromEmail: this.fromEmail,
      supportEmail: this.defaultSupportEmail,
    });
    return {
      ...branding,
      signInUrl: buildAdminSignInUrl({
        tenantDomain: tenant?.primary_domain || null,
      }),
      resetPasswordUrl: buildStudentResetPasswordUrl({
        organization: tenant?.slug || null,
      }),
    };
  }

  resolveAppUrl(path) {
    return buildEmailRoute(path);
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
    const { html, subject } = buildWelcomeEmail({
      branding: this.getBranding(tenant),
      student: {
        ...student,
        ctaUrl: buildStudentSignInUrl({ organization: tenant?.slug || null }),
      },
    });

    return this.dispatch({
      to: student.email,
      subject,
      html,
      tenant,
      critical: false,
    });
  }

  async sendNewDeviceAlert(student, deviceInfo, tenant = null) {
    const { html, subject } = buildNewDeviceAlertEmail({
      branding: this.getBranding(tenant),
      student,
      deviceInfo,
    });

    return this.dispatch({
      to: student.email,
      subject,
      html,
      tenant,
      critical: true,
    });
  }

  async sendVoteConfirmation(student, session, votes, tenant = null) {
    const { html, subject } = buildVoteConfirmationEmail({
      branding: this.getBranding(tenant),
      student,
      session,
      votes,
      ballotUrl:
        buildStudentSubmittedBallotUrl(session?._id || session?.id || null) ||
        buildStudentResultsUrl(session?._id || session?.id || null),
    });

    return this.dispatch({
      to: student.email,
      subject,
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
    const resolvedResultsUrl =
      resultsUrl ||
      buildStudentResultsUrl(session?._id || session?.id || null);
    const { html, subject } = buildResultAnnouncementEmail({
      branding: this.getBranding(tenant),
      student,
      session,
      resultsUrl: resolvedResultsUrl,
      winners,
      totalVotes,
    });

    return this.dispatch({
      to: student.email,
      subject,
      html,
      tenant,
      critical: false,
    });
  }

  async sendPasswordReset(student, resetCode, tenant = null) {
    const { html, subject } = buildPasswordResetEmail({
      branding: {
        ...this.getBranding(tenant),
        resetPasswordUrl: buildStudentResetPasswordUrl({
          organization: tenant?.slug || null,
          email: student.email,
        }),
        signInUrl: buildStudentSignInUrl({ organization: tenant?.slug || null }),
      },
      audience: "student",
      email: student.email,
      recipientName: student.full_name,
      resetCode,
    });

    return this.dispatch({
      to: student.email,
      subject,
      html,
      tenant,
      critical: true,
    });
  }

  async sendAdminPasswordReset(admin, resetCode, tenant = null) {
    const { html, subject } = buildPasswordResetEmail({
      branding: {
        ...this.getBranding(tenant),
        signInUrl: buildAdminSignInUrl({
          tenantDomain: tenant?.primary_domain || null,
        }),
      },
      audience: "admin",
      email: admin.email,
      recipientName: admin.full_name,
      resetCode,
    });

    return this.dispatch({
      to: admin.email,
      subject,
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
    const resolvedCtaLink = buildEmailRoute(ctaLink) || buildStudentSignInUrl({
      organization: tenant?.slug || null,
    });
    const { html, subject } = buildAnnouncementEmail({
      branding: this.getBranding(tenant),
      recipientName,
      title,
      body,
      ctaLabel: ctaLabel || "Sign in to portal",
      ctaLink: resolvedCtaLink,
      roleLabel,
    });

    return this.dispatch({
      to,
      subject,
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
    const resolvedSignInUrl =
      buildEmailRoute(signInUrl) ||
      buildAdminSignInUrl({
        tenantDomain: !platformScope ? tenant?.primary_domain || null : null,
      });
    const { html, subject } = buildAdminInvitationEmail({
      branding: this.getBranding(tenant),
      to,
      fullName,
      roleLabel,
      password,
      signInUrl: resolvedSignInUrl,
      platformScope,
    });

    return this.dispatch({
      to,
      subject,
      html,
      tenant,
      critical: true,
    });
  }

  async sendTenantApplicationSubmitted({
    to,
    contactName,
    tenantName,
    applicationReference = null,
    recipientType = "contact",
  }) {
    const { html, subject } = buildTenantApplicationSubmittedEmail({
      branding: this.getBranding(),
      contactName,
      tenantName,
      applicationReference,
      recipientType,
    });
    const isPlatformRecipient = recipientType === "platform_admin";

    return this.dispatch({
      to,
      subject,
      html,
      critical: isPlatformRecipient,
    });
  }

  async sendTenantApplicationApproved({
    to,
    contactName,
    tenantName,
    applicationReference = null,
    workspaceUrl = null,
    tenantDomain = null,
  }) {
    const resolvedWorkspaceUrl =
      buildEmailRoute(workspaceUrl) ||
      buildTenantWorkspaceUrl({ tenantDomain });
    const { html, subject } = buildTenantApplicationApprovedEmail({
      branding: this.getBranding(),
      contactName,
      tenantName,
      applicationReference,
      workspaceUrl: resolvedWorkspaceUrl,
    });

    return this.dispatch({
      to,
      subject,
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
    const resolvedStatusUrl =
      buildEmailRoute(statusUrl) ||
      buildApplicationStatusUrl({
        reference: applicationReference,
        email: to,
      });
    const { html, subject } = buildTenantApplicationRejectedEmail({
      branding: this.getBranding(),
      contactName,
      tenantName,
      applicationReference,
      reason,
      statusUrl: resolvedStatusUrl,
    });

    return this.dispatch({
      to,
      subject,
      html,
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
    tenantDomain = null,
  }) {
    const resolvedCtaLink =
      buildEmailRoute(ctaLink) ||
      (status === "active"
        ? buildTenantWorkspaceUrl({ tenantDomain })
        : buildApplicationStatusUrl({ email: to }));
    const { html, subject } = buildTenantStatusUpdateEmail({
      branding: this.getBranding(),
      contactName,
      tenantName,
      status,
      message,
      ctaLabel:
        ctaLabel ||
        (status === "active" ? "Open workspace" : "Review application status"),
      ctaLink: resolvedCtaLink,
    });

    return this.dispatch({
      to,
      subject,
      html,
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
    const resolvedCtaLink = buildEmailRoute(ctaLink);
    const { html, subject: resolvedSubject } = buildSupportTicketEmail({
      branding: this.getBranding(tenant),
      recipientName,
      subject,
      headline,
      message,
      ctaLabel: ctaLabel || (resolvedCtaLink ? "Open support ticket" : null),
      ctaLink: resolvedCtaLink,
    });

    return this.dispatch({
      to,
      subject: resolvedSubject,
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
    const resolvedCtaLink = buildEmailRoute(ctaLink) || buildPlatformSettingsUrl();
    const { html, subject } = buildProviderAlertEmail({
      branding: this.getBranding(),
      recipientName,
      providerName,
      message,
      ctaLink: resolvedCtaLink,
    });

    return this.dispatch({
      to,
      subject,
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
    const { html, subject } = buildOperationalTestEmail({
      branding: this.getBranding(tenant),
      senderName,
      senderEmail,
    });

    return this.dispatch({
      to,
      subject,
      html,
      tenant,
      critical: true,
    });
  }

  async sendAdminWelcome({
    to,
    fullName,
    temporaryPassword,
    loginUrl = null,
    tenant = null,
    roleLabel = "Admin",
    platformScope = false,
  }) {
    const resolvedLoginUrl =
      buildEmailRoute(loginUrl) ||
      buildAdminSignInUrl({
        tenantDomain: !platformScope ? tenant?.primary_domain || null : null,
      });

    const { html, subject } = buildAdminWelcomeEmail({
      branding: this.getBranding(tenant),
      to,
      fullName,
      temporaryPassword,
      loginUrl: resolvedLoginUrl,
      roleLabel,
      platformScope,
    });

    return this.dispatch({
      to,
      subject,
      html,
      tenant,
      critical: true,
    });
  }
}

module.exports = new EmailService();
