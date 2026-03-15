const { escapeHtml } = require("./utils");

function renderList(items = []) {
  if (!items.length) return "";
  return `
    <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.7;">
      ${items
        .map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`)
        .join("")}
    </ul>
  `;
}

function renderKeyValueRows(rows = []) {
  if (!rows.length) return "";
  return `
    <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#ffffff;">
      ${rows
        .map(
          (row, index) => `
            <div style="display:flex;justify-content:space-between;gap:16px;padding:12px 14px;${
              index < rows.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""
            }">
              <span style="font-size:12px;color:#64748b;">${escapeHtml(row.label)}</span>
              <span style="font-size:12px;color:#0f172a;font-weight:600;text-align:right;">${escapeHtml(row.value)}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

module.exports = {
  renderKeyValueRows,
  renderList,
};
