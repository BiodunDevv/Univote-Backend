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
    return getBranding(tenant, {
      fromName: this.fromName,
      fromEmail: this.fromEmail,
      supportEmail: this.defaultSupportEmail,
    });
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
      student,
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
    const { html, subject } = buildResultAnnouncementEmail({
      branding: this.getBranding(tenant),
      student,
      session,
      resultsUrl,
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
      branding: this.getBranding(tenant),
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
      branding: this.getBranding(tenant),
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
    const { html, subject } = buildAnnouncementEmail({
      branding: this.getBranding(tenant),
      recipientName,
      title,
      body,
      ctaLabel,
      ctaLink,
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
    const { html, subject } = buildAdminInvitationEmail({
      branding: this.getBranding(tenant),
      to,
      fullName,
      roleLabel,
      password,
      signInUrl,
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
  }) {
    const { html, subject } = buildTenantApplicationApprovedEmail({
      branding: this.getBranding(),
      contactName,
      tenantName,
      applicationReference,
      workspaceUrl,
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
    const { html, subject } = buildTenantApplicationRejectedEmail({
      branding: this.getBranding(),
      contactName,
      tenantName,
      applicationReference,
      reason,
      statusUrl,
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
  }) {
    const { html, subject } = buildTenantStatusUpdateEmail({
      branding: this.getBranding(),
      contactName,
      tenantName,
      status,
      message,
      ctaLabel,
      ctaLink,
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
    const { html, subject: resolvedSubject } = buildSupportTicketEmail({
      branding: this.getBranding(tenant),
      recipientName,
      subject,
      headline,
      message,
      ctaLabel,
      ctaLink,
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
    const { html, subject } = buildProviderAlertEmail({
      branding: this.getBranding(),
      recipientName,
      providerName,
      message,
      ctaLink,
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
    const { html, subject } = buildAdminWelcomeEmail({
      branding: this.getBranding(tenant),
      to,
      fullName,
      temporaryPassword,
      loginUrl,
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
