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
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;">
          <tr>
            <td style="padding-bottom:16px;">
              <div style="border:1px solid #e2e8f0;border-radius:24px;background:linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.accentColor} 100%);padding:24px;color:#ffffff;">
                <div style="display:flex;align-items:center;gap:14px;">
                  ${
                    branding.logoUrl
                      ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(
                          branding.appName,
                        )}" style="height:40px;width:40px;border-radius:12px;object-fit:cover;background:rgba(255,255,255,0.12);" />`
                      : `<div style="height:40px;width:40px;border-radius:12px;background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;">U</div>`
                  }
                  <div>
                    <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.78;">
                      ${escapeHtml(eyebrow || "Transactional update")}
                    </p>
                    <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;font-weight:700;">
                      ${escapeHtml(title)}
                    </h1>
                  </div>
                </div>
                ${
                  intro
                    ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.92);">${escapeHtml(
                        intro,
                      )}</p>`
                    : ""
                }
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div style="border:1px solid #e2e8f0;border-radius:24px;background:#ffffff;padding:24px;">
                ${sections.join("")}
                ${
                  ctaLabel && ctaLink
                    ? `<div style="margin-top:20px;">
                        <a href="${escapeHtml(
                          ctaLink,
                        )}" style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:${branding.primaryColor};color:#ffffff;text-decoration:none;padding:12px 18px;font-size:13px;font-weight:600;">
                          ${escapeHtml(ctaLabel)}
                        </a>
                      </div>`
                    : ""
                }
                ${
                  footnote
                    ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.7;color:#64748b;">${escapeHtml(
                        footnote,
                      )}</p>`
                    : ""
                }
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 4px 0;">
              <p style="margin:0;font-size:11px;line-height:1.7;color:#64748b;text-align:center;">
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
