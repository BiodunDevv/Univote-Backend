const { Resend } = require("resend");
const handlebars = require("handlebars");
const fs = require("fs").promises;
const path = require("path");

/**
 * Email Service for sending transactional emails using Resend
 */
class EmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.from = process.env.EMAIL_FROM || "Univote <onboarding@resend.dev>";
    this.templatesDir = path.join(__dirname, "../emails");
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

      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: [student.email],
        subject: "Welcome to Univote - Account Activated! 🎉",
        html,
      });

      if (error) {
        console.error("Resend API error:", error);
        throw error;
      }

      console.log(`✅ Welcome email sent to ${student.email} (ID: ${data.id})`);
      return data;
    } catch (error) {
      console.error("Error sending welcome email:", error);
      throw error;
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

      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: [student.email],
        subject: "New Device Login Detected - Univote",
        html,
      });

      if (error) {
        console.error("Resend API error:", error);
        throw error;
      }

      console.log(`✅ New device alert sent to ${student.email} (ID: ${data.id})`);
      return data;
    } catch (error) {
      console.error("Error sending new device alert:", error);
      throw error;
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

      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: [student.email],
        subject: `Vote Confirmed - ${session.title}`,
        html,
      });

      if (error) {
        console.error("Resend API error:", error);
        throw error;
      }

      console.log(`✅ Vote confirmation sent to ${student.email} (ID: ${data.id})`);
      return data;
    } catch (error) {
      console.error("Error sending vote confirmation:", error);
      throw error;
    }
  }

  /**
   * Send result announcement email
   * @param {Object} student - Student object
   * @param {Object} session - Voting session object
   * @param {string} resultsUrl - URL to view results
   */
  async sendResultAnnouncement(student, session, resultsUrl) {
    try {
      const html = await this.compileTemplate("result_announcement", {
        full_name: student.full_name,
        session_title: session.title,
        results_url: resultsUrl,
        year: new Date().getFullYear(),
      });

      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: [student.email],
        subject: `Results Available - ${session.title}`,
        html,
      });

      if (error) {
        console.error("Resend API error:", error);
        throw error;
      }

      console.log(`✅ Result announcement sent to ${student.email} (ID: ${data.id})`);
      return data;
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

      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: [student.email],
        subject: "Password Reset Request - Univote",
        html,
      });

      if (error) {
        console.error("Resend API error:", error);
        throw error;
      }

      console.log(`✅ Password reset email sent to ${student.email} (ID: ${data.id})`);
      return data;
    } catch (error) {
      console.error("Error sending password reset:", error);
      throw error;
    }
  }
}

module.exports = new EmailService();
