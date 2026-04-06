const { renderKeyValueRows, renderList, renderNoticeBox, renderSection, renderSummaryStrip } = require("./fragments");
const { buildEmailShell, getBranding, absoluteEmailUrl } = require("./shell");
const { COLORS, FONT_MONO, FONT_SANS, FONT_SERIF } = require("./theme");
const { escapeHtml, formatDate, formatDateTime, stripHtml } = require("./utils");
const {
  buildWelcomeEmail,
  buildNewDeviceAlertEmail,
  buildPasswordResetEmail,
} = require("./templates/account");
const {
  buildVoteConfirmationEmail,
  buildResultAnnouncementEmail,
} = require("./templates/voting");
const {
  buildAdminInvitationEmail,
  buildAdminWelcomeEmail,
  buildOperationalTestEmail,
  buildProviderAlertEmail,
} = require("./templates/admin");
const {
  buildTenantApplicationApprovedEmail,
  buildTenantApplicationRejectedEmail,
  buildTenantApplicationSubmittedEmail,
  buildTenantStatusUpdateEmail,
} = require("./templates/tenant");
const {
  buildAnnouncementEmail,
  buildSupportTicketEmail,
} = require("./templates/messaging");

module.exports = {
  COLORS,
  FONT_MONO,
  FONT_SANS,
  FONT_SERIF,
  absoluteEmailUrl,
  buildAdminInvitationEmail,
  buildAdminWelcomeEmail,
  buildAnnouncementEmail,
  buildEmailShell,
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
  escapeHtml,
  formatDate,
  formatDateTime,
  getBranding,
  renderKeyValueRows,
  renderList,
  renderNoticeBox,
  renderSection,
  renderSummaryStrip,
  stripHtml,
};
