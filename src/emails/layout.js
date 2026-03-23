const { escapeHtml } = require("./utils");

function renderEmailLayout({
  branding,
  eyebrow,
  title,
  intro,
  sections = [],
  ctaLabel,
  ctaLink,
  footnote,
}) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="x-apple-disable-message-reformatting" />
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;">
          <tr>
            <td style="padding-bottom:16px;">
              <div style="border:1px solid #e2e8f0;border-radius:28px;background:#ffffff;padding:28px;box-shadow:0 16px 44px rgba(15,23,42,0.08);">
                <div style="margin-bottom:18px;display:flex;align-items:center;gap:14px;">
                  <div style="display:inline-flex;align-items:center;justify-content:center;border-radius:20px;background:#0f172a;padding:12px 16px;min-width:72px;min-height:60px;">
                    ${
                      branding.logoUrl
                        ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(
                            branding.appName,
                          )}" style="display:block;height:36px;width:auto;max-width:180px;object-fit:contain;" />`
                        : `<div style="display:inline-flex;align-items:center;justify-content:center;color:#ffffff;font-size:18px;font-weight:700;">U</div>`
                    }
                  </div>
                  <div>
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">
                      Univote
                    </div>
                    <div style="margin-top:4px;font-family:Georgia,'Times New Roman',Times,serif;font-size:24px;font-weight:700;color:#0f172a;">
                      ${escapeHtml(branding.appName)}
                    </div>
                  </div>
                </div>
                <span style="display:inline-block;padding:7px 12px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;color:#334155;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">
                  ${escapeHtml(eyebrow || "Transactional update")}
                </span>
                <h1 style="margin:16px 0 0;font-family:Georgia,'Times New Roman',Times,serif;font-size:32px;line-height:1.12;font-weight:700;color:#0f172a;">
                  ${escapeHtml(title)}
                </h1>
                ${
                  intro
                    ? `<p style="margin:14px 0 0;font-size:15px;line-height:1.8;color:#475569;">${escapeHtml(
                        intro,
                      )}</p>`
                    : ""
                }
                <div style="margin-top:22px;">
                ${sections.join("")}
                ${
                  ctaLabel && ctaLink
                    ? `<div style="margin-top:24px;">
                        <a href="${escapeHtml(
                          ctaLink,
                        )}" style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:#0f172a;color:#ffffff;text-decoration:none;padding:13px 22px;font-size:14px;font-weight:700;">
                          ${escapeHtml(ctaLabel)}
                        </a>
                      </div>`
                    : ""
                }
                ${
                  footnote
                    ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.8;color:#64748b;">${escapeHtml(
                        footnote,
                      )}</p>`
                    : ""
                }
              </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 4px 0;">
              <p style="margin:0;font-size:12px;line-height:1.8;color:#64748b;text-align:center;">
                ${escapeHtml(branding.appName)} · ${escapeHtml(
                  branding.supportEmail,
                )} · ${new Date().getFullYear()}
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

module.exports = {
  renderEmailLayout,
};
