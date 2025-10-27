/**
 * Keep Alive Utility for Render Free Tier
 * Prevents the server from spinning down due to inactivity
 */

const https = require("https");
const http = require("http");

class KeepAlive {
  constructor(url, interval = 14 * 60 * 1000) {
    // Default: 14 minutes
    this.url = url;
    this.interval = interval;
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Start the keep-alive pings
   */
  start() {
    if (this.isRunning) {
      console.log("Keep-alive is already running");
      return;
    }

    console.log(`Starting keep-alive service...`);
    console.log(`URL: ${this.url}`);
    console.log(`Interval: ${this.interval / 1000 / 60} minutes`);

    // Ping immediately on start
    this.ping();

    // Set up recurring pings
    this.intervalId = setInterval(() => {
      this.ping();
    }, this.interval);

    this.isRunning = true;
  }

  /**
   * Stop the keep-alive pings
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log("Keep-alive service stopped");
    }
  }

  /**
   * Perform a single ping to the server
   */
  ping() {
    const protocol = this.url.startsWith("https") ? https : http;
    const timestamp = new Date().toISOString();

    protocol
      .get(this.url, (res) => {
        if (res.statusCode === 200) {
          console.log(`[${timestamp}] ✓ Keep-alive ping successful (${res.statusCode})`);
        } else {
          console.log(`[${timestamp}] ⚠ Keep-alive ping returned ${res.statusCode}`);
        }
      })
      .on("error", (err) => {
        console.error(`[${timestamp}] ✗ Keep-alive ping failed:`, err.message);
      });
  }

  /**
   * Get the status of the keep-alive service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      url: this.url,
      intervalMinutes: this.interval / 1000 / 60,
    };
  }
}

module.exports = KeepAlive;
