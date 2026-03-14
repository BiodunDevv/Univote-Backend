const PARTICIPANT_IDENTIFIER_TYPES = [
  "matric_no",
  "email",
  "member_id",
  "employee_id",
  "username",
];

const PARTICIPANT_FIELD_KEYS = [
  "full_name",
  "email",
  "matric_no",
  "member_id",
  "employee_id",
  "username",
  "college",
  "department",
  "level",
  "photo_url",
  "face_verification",
];

const DEFAULT_PARTICIPANT_FIELDS = {
  full_name: {
    enabled: true,
    required: true,
    show_in_profile: true,
    show_in_filters: false,
    allow_in_eligibility: false,
  },
  email: {
    enabled: true,
    required: true,
    show_in_profile: true,
    show_in_filters: false,
    allow_in_eligibility: false,
  },
  matric_no: {
    enabled: true,
    required: true,
    show_in_profile: true,
    show_in_filters: true,
    allow_in_eligibility: false,
  },
  member_id: {
    enabled: true,
    required: false,
    show_in_profile: true,
    show_in_filters: true,
    allow_in_eligibility: false,
  },
  employee_id: {
    enabled: true,
    required: false,
    show_in_profile: true,
    show_in_filters: true,
    allow_in_eligibility: false,
  },
  username: {
    enabled: true,
    required: false,
    show_in_profile: true,
    show_in_filters: false,
    allow_in_eligibility: false,
  },
  college: {
    enabled: true,
    required: true,
    show_in_profile: true,
    show_in_filters: true,
    allow_in_eligibility: true,
  },
  department: {
    enabled: true,
    required: true,
    show_in_profile: true,
    show_in_filters: true,
    allow_in_eligibility: true,
  },
  level: {
    enabled: true,
    required: true,
    show_in_profile: true,
    show_in_filters: true,
    allow_in_eligibility: true,
  },
  photo_url: {
    enabled: true,
    required: false,
    show_in_profile: true,
    show_in_filters: false,
    allow_in_eligibility: false,
  },
  face_verification: {
    enabled: true,
    required: false,
    show_in_profile: false,
    show_in_filters: true,
    allow_in_eligibility: false,
  },
};

const DEFAULT_TENANT_SETTINGS = {
  labels: {
    participant_singular: "Student",
    participant_plural: "Students",
  },
  identity: {
    primary_identifier: "matric_no",
    allowed_identifiers: ["matric_no"],
    recovery_identifiers: ["email"],
    display_identifier: "matric_no",
  },
  auth: {
    require_email: true,
    require_photo: false,
    require_face_verification: false,
  },
  features: {
    custom_terminology: false,
    custom_identity_policy: false,
    custom_participant_structure: false,
    advanced_notifications: false,
    advanced_reports: false,
    face_verification: false,
  },
  participant_fields: DEFAULT_PARTICIPANT_FIELDS,
  support: {
    allow_participant_tickets: true,
  },
  notifications: {
    email_enabled: true,
    in_app_enabled: true,
    push_enabled: false,
  },
  voting: {
    require_face_verification: false,
  },
};

const IDENTIFIER_LABELS = {
  matric_no: "Matric Number",
  email: "Email Address",
  member_id: "Member ID",
  employee_id: "Employee ID",
  username: "Username",
};

const IDENTIFIER_PLACEHOLDERS = {
  matric_no: "BU22CSC1001",
  email: "name@organization.org",
  member_id: "MEM-1001",
  employee_id: "EMP-1001",
  username: "jane.doe",
};

const PARTICIPANT_FIELD_LABELS = {
  full_name: "Full Name",
  email: "Email Address",
  matric_no: "Matric Number",
  member_id: "Member ID",
  employee_id: "Employee ID",
  username: "Username",
  college: "College",
  department: "Department",
  level: "Level",
  photo_url: "Photo URL",
  face_verification: "Face Verification",
};

function cloneDefaultTenantSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_TENANT_SETTINGS));
}

function normalizeIdentifierKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return PARTICIPANT_IDENTIFIER_TYPES.includes(normalized)
    ? normalized
    : "matric_no";
}

function dedupeIdentifierList(values, fallback) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(normalizeIdentifierKey)
        .filter(Boolean),
    ),
  );

  if (normalized.length > 0) {
    return normalized;
  }

  return fallback ? [fallback] : ["matric_no"];
}

function mergeTenantSettings(settings = {}) {
  const mergedParticipantFields = Object.fromEntries(
    PARTICIPANT_FIELD_KEYS.map((fieldKey) => [
      fieldKey,
      {
        ...(DEFAULT_PARTICIPANT_FIELDS[fieldKey] || {}),
        ...((settings?.participant_fields || {})[fieldKey] || {}),
      },
    ]),
  );

  const merged = {
    ...cloneDefaultTenantSettings(),
    ...settings,
    labels: {
      ...DEFAULT_TENANT_SETTINGS.labels,
      ...(settings?.labels || {}),
    },
    identity: {
      ...DEFAULT_TENANT_SETTINGS.identity,
      ...(settings?.identity || {}),
    },
    auth: {
      ...DEFAULT_TENANT_SETTINGS.auth,
      ...(settings?.auth || {}),
    },
    features: {
      ...DEFAULT_TENANT_SETTINGS.features,
      ...(settings?.features || {}),
    },
    participant_fields: mergedParticipantFields,
    support: {
      ...DEFAULT_TENANT_SETTINGS.support,
      ...(settings?.support || {}),
    },
    notifications: {
      ...DEFAULT_TENANT_SETTINGS.notifications,
      ...(settings?.notifications || {}),
    },
    voting: {
      ...DEFAULT_TENANT_SETTINGS.voting,
      ...(settings?.voting || {}),
    },
  };

  const primaryIdentifier = normalizeIdentifierKey(
    merged.identity.primary_identifier,
  );
  const allowedIdentifiers = dedupeIdentifierList(
    merged.identity.allowed_identifiers,
    primaryIdentifier,
  );
  const recoveryIdentifiers = dedupeIdentifierList(
    merged.identity.recovery_identifiers,
    "email",
  );
  const displayIdentifier = normalizeIdentifierKey(
    merged.identity.display_identifier || primaryIdentifier,
  );

  merged.identity.primary_identifier = primaryIdentifier;
  merged.identity.allowed_identifiers = allowedIdentifiers.includes(
    primaryIdentifier,
  )
    ? allowedIdentifiers
    : [primaryIdentifier, ...allowedIdentifiers];
  merged.identity.recovery_identifiers = recoveryIdentifiers;
  merged.identity.display_identifier = merged.identity.allowed_identifiers.includes(
    displayIdentifier,
  )
    ? displayIdentifier
    : primaryIdentifier;

  if (!merged.participant_fields.email.enabled) {
    merged.auth.require_email = false;
  }

  PARTICIPANT_IDENTIFIER_TYPES.forEach((identifierKey) => {
    if (!merged.participant_fields[identifierKey]?.enabled) {
      merged.participant_fields[identifierKey] = {
        ...merged.participant_fields[identifierKey],
        required: false,
      };
    }
  });

  if (!merged.participant_fields[primaryIdentifier]?.enabled) {
    merged.participant_fields[primaryIdentifier] = {
      ...merged.participant_fields[primaryIdentifier],
      enabled: true,
    };
  }

  if (!merged.participant_fields[primaryIdentifier]?.required) {
    merged.participant_fields[primaryIdentifier] = {
      ...merged.participant_fields[primaryIdentifier],
      required: true,
    };
  }

  if (!merged.participant_fields.full_name.enabled) {
    merged.participant_fields.full_name.enabled = true;
  }
  if (!merged.participant_fields.full_name.required) {
    merged.participant_fields.full_name.required = true;
  }

  return merged;
}

function getTenantSettings(tenant) {
  return mergeTenantSettings(tenant?.settings || {});
}

function getParticipantLabelSet(tenant) {
  const settings = getTenantSettings(tenant);
  const singular = settings.labels.participant_singular || "Student";
  const plural = settings.labels.participant_plural || "Students";
  return {
    singular,
    plural,
    lowerSingular: singular.toLowerCase(),
    lowerPlural: plural.toLowerCase(),
  };
}

function getIdentifierMetadata(identifierKey) {
  const key = normalizeIdentifierKey(identifierKey);

  return {
    key,
    label: IDENTIFIER_LABELS[key],
    placeholder: IDENTIFIER_PLACEHOLDERS[key],
  };
}

function getTenantIdentityMetadata(tenant) {
  const settings = getTenantSettings(tenant);
  return {
    ...settings.identity,
    login: getIdentifierMetadata(settings.identity.primary_identifier),
    display: getIdentifierMetadata(settings.identity.display_identifier),
    recovery: settings.identity.recovery_identifiers.map(getIdentifierMetadata),
  };
}

function getTenantParticipantFields(tenant) {
  return getTenantSettings(tenant).participant_fields;
}

function getTenantParticipantFieldMetadata(tenant) {
  const participantFields = getTenantParticipantFields(tenant);
  return Object.fromEntries(
    Object.entries(participantFields).map(([key, value]) => [
      key,
      {
        key,
        label: PARTICIPANT_FIELD_LABELS[key] || key,
        ...value,
      },
    ]),
  );
}

function isTenantParticipantFieldEnabled(tenant, fieldKey) {
  return Boolean(getTenantParticipantFields(tenant)?.[fieldKey]?.enabled);
}

function isTenantParticipantFieldRequired(tenant, fieldKey) {
  const field = getTenantParticipantFields(tenant)?.[fieldKey];
  return Boolean(field?.enabled && field?.required);
}

function getTenantEligibilityPolicy(tenant) {
  const participantFields = getTenantParticipantFields(tenant);
  return {
    college: Boolean(
      participantFields.college?.enabled &&
        participantFields.college?.allow_in_eligibility,
    ),
    department: Boolean(
      participantFields.department?.enabled &&
        participantFields.department?.allow_in_eligibility,
    ),
    level: Boolean(
      participantFields.level?.enabled &&
        participantFields.level?.allow_in_eligibility,
    ),
  };
}

function buildParticipantLookupFilter(identifierKey, value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  switch (normalizeIdentifierKey(identifierKey)) {
    case "email":
      return { email: normalized.toLowerCase() };
    case "member_id":
      return { member_id: normalized.toUpperCase() };
    case "employee_id":
      return { employee_id: normalized.toUpperCase() };
    case "username":
      return { username: normalized.toLowerCase() };
    case "matric_no":
    default:
      return { matric_no: normalized.toUpperCase() };
  }
}

function getTenantSettingsCatalog() {
  return {
    identifier_types: PARTICIPANT_IDENTIFIER_TYPES.map((key) =>
      getIdentifierMetadata(key),
    ),
    participant_fields: Object.fromEntries(
      PARTICIPANT_FIELD_KEYS.map((key) => [
        key,
        {
          key,
          label: PARTICIPANT_FIELD_LABELS[key] || key,
          ...DEFAULT_PARTICIPANT_FIELDS[key],
        },
      ]),
    ),
    defaults: cloneDefaultTenantSettings(),
  };
}

module.exports = {
  DEFAULT_TENANT_SETTINGS,
  DEFAULT_PARTICIPANT_FIELDS,
  PARTICIPANT_IDENTIFIER_TYPES,
  PARTICIPANT_FIELD_KEYS,
  buildParticipantLookupFilter,
  cloneDefaultTenantSettings,
  getIdentifierMetadata,
  getTenantEligibilityPolicy,
  getParticipantLabelSet,
  getTenantIdentityMetadata,
  getTenantParticipantFieldMetadata,
  getTenantParticipantFields,
  getTenantSettings,
  getTenantSettingsCatalog,
  isTenantParticipantFieldEnabled,
  isTenantParticipantFieldRequired,
  mergeTenantSettings,
  normalizeIdentifierKey,
};
