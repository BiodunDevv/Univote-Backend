const { buildEmailShell } = require("../shell");
const {
  renderKeyValueRows,
  renderNoticeBox,
  renderSection,
  renderSummaryStrip,
} = require("../fragments");
const { escapeHtml, formatDateTime } = require("../utils");
const { COLORS, FONT_SANS } = require("../theme");

function buildAnnouncementEmail({
  branding,
  recipientName,
  title,
  body,
  ctaLabel,
  ctaLink,
  roleLabel,
}) {
  const orgName = branding.appName || "your university";

  const formattedBody = String(body || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(
      (line) =>
        `<p class="univote-body-text" style="margin: 0 0 12px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">${escapeHtml(line)}</p>`,
    )
    .join("");

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(recipientName || "there")}, you have a new announcement from ${escapeHtml(orgName)}.
    </p>
    ${renderSection(
      "Announcement",
      formattedBody ||
        `<p class="univote-body-text" style="margin: 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">${escapeHtml(body || "")}</p>`,
    )}
  `;

  return {
    subject: title,
    html: buildEmailShell({
      branding,
      variant: "order",
      preheader: title,
      badge: `${roleLabel || "System"} announcement`,
      headline: escapeHtml(title),
      intro: recipientName
        ? `Hello ${escapeHtml(recipientName)}, there is a new announcement from ${escapeHtml(orgName)}.`
        : `There is a new announcement from ${escapeHtml(orgName)}.`,
      bodyHtml,
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
  ticketNumber,
  ticketSubject,
  ticketStatus,
  ticketPriority,
  ctaLabel,
  ctaLink,
}) {
  const hasTicketMeta = ticketNumber || ticketSubject || ticketStatus || ticketPriority;

  const ticketRows = [];
  if (ticketNumber) ticketRows.push({ label: "Ticket number", value: ticketNumber });
  if (ticketSubject) ticketRows.push({ label: "Subject", value: ticketSubject });
  if (ticketStatus) ticketRows.push({ label: "Status", value: ticketStatus });
  if (ticketPriority) ticketRows.push({ label: "Priority", value: ticketPriority });
  ticketRows.push({ label: "Updated", value: formatDateTime(Date.now()) });

  const bodyHtml = `
    <p class="univote-body-text" style="margin: 0 0 16px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">
      Hello ${escapeHtml(recipientName || "there")}, there is a new update on your support ticket.
    </p>
    ${hasTicketMeta ? renderSection("Ticket details", renderKeyValueRows(ticketRows)) : ""}
    ${
      message
        ? renderSection(
            "Latest update",
            `<p class="univote-body-text" style="margin: 0; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.text};">${escapeHtml(message)}</p>`,
          )
        : ""
    }
    ${renderSection(
      "Need more help?",
      renderNoticeBox(
        `Reply to this ticket in your portal or contact support at <a href="mailto:${escapeHtml(branding.supportEmail)}" style="color: ${COLORS.green}; text-decoration: none;">${escapeHtml(branding.supportEmail)}</a>.`,
        "success",
      ),
    )}
  `;

  return {
    subject,
    html: buildEmailShell({
      branding,
      variant: "security",
      preheader: headline || subject,
      badge: "Support update",
      headline: headline || subject,
      intro: recipientName
        ? `Hello ${escapeHtml(recipientName)}, there is a new update on your support request.`
        : "There is a new update on your support request.",
      statusStripHtml:
        hasTicketMeta
          ? renderSummaryStrip([
              ...(ticketNumber ? [{ label: "Ticket", value: ticketNumber }] : []),
              ...(ticketStatus ? [{ label: "Status", value: ticketStatus }] : []),
              ...(ticketPriority ? [{ label: "Priority", value: ticketPriority }] : []),
            ])
          : "",
      bodyHtml,
      cta: ctaLabel && ctaLink ? { label: ctaLabel, url: ctaLink } : null,
    }),
  };
}

module.exports = {
  buildAnnouncementEmail,
  buildSupportTicketEmail,
};
