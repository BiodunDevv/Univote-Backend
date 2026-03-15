const { renderEmailLayout } = require("./layout");
const { renderKeyValueRows, renderList } = require("./fragments");
const { escapeHtml, formatDateTime, stripHtml } = require("./utils");

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
  formatDateTime,
  renderKeyValueRows,
  renderList,
  renderMessageCard,
  stripHtml,
};
