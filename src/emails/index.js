const { renderEmailLayout } = require("./layout");
const {
  renderKeyValueRows,
  renderList,
  renderSection,
  renderSummaryStrip,
} = require("./fragments");
const { escapeHtml, formatDate, formatDateTime, stripHtml } = require("./utils");

function renderMessageCard({ branding, eyebrow, title, intro, sections, ctaLabel, ctaLink, footnote }) {
  return renderEmailLayout({
    branding,
    eyebrow,
    title,
    intro,
    sections,
    ctaLabel,
    ctaLink,
    footnote,
  });
}

module.exports = {
  escapeHtml,
  formatDate,
  formatDateTime,
  renderKeyValueRows,
  renderList,
  renderSection,
  renderSummaryStrip,
  renderMessageCard,
  stripHtml,
};
