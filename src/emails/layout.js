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
  const logoLightUrl = branding.logoLightUrl || branding.logoUrl || "";
  const logoDarkUrl = branding.logoDarkUrl || branding.logoUrl || logoLightUrl;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="x-apple-disable-message-reformatting" />
        <title>${escapeHtml(title)}</title>
        <style>
          @media (prefers-color-scheme: dark) {
            .univote-logo-light { display: none !important; }
            .univote-logo-dark { display: block !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f7fb;">
          <tr>
            <td align="center" style="padding:8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:720px;">
                <tr>
                  <td style="border:1px solid #dbe4f0;border-radius:28px;background:#ffffff;padding:28px 24px;box-shadow:0 18px 48px rgba(15,23,42,0.08);">
                    <div style="margin:0 0 18px;text-align:center;">
                      ${
                        logoLightUrl
                          ? `<img class="univote-logo-light" src="${escapeHtml(
                              logoLightUrl,
                            )}" alt="${escapeHtml(
                              branding.appName,
                            )}" width="172" style="display:block;margin:0 auto;width:172px;max-width:100%;height:auto;border:0;" />`
                          : ""
                      }
                      ${
                        logoDarkUrl
                          ? `<img class="univote-logo-dark" src="${escapeHtml(
                              logoDarkUrl,
                            )}" alt="${escapeHtml(
                              branding.appName,
                            )}" width="172" style="display:none;margin:0 auto;width:172px;max-width:100%;height:auto;border:0;" />`
                          : ""
                      }
                      <div style="margin-top:10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">
                        Univote
                      </div>
                    </div>
                    <div style="text-align:center;">
                      <span style="display:inline-block;padding:7px 12px;border:1px solid #dbe4f0;border-radius:999px;background:#f8fbff;color:#334155;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">
                        ${escapeHtml(eyebrow || "Transactional update")}
                      </span>
                    </div>
                    <h1 style="margin:16px 0 0;text-align:center;font-family:Georgia,'Times New Roman',Times,serif;font-size:32px;line-height:1.12;font-weight:700;color:#0f172a;">
                      ${escapeHtml(title)}
                    </h1>
                    ${
                      intro
                        ? `<p style="margin:14px 0 0;text-align:center;font-size:15px;line-height:1.8;color:#475569;">${escapeHtml(
                            intro,
                          )}</p>`
                        : ""
                    }
                    <div style="margin-top:22px;">
                      ${sections.join("")}
                      ${
                        ctaLabel && ctaLink
                          ? `<div style="margin-top:24px;text-align:center;">
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
                          ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.8;color:#64748b;text-align:center;">${escapeHtml(
                              footnote,
                            )}</p>`
                          : ""
                      }
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
