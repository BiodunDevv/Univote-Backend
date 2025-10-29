const VotingSession = require("../models/VotingSession");
const Student = require("../models/Student");
const emailService = require("../services/emailService");
const mongoose = require("mongoose");

/**
 * Session Scheduler - Automatically ends sessions and sends result notifications
 * Runs every minute to check for sessions that have ended
 */
class SessionScheduler {
  constructor() {
    this.interval = null;
    this.checkIntervalMs = 60 * 1000; // Check every 60 seconds
    this.isRunning = false;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
  }

  /**
   * Start the session scheduler
   */
  start() {
    if (this.isRunning) {
      console.log("⚠️  Session scheduler is already running");
      return;
    }

    console.log("🕒 Session scheduler started");
    console.log(
      `   Checking for ended sessions every ${
        this.checkIntervalMs / 1000
      } seconds`
    );

    this.isRunning = true;

    // Run immediately on start
    this.checkAndEndSessions();

    // Then run on interval
    this.interval = setInterval(() => {
      this.checkAndEndSessions();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the session scheduler
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      console.log("🛑 Session scheduler stopped");
    }
  }

  /**
   * Check for sessions that have ended and process them
   */
  async checkAndEndSessions() {
    try {
      // Check if MongoDB is connected
      if (mongoose.connection.readyState !== 1) {
        console.log("⚠️  MongoDB not connected, skipping scheduler check");
        this.consecutiveErrors++;

        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          console.error(
            `❌ Too many consecutive errors (${this.consecutiveErrors}), stopping scheduler`
          );
          this.stop();
        }
        return;
      }

      const now = new Date();

      // Find sessions that have ended but status is still active or upcoming
      const endedSessions = await VotingSession.find({
        end_time: { $lte: now },
        status: { $in: ["active", "upcoming"] },
      }).maxTimeMS(5000); // 5 second timeout

      // Reset error counter on successful query
      this.consecutiveErrors = 0;

      if (endedSessions.length === 0) {
        return; // No sessions to process
      }

      console.log(`📊 Found ${endedSessions.length} session(s) to end`);

      for (const session of endedSessions) {
        try {
          await this.endSessionAndNotify(session);
        } catch (error) {
          console.error(
            `❌ Error ending session ${session._id}:`,
            error.message
          );
        }
      }
    } catch (error) {
      this.consecutiveErrors++;
      console.error(
        `❌ Error in session scheduler (${this.consecutiveErrors}/${this.maxConsecutiveErrors}):`,
        error.message
      );

      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error(`❌ Too many consecutive errors, stopping scheduler`);
        this.stop();
      }
    }
  }

  /**
   * End a session and send result notifications to eligible students
   * @param {Object} session - VotingSession document
   */
  async endSessionAndNotify(session) {
    try {
      console.log(`📌 Ending session: "${session.title}" (ID: ${session._id})`);

      // Update session status to ended and make results public
      session.status = "ended";
      session.results_public = true;
      await session.save();

      console.log(`✅ Session "${session.title}" marked as ended`);

      // Build eligibility filter for students
      const eligibilityFilter = { is_active: true };

      if (session.eligible_college) {
        eligibilityFilter.college = session.eligible_college;
      }

      // Convert department IDs to department names
      if (
        session.eligible_departments &&
        session.eligible_departments.length > 0
      ) {
        const College = require("../models/College");
        const colleges = await College.find({}).select("departments").lean();
        const departmentNames = [];

        colleges.forEach((college) => {
          college.departments.forEach((dept) => {
            if (session.eligible_departments.includes(dept._id.toString())) {
              departmentNames.push(dept.name);
            }
          });
        });

        if (departmentNames.length > 0) {
          eligibilityFilter.department = { $in: departmentNames };
        }
      }

      if (session.eligible_levels && session.eligible_levels.length > 0) {
        eligibilityFilter.level = { $in: session.eligible_levels };
      }

      // Get all eligible students who voted in this session
      const studentsWhoVoted = await Student.find({
        ...eligibilityFilter,
        has_voted_sessions: session._id,
      }).select("email full_name");

      if (studentsWhoVoted.length === 0) {
        console.log(
          `ℹ️  No students voted in session "${session.title}" - skipping email notifications`
        );
        return;
      }

      console.log(
        `📧 Sending result notifications to ${studentsWhoVoted.length} student(s)...`
      );

      // Send result announcement emails in the background
      const resultsUrl = `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/results/${session._id}`;

      let emailsSent = 0;
      let emailsFailed = 0;

      // Send emails sequentially to avoid overwhelming the email service
      for (const student of studentsWhoVoted) {
        try {
          await emailService.sendResultAnnouncement(
            student,
            session,
            resultsUrl
          );
          emailsSent++;
        } catch (err) {
          console.error(
            `❌ Failed to send result email to ${student.email}:`,
            err.message
          );
          emailsFailed++;
        }
      }

      console.log(`✅ Session "${session.title}" - Results published`);
      console.log(`   📧 Emails sent: ${emailsSent}, Failed: ${emailsFailed}`);
    } catch (error) {
      console.error(
        `❌ Error ending and notifying for session ${session._id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkIntervalMs,
      checkIntervalSeconds: this.checkIntervalMs / 1000,
    };
  }
}

module.exports = new SessionScheduler();
