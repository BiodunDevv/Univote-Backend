const SibApiV3Sdk = require("@sendinblue/client");
const handlebars = require("handlebars");
const fs = require("fs").promises;
const path = require("path");

/**
 * Email Service for sending transactional emails using Brevo (Sendinblue)
 */
class EmailService {
  constructor() {
    // Initialize Brevo API client
    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

    const apiKey = this.apiInstance.authentications["apiKey"];
    apiKey.apiKey = process.env.BREVO_API_KEY;

    this.fromName = process.env.EMAIL_FROM_NAME || "Univote";
    this.fromEmail = process.env.EMAIL_FROM_EMAIL || "noreply@univote.com";
    this.templatesDir = path.join(__dirname, "../emails");

    console.log("📧 Brevo Email Service initialized");
  }

  /**
   * Load and compile email template
   * @param {string} templateName - Name of template file (without .html)
   * @param {Object} data - Data to inject into template
   * @returns {string} Compiled HTML
   */
  async compileTemplate(templateName, data) {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);
      const templateContent = await fs.readFile(templatePath, "utf-8");
      const template = handlebars.compile(templateContent);
      return template(data);
    } catch (error) {
      console.error(`Error loading template ${templateName}:`, error);
      throw error;
    }
  }

  /**
   * Send welcome email to new student
   * @param {Object} student - Student object
   */
  async sendWelcomeEmail(student) {
    try {
      const html = await this.compileTemplate("welcome", {
        full_name: student.full_name,
        matric_no: student.matric_no,
        email: student.email,
        year: new Date().getFullYear(),
      });

      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
      sendSmtpEmail.to = [{ email: student.email, name: student.full_name }];
      sendSmtpEmail.subject = "Welcome to Univote - Account Activated! 🎉";
      sendSmtpEmail.htmlContent = html;

      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`✅ Welcome email sent to ${student.email}`);
    } catch (error) {
      console.error("Error sending welcome email:", error);
    }
  }

  /**
   * Send new device login alert
   * @param {Object} student - Student object
   * @param {string} deviceInfo - Device information
   */
  async sendNewDeviceAlert(student, deviceInfo) {
    try {
      const html = await this.compileTemplate("new_device_alert", {
        full_name: student.full_name,
        device_info: deviceInfo,
        login_time: new Date().toLocaleString(),
        matric_no: student.matric_no,
        year: new Date().getFullYear(),
      });

      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
      sendSmtpEmail.to = [{ email: student.email, name: student.full_name }];
      sendSmtpEmail.subject = "New Device Login Detected - Univote";
      sendSmtpEmail.htmlContent = html;

      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`✅ New device alert sent to ${student.email}`);
    } catch (error) {
      console.error("Error sending new device alert:", error);
    }
  }

  /**
   * Send vote confirmation email
   * @param {Object} student - Student object
   * @param {Object} session - Voting session object
   * @param {Array} votes - Array of vote objects with candidate info
   */
  async sendVoteConfirmation(student, session, votes) {
    try {
      const html = await this.compileTemplate("vote_confirmation", {
        full_name: student.full_name,
        session_title: session.title,
        vote_time: new Date().toLocaleString(),
        votes: votes.map((v) => ({
          position: v.position,
          candidate_name: v.candidate_name,
        })),
        year: new Date().getFullYear(),
      });

      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
      sendSmtpEmail.to = [{ email: student.email, name: student.full_name }];
      sendSmtpEmail.subject = `Vote Confirmed - ${session.title}`;
      sendSmtpEmail.htmlContent = html;

      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`✅ Vote confirmation sent to ${student.email}`);
    } catch (error) {
      console.error("Error sending vote confirmation:", error);
    }
  }

  /**
   * Send result announcement email with winners
   * @param {Object} student - Student object
   * @param {Object} session - Voting session object
   * @param {string} resultsUrl - URL to view results
   * @param {Array} winners - Array of winning candidates by position
   * @param {number} totalVotes - Total votes cast
   */
  async sendResultAnnouncement(
    student,
    session,
    resultsUrl,
    winners = [],
    totalVotes = 0
  ) {
    try {
      const html = await this.compileTemplate("result_announcement", {
        full_name: student.full_name,
        session_title: session.title,
        results_url: resultsUrl,
        winners: winners,
        total_votes: totalVotes,
        published_at: new Date().toLocaleString(),
        year: new Date().getFullYear(),
      });

      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
      sendSmtpEmail.to = [{ email: student.email, name: student.full_name }];
      sendSmtpEmail.subject = `🏆 Results Available - ${session.title}`;
      sendSmtpEmail.htmlContent = html;

      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`✅ Result announcement sent to ${student.email}`);
    } catch (error) {
      console.error("Error sending result announcement:", error);
      throw error;
    }
  }

  /**
   * Send password reset email
   * @param {Object} student - Student object
   * @param {string} resetToken - Password reset token
   */
  async sendPasswordReset(student, resetToken) {
    try {
      const html = await this.compileTemplate("password_reset", {
        full_name: student.full_name,
        reset_token: resetToken,
        year: new Date().getFullYear(),
      });

      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
      sendSmtpEmail.to = [{ email: student.email, name: student.full_name }];
      sendSmtpEmail.subject = "Password Reset Request - Univote";
      sendSmtpEmail.htmlContent = html;

      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`✅ Password reset email sent to ${student.email}`);
    } catch (error) {
      console.error("Error sending password reset:", error);
    }
  }

  /**
   * Send admin password reset email with code
   * @param {Object} admin - Admin object
   * @param {string} resetCode - 6-digit reset code
   */
  async sendAdminPasswordReset(admin, resetCode) {
    try {
      const html = await this.compileTemplate("admin_password_reset", {
        full_name: admin.full_name,
        reset_code: resetCode,
        year: new Date().getFullYear(),
      });

      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
      sendSmtpEmail.to = [{ email: admin.email, name: admin.full_name }];
      sendSmtpEmail.subject = "🔐 Admin Password Reset Code - Univote";
      sendSmtpEmail.htmlContent = html;

      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`✅ Admin password reset email sent to ${admin.email}`);
    } catch (error) {
      console.error("Error sending admin password reset:", error);
      throw error;
    }
  }

  /**
   * Send generic email (for testing and custom messages)
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} html - HTML content
   * @param {string} text - Plain text content (optional)
   */
  async sendEmail(to, subject, html, text = null) {
    try {
      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.sender = { name: this.fromName, email: this.fromEmail };
      sendSmtpEmail.to = [{ email: to }];
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.htmlContent = html;

      if (text) {
        sendSmtpEmail.textContent = text;
      }

      await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`✅ Email sent to ${to}`);
      return { success: true };
    } catch (error) {
      console.error("Error sending email:", error);
      throw error;
    }
  }
}

module.exports = new EmailService();
