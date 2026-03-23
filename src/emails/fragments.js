const { escapeHtml } = require("./utils");

function renderList(items = []) {
  if (!items.length) return "";
  return `
    <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.8;">
      ${items
        .map(
          (item) =>
            `<li style="margin:0 0 8px;"><span style="color:#0f172a;font-weight:600;">${escapeHtml(
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
    <div style="border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;background:#f8fafc;">
      ${rows
        .map(
          (row, index) => `
            <div style="display:flex;justify-content:space-between;gap:16px;padding:14px 16px;${
              index < rows.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""
            }">
              <span style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">${escapeHtml(
                row.label,
              )}</span>
              <span style="font-size:13px;color:#0f172a;font-weight:700;text-align:right;">${escapeHtml(
                row.value,
              )}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSection(title, body) {
  if (!body) return "";

  return `
    <div style="margin:0 0 18px;border:1px solid #e2e8f0;border-radius:22px;background:#ffffff;padding:18px 20px;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">
        ${escapeHtml(title)}
      </p>
      ${body}
    </div>
  `;
}

function renderSummaryStrip(items = []) {
  if (!items.length) return "";

  return `
    <div style="margin:0 0 18px;border:1px solid #e2e8f0;border-radius:22px;background:#f8fafc;padding:14px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          ${items
            .map(
              (item) => `
                <td valign="top" style="padding-right:12px;">
                  <div style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">
                    ${escapeHtml(item.label)}
                  </div>
                  <span style="display:inline-block;padding:8px 12px;border-radius:999px;background:#ffffff;border:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:700;white-space:nowrap;">
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

module.exports = {
  renderKeyValueRows,
  renderList,
  renderSection,
  renderSummaryStrip,
};
