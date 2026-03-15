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

module.exports = {
  escapeHtml,
  formatDateTime,
  stripHtml,
};
