const { escapeHtml } = require("./utils");
const { COLORS, FONT_MONO, FONT_SANS } = require("./theme");

function renderList(items = []) {
  if (!items.length) return "";
  return `
    <ul style="margin:0;padding-left:18px;color:${COLORS.muted};font-size:13px;line-height:1.8;">
      ${items
        .map(
          (item) =>
            `<li style="margin:0 0 8px;"><span style="color:${COLORS.text};font-weight:600;">${escapeHtml(
              item,
            )}</span></li>`,
        )
        .join("")}
    </ul>
  `;
}

function renderKeyValueRows(rows = []) {
  if (!rows.length) return "";
  return `
    <div style="border:1px solid ${COLORS.border};border-radius:20px;overflow:hidden;background:${COLORS.creamSoft};">
      ${rows
        .map(
          (row, index) => `
            <div style="padding:14px 16px;${ 
              index < rows.length - 1 ? `border-bottom:1px solid ${COLORS.border};` : ""
            }">
              <div style="font-family:${FONT_SANS};font-size:11px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.muted};margin:0 0 6px;">
                ${escapeHtml(row.label)}
              </div>
              <div style="font-size:13px;line-height:1.6;color:${COLORS.text};font-weight:700;word-break:break-word;">
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
    <div style="margin:0 0 18px;border:1px solid ${COLORS.border};border-radius:18px;background:${COLORS.white};padding:18px 20px;">
      <p style="margin:0 0 12px;font-family:${FONT_SANS};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.muted};text-align:${titleAlign};">
        ${escapeHtml(title)}
      </p>
      ${body}
    </div>
  `;
}

function renderSummaryStrip(items = []) {
  if (!items.length) return "";

  return `
    <div class="univote-summary-strip" style="margin:0 0 18px;border:1px solid ${COLORS.border};border-radius:18px;background:${COLORS.creamSoft};padding:14px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
        <tr>
          ${items
            .map(
              (item) => `
                <td class="univote-summary-item" valign="top" style="padding-right:12px;vertical-align:top;">
                  <div style="margin:0 0 6px;font-family:${FONT_SANS};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.muted};">
                    ${escapeHtml(item.label)}
                  </div>
                  <span style="display:inline-block;padding:8px 12px;border-radius:999px;background:${(item.tone && item.tone.background) || COLORS.white};border:1px solid ${COLORS.border};color:${(item.tone && item.tone.text) || COLORS.text};font-size:13px;line-height:1.4;font-weight:700;white-space:normal;word-break:break-word;">
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
    <div style="padding: 8px 0 2px; font-family: ${FONT_MONO}; font-size: 28px; line-height: 1.1; font-weight: 700; letter-spacing: 0.22em; text-align: center; color: ${COLORS.greenDark}; word-break: break-word;">
      ${escapeHtml(code)}
    </div>
    <p style="margin: 14px 0 0; font-size: 13px; line-height: 1.7; text-align: center; color: ${COLORS.muted};">
      ${escapeHtml(helperText)}
    </p>
  `;
}

function renderNoticeBox(content, tone = "warning") {
  const toneMap = {
    warning: {
      background: COLORS.warnSoft,
      border: COLORS.gold,
      text: COLORS.text,
    },
    success: {
      background: COLORS.successSoft,
      border: COLORS.border,
      text: COLORS.greenDark,
    },
    danger: {
      background: COLORS.dangerSoft,
      border: COLORS.border,
      text: COLORS.text,
    },
  };
  const selected = toneMap[tone] || toneMap.warning;

  return `
    <div style="border-radius:12px;background:${selected.background};border:1px solid ${selected.border};color:${selected.text};padding:12px;font-size:13px;line-height:1.7;word-break:break-word;">
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
