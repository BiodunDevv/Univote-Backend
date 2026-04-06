const { escapeHtml } = require("./utils");
const { COLORS, FONT_SANS, FONT_SERIF } = require("./theme");

let hasWarnedAboutLogoConfig = false;

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase();
    return !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

function warnAboutEmailLogo(message) {
  if (hasWarnedAboutLogoConfig) return;
  hasWarnedAboutLogoConfig = true;
  console.warn(message);
}

function getPublicEmailBaseUrl() {
  const emailBase =
    process.env.EMAIL_ASSET_BASE_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.FRONTEND_URL?.trim();

  if (emailBase && isPublicHttpsUrl(emailBase)) {
    return emailBase.replace(/\/$/, "");
  }

  if (emailBase) {
    warnAboutEmailLogo(
      "Email logo fallback is active. Set EMAIL_ASSET_BASE_URL to a public HTTP(S) URL so email clients can load Univote branding.",
    );
  }

  return null;
}

function absoluteEmailUrl(input) {
  if (!input) return null;

  if (/^https?:\/\//i.test(input)) {
    return isPublicHttpsUrl(input) ? input : null;
  }

  const baseUrl = getPublicEmailBaseUrl();
  if (!baseUrl) return null;

  return `${baseUrl}${input.startsWith("/") ? input : `/${input}`}`;
}

function getBranding(tenant = null, defaults = {}) {
  const appName = tenant?.name || defaults.fromName || "Univote";
  const supportEmail =
    tenant?.branding?.support_email ||
    defaults.supportEmail ||
    defaults.fromEmail ||
    "support@univote.com";

  const logoLightUrl =
    absoluteEmailUrl(
      process.env.EMAIL_LOGO_LIGHT_URL?.trim() || "/Darklogo.png",
    ) ||
    defaults.logoLightUrl ||
    null;
  const logoDarkUrl =
    absoluteEmailUrl(
      process.env.EMAIL_LOGO_DARK_URL?.trim() || "/Whitelogo.png",
    ) ||
    defaults.logoDarkUrl ||
    logoLightUrl;

  return {
    appName,
    supportEmail,
    logoLightUrl,
    logoDarkUrl,
  };
}

function buildButtonHtml(cta) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top: 24px;">
      <tr>
        <td align="center" style="border-radius: 999px; background: ${COLORS.green};">
          <a
            href="${escapeHtml(cta.url)}"
            style="display: inline-block; padding: 13px 22px; border-radius: 999px; color: ${COLORS.white}; text-decoration: none; font-family: ${FONT_SANS}; font-size: 14px; font-weight: 700;"
          >
            ${escapeHtml(cta.label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function buildLogoHtml(branding) {
  if (branding.logoLightUrl || branding.logoDarkUrl) {
    return `
      <div style="text-align: center;">
        ${
          branding.logoLightUrl
            ? `<img
                class="univote-logo-light"
                src="${escapeHtml(branding.logoLightUrl)}"
                alt="${escapeHtml(branding.appName)}"
                width="168"
                style="display: block; margin: 0 auto; width: 168px; max-width: 100%; height: auto; border: 0;"
              />`
            : ""
        }
        ${
          branding.logoDarkUrl
            ? `<img
                class="univote-logo-dark"
                src="${escapeHtml(branding.logoDarkUrl)}"
                alt="${escapeHtml(branding.appName)}"
                width="168"
                style="display: none; margin: 0 auto; width: 168px; max-width: 100%; height: auto; border: 0;"
              />`
            : ""
        }
      </div>
    `;
  }

  return `
    <div style="text-align:center;">
      <div style="font-family: ${FONT_SERIF}; font-size: 28px; font-weight: 700; letter-spacing: 0.05em; color: ${COLORS.greenDark};">
        ${escapeHtml(branding.appName)}
      </div>
    </div>
  `;
}

function buildBadgeHtml(label, variant = "security") {
  const background =
    variant === "order" ? COLORS.creamSoft : COLORS.successSoft;
  const text = variant === "order" ? COLORS.greenDark : COLORS.text;

  return `
    <span
      style="display: inline-block; padding: 7px 12px; border: 1px solid ${COLORS.border}; border-radius: 999px; background: ${background}; color: ${text}; font-family: ${FONT_SANS}; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;"
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function buildEmailShell({ branding, variant = "security", preheader, badge, headline, intro, statusStripHtml = "", bodyHtml, cta = null, footerNoteHtml = "" }) {
  const appUrl = getPublicEmailBaseUrl();

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="x-apple-disable-message-reformatting" />
        <title>${escapeHtml(headline)}</title>
        <style>
          @media (prefers-color-scheme: dark) {
            .univote-logo-light { display: none !important; }
            .univote-logo-dark { display: block !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background: ${COLORS.cream};">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
          ${escapeHtml(preheader || headline)}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; background: ${COLORS.cream};">
          <tr>
            <td align="center" style="padding: 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 680px; width: 100%;">
                <tr>
                  <td style="padding: 26px 28px; border: 1px solid ${COLORS.border}; border-radius: 22px; background: ${COLORS.white};">
                    <div style="margin-bottom: 18px;">
                      ${buildLogoHtml(branding)}
                    </div>
                    <div style="margin-bottom: 16px; text-align: center;">
                      ${buildBadgeHtml(badge, variant)}
                    </div>
                    <h1 style="margin: 0; text-align: center; font-family: ${FONT_SERIF}; font-size: 32px; line-height: 1.15; font-weight: 700; color: ${COLORS.greenDark};">
                      ${escapeHtml(headline)}
                    </h1>
                    <p style="margin: 14px 0 0; text-align: center; font-family: ${FONT_SANS}; font-size: 15px; line-height: 1.75; color: ${COLORS.muted};">
                      ${escapeHtml(intro)}
                    </p>
                    <div style="margin-top: 22px;">
                      ${statusStripHtml}
                    </div>
                    <div style="font-family: ${FONT_SANS}; color: ${COLORS.text};">
                      ${bodyHtml}
                      ${cta ? buildButtonHtml(cta) : ""}
                      ${footerNoteHtml ? `<div style="margin-top: 18px;">${footerNoteHtml}</div>` : ""}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 10px 0; text-align: center;">
                    <p style="margin: 0; font-family: ${FONT_SANS}; font-size: 12px; line-height: 1.7; color: ${COLORS.muted};">
                      ${escapeHtml(branding.appName)}
                    </p>
                    <p style="margin: 6px 0 0; font-family: ${FONT_SANS}; font-size: 12px; line-height: 1.7; color: ${COLORS.muted};">
                      Need help? Email
                      <a href="mailto:${escapeHtml(branding.supportEmail)}" style="color: ${COLORS.green}; text-decoration: none;">
                        ${escapeHtml(branding.supportEmail)}
                      </a>
                      ${
                        appUrl
                          ? ` or visit <a href="${escapeHtml(appUrl)}" style="color: ${COLORS.green}; text-decoration: none;">Univote online</a>.`
                          : "."
                      }
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
  absoluteEmailUrl,
  buildEmailShell,
  getBranding,
};
