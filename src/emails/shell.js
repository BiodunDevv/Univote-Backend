const { escapeHtml } = require("./utils");
const { COLORS, DARK_COLORS, FONT_SANS } = require("./theme");

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
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 24px; width: 100%;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td align="center" style="border-radius: 8px; background: ${COLORS.green};">
                <a
                  href="${escapeHtml(cta.url)}"
                  style="display: inline-block; padding: 12px 28px; border-radius: 8px; color: ${COLORS.white}; text-decoration: none; font-family: ${FONT_SANS}; font-size: 14px; font-weight: 600; letter-spacing: 0.01em; line-height: 1.5;"
                >
                  ${escapeHtml(cta.label)}
                </a>
              </td>
            </tr>
          </table>
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
                width="140"
                style="display: block; margin: 0 auto; width: 140px; max-width: 100%; height: auto; border: 0;"
              />`
            : ""
        }
        ${
          branding.logoDarkUrl
            ? `<img
                class="univote-logo-dark"
                src="${escapeHtml(branding.logoDarkUrl)}"
                alt="${escapeHtml(branding.appName)}"
                width="140"
                style="display: none; margin: 0 auto; width: 140px; max-width: 100%; height: auto; border: 0;"
              />`
            : ""
        }
      </div>
    `;
  }

  return `
    <div style="text-align: center;">
      <div style="display: inline-block; font-family: ${FONT_SANS}; font-size: 20px; font-weight: 700; letter-spacing: 0.04em; color: ${COLORS.greenDark};">
        ${escapeHtml(branding.appName)}
      </div>
    </div>
  `;
}

function buildBadgeHtml(label, variant = "security") {
  const background =
    variant === "order" ? COLORS.creamSoft : COLORS.successSoft;
  const color =
    variant === "order" ? COLORS.muted : COLORS.greenMid;
  const border = COLORS.border;

  return `
    <span
      style="display: inline-block; padding: 5px 10px; border: 1px solid ${border}; border-radius: 6px; background: ${background}; color: ${color}; font-family: ${FONT_SANS}; font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;"
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function buildEmailShell({
  branding,
  variant = "security",
  preheader,
  badge,
  headline,
  intro,
  statusStripHtml = "",
  bodyHtml,
  cta = null,
  footerNoteHtml = "",
}) {
  const appUrl = getPublicEmailBaseUrl();

  return `<!doctype html>
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
        .univote-outer { background: ${DARK_COLORS.bg} !important; }
        .univote-card { background: ${DARK_COLORS.card} !important; border-color: ${DARK_COLORS.border} !important; }
        .univote-headline { color: ${DARK_COLORS.heading} !important; }
        .univote-intro { color: ${DARK_COLORS.muted} !important; }
        .univote-body { color: ${DARK_COLORS.text} !important; }
        .univote-footer-text { color: ${DARK_COLORS.muted} !important; }
        .univote-footer-link { color: ${DARK_COLORS.green} !important; }
        .univote-divider { border-color: ${DARK_COLORS.border} !important; }
        .univote-section { background: ${DARK_COLORS.cardSoft} !important; border-color: ${DARK_COLORS.border} !important; }
        .univote-kv-row { border-color: ${DARK_COLORS.border} !important; }
        .univote-kv-label { color: ${DARK_COLORS.muted} !important; }
        .univote-kv-value { color: ${DARK_COLORS.text} !important; }
        .univote-strip { background: ${DARK_COLORS.cardSoft} !important; border-color: ${DARK_COLORS.border} !important; }
        .univote-strip-label { color: ${DARK_COLORS.muted} !important; }
        .univote-strip-badge { background: ${DARK_COLORS.card} !important; border-color: ${DARK_COLORS.border} !important; color: ${DARK_COLORS.text} !important; }
        .univote-notice-warn { background: #2a2310 !important; border-color: #7a6520 !important; color: ${DARK_COLORS.text} !important; }
        .univote-notice-success { background: #122215 !important; border-color: #2a5c2c !important; color: ${DARK_COLORS.text} !important; }
        .univote-notice-danger { background: #251212 !important; border-color: #6b2020 !important; color: ${DARK_COLORS.text} !important; }
        .univote-code-block { background: ${DARK_COLORS.cardSoft} !important; border-color: ${DARK_COLORS.border} !important; color: ${DARK_COLORS.heading} !important; }
        .univote-body-text { color: ${DARK_COLORS.text} !important; }
        .univote-list-item { color: ${DARK_COLORS.text} !important; }
      }
      @media only screen and (max-width: 640px) {
        .univote-card {
          padding: 20px 16px !important;
          border-radius: 0 !important;
          border-left: 0 !important;
          border-right: 0 !important;
        }
        .univote-headline {
          font-size: 22px !important;
          line-height: 1.25 !important;
        }
        .univote-intro {
          font-size: 14px !important;
          line-height: 1.7 !important;
        }
        .univote-summary-item {
          display: block !important;
          width: 100% !important;
          padding: 0 0 10px !important;
        }
        .univote-summary-item:last-child {
          padding-bottom: 0 !important;
        }
        .univote-outer {
          padding: 0 !important;
        }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: ${COLORS.cream};">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; font-size: 1px; line-height: 1px;">
      ${escapeHtml(preheader || headline)}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="univote-outer" style="width: 100%; background: ${COLORS.cream};">
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%;">
            <tr>
              <td
                class="univote-card"
                style="padding: 32px 32px; border: 1px solid ${COLORS.border}; border-radius: 12px; background: ${COLORS.white};"
              >
                <div style="margin-bottom: 24px;">
                  ${buildLogoHtml(branding)}
                </div>
                <div style="margin-bottom: 14px; text-align: center;">
                  ${buildBadgeHtml(badge, variant)}
                </div>
                <h1
                  class="univote-headline"
                  style="margin: 0; text-align: center; font-family: ${FONT_SANS}; font-size: 24px; line-height: 1.25; font-weight: 700; color: ${COLORS.greenDark}; letter-spacing: -0.01em; word-break: break-word;"
                >
                  ${escapeHtml(headline)}
                </h1>
                <p
                  class="univote-intro"
                  style="margin: 10px 0 0; text-align: center; font-family: ${FONT_SANS}; font-size: 14px; line-height: 1.75; color: ${COLORS.muted}; word-break: break-word;"
                >
                  ${escapeHtml(intro)}
                </p>
                ${statusStripHtml ? `<div style="margin-top: 20px;">${statusStripHtml}</div>` : ""}
                <div class="univote-body" style="margin-top: 24px; font-family: ${FONT_SANS}; color: ${COLORS.text}; text-align: left;">
                  ${bodyHtml}
                  ${cta ? buildButtonHtml(cta) : ""}
                  ${footerNoteHtml ? `<div style="margin-top: 16px;">${footerNoteHtml}</div>` : ""}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 10px 8px;">
                <hr class="univote-divider" style="border: 0; border-top: 1px solid ${COLORS.border}; margin: 0 0 16px;" />
                <p class="univote-footer-text" style="margin: 0; font-family: ${FONT_SANS}; font-size: 12px; line-height: 1.7; color: ${COLORS.muted}; text-align: center;">
                  ${escapeHtml(branding.appName)}
                </p>
                <p class="univote-footer-text" style="margin: 6px 0 0; font-family: ${FONT_SANS}; font-size: 12px; line-height: 1.7; color: ${COLORS.muted}; text-align: center;">
                  Need help? Email
                  <a href="mailto:${escapeHtml(branding.supportEmail)}" class="univote-footer-link" style="color: ${COLORS.green}; text-decoration: none;">${escapeHtml(branding.supportEmail)}</a>${
    appUrl
      ? ` or visit <a href="${escapeHtml(appUrl)}" class="univote-footer-link" style="color: ${COLORS.green}; text-decoration: none;">Univote online</a>.`
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
</html>`;
}

module.exports = {
  absoluteEmailUrl,
  buildEmailShell,
  getBranding,
};
