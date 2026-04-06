const { buildEmailShell } = require("../shell");
const {
  renderKeyValueRows,
  renderSection,
} = require("../fragments");
const { escapeHtml, formatDateTime } = require("../utils");

function buildAnnouncementEmail({
  branding,
  recipientName,
  title,
  body,
  ctaLabel,
  ctaLink,
  roleLabel,
}) {
  return {
    subject: title,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: title,
      badge: `${roleLabel || "System"} announcement`,
      headline: title,
      intro: recipientName
        ? `Hello ${escapeHtml(recipientName)}, there is a new announcement for you.`
        : "There is a new announcement for you.",
      bodyHtml: renderSection(
        "Announcement",
        `<p style="margin:0;font-size:14px;line-height:1.8;color:#233126;">${escapeHtml(
          body,
        )}</p>`,
      ),
      cta: ctaLabel && ctaLink ? { label: ctaLabel, url: ctaLink } : null,
    }),
  };
}

function buildSupportTicketEmail({
  branding,
  recipientName,
  subject,
  headline,
  message,
  ctaLabel,
  ctaLink,
}) {
  return {
    subject,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: headline,
      badge: "Support update",
      headline,
      intro: recipientName
        ? `Hello ${escapeHtml(recipientName)}, there is a new support activity update.`
        : "There is a new support activity update.",
      bodyHtml: renderSection(
        "Support note",
        `<p style="margin:0;font-size:14px;line-height:1.8;color:#233126;">${escapeHtml(
          message,
        )}</p>`,
      ),
      cta: ctaLabel && ctaLink ? { label: ctaLabel, url: ctaLink } : null,
    }),
  };
}

module.exports = {
  buildAnnouncementEmail,
  buildSupportTicketEmail,
};
