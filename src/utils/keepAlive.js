/**
 * Keep Alive Utility
 * Self-pings the server to prevent spin-down on free-tier hosting (Render, etc.)
 * Also works locally to verify the server stays responsive.
 */

const https = require("https");
const http = require("http");

class KeepAlive {
  constructor(url, interval = 14 * 60 * 1000) {
    this.url = url;
    this.interval = interval;
    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.ping();
    this.intervalId = setInterval(() => this.ping(), this.interval);
    this.isRunning = true;
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
    }
  }

  ping() {
    const protocol = this.url.startsWith("https") ? https : http;
    protocol
      .get(this.url, (res) => {
        if (res.statusCode !== 200) {
          console.warn(`Keep-alive: ${this.url} returned ${res.statusCode}`);
        }
      })
      .on("error", (err) => {
        console.warn(`Keep-alive failed: ${err.message}`);
      });
  }
}

module.exports = KeepAlive;
