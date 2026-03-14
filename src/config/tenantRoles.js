const TENANT_ROLE_DEFINITIONS = {
  owner: {
    label: "Owner",
    permissions: [
      "tenant.manage",
      "tenant.settings.manage",
      "tenant.identity.manage",
      "tenant.labels.manage",
      "tenant.auth-policy.manage",
      "tenant.roles.manage",
      "billing.manage",
      "students.manage",
      "participants.manage",
      "participants.view",
      "sessions.manage",
      "support.manage",
      "analytics.view",
      "admins.manage",
      "reports.export",
    ],
  },
  admin: {
    label: "Admin",
    permissions: [
      "tenant.settings.manage",
      "students.manage",
      "participants.manage",
      "participants.view",
      "sessions.manage",
      "analytics.view",
      "support.manage",
      "admins.manage",
      "reports.export",
    ],
  },
  support: {
    label: "Support",
    permissions: [
      "support.manage",
      "students.manage",
      "participants.view",
    ],
  },
  analyst: {
    label: "Analyst",
    permissions: [
      "analytics.view",
      "reports.export",
      "participants.view",
    ],
  },
};

function getRoleDefinition(role) {
  return TENANT_ROLE_DEFINITIONS[role] || TENANT_ROLE_DEFINITIONS.admin;
}

function getDefaultPermissionsForRole(role) {
  return [...getRoleDefinition(role).permissions];
}

function getTenantRoleCatalog() {
  return Object.entries(TENANT_ROLE_DEFINITIONS).map(([code, definition]) => ({
    code,
    label: definition.label,
    permissions: [...definition.permissions],
  }));
}

module.exports = {
  TENANT_ROLE_DEFINITIONS,
  getRoleDefinition,
  getDefaultPermissionsForRole,
  getTenantRoleCatalog,
};
