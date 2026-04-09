const { absoluteEmailUrl } = require("./shell");

function buildEmailRoute(path) {
  if (!path) return null;
  return absoluteEmailUrl(path);
}

function buildApplicationStatusUrl({ reference, email } = {}) {
  const params = new URLSearchParams();
  if (reference) params.set("reference", reference);
  if (email) params.set("email", email);
  const query = params.toString();
  return buildEmailRoute(
    `/application-status${query ? `?${query}` : ""}`,
  );
}

function buildStudentSignInUrl({ organization } = {}) {
  const params = new URLSearchParams();
  if (organization) params.set("organization", organization);
  const query = params.toString();
  return buildEmailRoute(`/students/login${query ? `?${query}` : ""}`);
}

function buildStudentResetPasswordUrl({ organization, email } = {}) {
  const params = new URLSearchParams();
  if (organization) params.set("organization", organization);
  if (email) params.set("email", email);
  const query = params.toString();
  return buildEmailRoute(
    `/students/reset-password${query ? `?${query}` : ""}`,
  );
}

function buildStudentSubmittedBallotUrl(sessionId) {
  return sessionId ? buildEmailRoute(`/students/vote/${sessionId}/submitted`) : null;
}

function buildStudentResultsUrl(sessionId) {
  return sessionId ? buildEmailRoute(`/students/results/${sessionId}`) : null;
}

function buildStudentSupportUrl(ticketId) {
  const query = ticketId ? `?ticket=${encodeURIComponent(ticketId)}` : "";
  return buildEmailRoute(`/students/support${query}`);
}

function buildAdminSignInUrl({ tenantDomain } = {}) {
  if (tenantDomain) {
    return `https://${tenantDomain.replace(/^https?:\/\//i, "")}/auth/signin`;
  }
  return buildEmailRoute("/auth/signin");
}

function buildTenantWorkspaceUrl({ tenantDomain } = {}) {
  if (tenantDomain) {
    return `https://${tenantDomain.replace(/^https?:\/\//i, "")}`;
  }
  return buildEmailRoute("/auth/signin");
}

function buildAdminSupportUrl(ticketId) {
  const query = ticketId ? `?ticket=${encodeURIComponent(ticketId)}` : "";
  return buildEmailRoute(`/dashboard/support${query}`);
}

function buildPlatformSupportUrl(ticketId) {
  const query = ticketId ? `?ticket=${encodeURIComponent(ticketId)}` : "";
  return buildEmailRoute(`/super-admin/support${query}`);
}

function buildPlatformSettingsUrl() {
  return buildEmailRoute("/super-admin/settings");
}

module.exports = {
  buildAdminSignInUrl,
  buildAdminSupportUrl,
  buildApplicationStatusUrl,
  buildEmailRoute,
  buildPlatformSettingsUrl,
  buildPlatformSupportUrl,
  buildStudentResetPasswordUrl,
  buildStudentResultsUrl,
  buildStudentSignInUrl,
  buildStudentSubmittedBallotUrl,
  buildStudentSupportUrl,
  buildTenantWorkspaceUrl,
};
