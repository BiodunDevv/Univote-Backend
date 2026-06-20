const { escapeHtml } = require("./utils");
const { COLORS, FONT_MONO, FONT_SANS } = require("./theme");

function renderList(items = []) {
  if (!items.length) return "";
  return `
    <ul style="margin: 0; padding: 0; list-style: none;">
      ${items
        .map(
          (item) =>
            `<li class="univote-list-item" style="display: flex; align-items: flex-start; gap: 8px; margin: 0 0 10px; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.65; color: ${COLORS.text};">
              <span style="flex-shrink: 0; margin-top: 2px; color: ${COLORS.green}; font-weight: 700;">&#10003;</span>
              <span style="color: ${COLORS.text}; font-weight: 500;">${escapeHtml(item)}</span>
            </li>`,
        )
        .join("")}
    </ul>
  `;
}

function renderKeyValueRows(rows = []) {
  if (!rows.length) return "";
  return `
    <div class="univote-section" style="border: 1px solid ${COLORS.border}; border-radius: 10px; overflow: hidden; background: ${COLORS.creamSoft};">
      ${rows
        .map(
          (row, index) => `
            <div class="univote-kv-row" style="padding: 12px 16px;${
              index < rows.length - 1
                ? ` border-bottom: 1px solid ${COLORS.border};`
                : ""
            }">
              <div class="univote-kv-label" style="font-family: ${FONT_SANS}; font-size: 11px; line-height: 1.4; letter-spacing: 0.12em; text-transform: uppercase; color: ${COLORS.muted}; font-weight: 600; margin: 0 0 4px;">
                ${escapeHtml(row.label)}
              </div>
              <div class="univote-kv-value" style="font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.55; color: ${COLORS.text}; font-weight: 600; word-break: break-word;">
                ${escapeHtml(row.value)}
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSection(title, body, options = {}) {
  if (!body) return "";
  const titleAlign = options.titleAlign === "center" ? "center" : "left";

  return `
    <div class="univote-section" style="margin: 0 0 16px; border: 1px solid ${COLORS.border}; border-radius: 10px; background: ${COLORS.white}; padding: 16px 18px;">
      <p style="margin: 0 0 10px; font-family: ${FONT_SANS}; font-size: 11px; line-height: 1.4; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: ${COLORS.muted}; text-align: ${titleAlign};">
        ${escapeHtml(title)}
      </p>
      ${body}
    </div>
  `;
}

function renderSummaryStrip(items = []) {
  if (!items.length) return "";

  return `
    <div class="univote-strip" style="margin: 0 0 16px; border: 1px solid ${COLORS.border}; border-radius: 10px; background: ${COLORS.creamSoft}; padding: 14px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
        <tr>
          ${items
            .map(
              (item) => `
                <td class="univote-summary-item" valign="top" style="padding-right: 14px; vertical-align: top;">
                  <div class="univote-strip-label" style="margin: 0 0 5px; font-family: ${FONT_SANS}; font-size: 11px; line-height: 1.4; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: ${COLORS.muted};">
                    ${escapeHtml(item.label)}
                  </div>
                  <span class="univote-strip-badge" style="display: inline-block; padding: 6px 12px; border-radius: 999px; background: ${(item.tone && item.tone.background) || COLORS.white}; border: 1px solid ${COLORS.border}; color: ${(item.tone && item.tone.text) || COLORS.text}; font-family: ${FONT_SANS}; font-size: 13px; line-height: 1.4; font-weight: 600; white-space: normal; word-break: break-word;">
                    ${escapeHtml(item.value)}
                  </span>
                </td>
              `,
            )
            .join("")}
        </tr>
      </table>
    </div>
  `;
}

function renderCodeBlock(code, helperText = "Enter this code to continue. Never share it with anyone.") {
  return `
    <div class="univote-code-block" style="margin: 4px 0 0; padding: 20px 16px; background: ${COLORS.creamSoft}; border: 1px solid ${COLORS.border}; border-radius: 10px; text-align: center;">
      <div style="font-family: ${FONT_MONO}; font-size: 32px; line-height: 1.1; font-weight: 700; letter-spacing: 0.24em; color: ${COLORS.greenDark}; word-break: break-all;">
        ${escapeHtml(code)}
      </div>
    </div>
    <p style="margin: 10px 0 0; font-family: ${FONT_SANS}; font-size: 13px; line-height: 1.7; text-align: center; color: ${COLORS.muted};">
      ${escapeHtml(helperText)}
    </p>
  `;
}

function renderNoticeBox(content, tone = "warning") {
  const toneMap = {
    warning: {
      background: COLORS.warnSoft,
      leftBorder: COLORS.gold,
      text: COLORS.text,
      cssClass: "univote-notice-warn",
    },
    success: {
      background: COLORS.successSoft,
      leftBorder: COLORS.green,
      text: COLORS.greenDark,
      cssClass: "univote-notice-success",
    },
    danger: {
      background: COLORS.dangerSoft,
      leftBorder: "#c0392b",
      text: COLORS.text,
      cssClass: "univote-notice-danger",
    },
  };
  const selected = toneMap[tone] || toneMap.warning;

  return `
    <div class="${selected.cssClass}" style="border-radius: 8px; background: ${selected.background}; border: 1px solid ${selected.leftBorder}; border-left: 4px solid ${selected.leftBorder}; color: ${selected.text}; padding: 12px 14px; font-family: ${FONT_SANS}; font-size: 13px; line-height: 1.7; word-break: break-word;">
      ${content}
    </div>
  `;
}

module.exports = {
  renderCodeBlock,
  renderKeyValueRows,
  renderList,
  renderNoticeBox,
  renderSection,
  renderSummaryStrip,
};
