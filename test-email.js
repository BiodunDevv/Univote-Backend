/**
 * Test script for Resend email integration
 * Run with: node test-email.js
 */

require("dotenv").config();
const emailService = require("./src/services/emailService");

async function testEmail() {
  console.log("🧪 Testing Resend Email Service...\n");

  // Test student data
  const testStudent = {
    full_name: "Test Student",
    matric_no: "BU22CSC1005",
    email: "muhammedabiodun42@gmail.com", // Your test email
  };

  try {
    console.log("📧 Sending test welcome email to:", testStudent.email);

    const result = await emailService.sendWelcomeEmail(testStudent);

    console.log("\n✅ Email sent successfully!");
    console.log("Email ID:", result.id);
    console.log("\n📬 Check your inbox:", testStudent.email);
  } catch (error) {
    console.error("\n❌ Email failed to send:");
    console.error(error);

    if (error.message && error.message.includes("API key")) {
      console.log(
        "\n⚠️  Make sure your RESEND_API_KEY is set correctly in .env"
      );
    }
  }
}

testEmail();
