const swaggerJsdoc = require("swagger-jsdoc");
const path = require("path");

const SERVER_URL = process.env.SERVER_URL || "http://localhost:5000";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Univote API",
      version: "1.0.0",
      description:
        "University voting and student management API with onboarding, announcements, support, biometric verification, geofencing, and real-time results.",
      contact: {
        name: "Univote Support",
        email: "support@univote.online",
      },
    },
    servers: [
      {
        url: `${SERVER_URL}/api`,
        description: "Current server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter a valid JWT token obtained from login endpoints",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string", description: "Error message" },
            code: { type: "string", nullable: true },
            required_feature: { type: "string", nullable: true },
          },
        },
        TenantBranding: {
          type: "object",
          properties: {
            logo_url: { type: "string", nullable: true },
            primary_color: { type: "string", nullable: true },
            accent_color: { type: "string", nullable: true },
            support_email: { type: "string", format: "email", nullable: true },
          },
        },
        TenantContext: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            primary_domain: { type: "string", nullable: true },
            plan_code: { type: "string", nullable: true },
            branding: { $ref: "#/components/schemas/TenantBranding" },
          },
        },
        ParticipantFieldPolicy: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            required: { type: "boolean" },
            show_in_profile: { type: "boolean" },
            show_in_filters: { type: "boolean" },
            allow_in_eligibility: { type: "boolean" },
          },
        },
        TenantIdentityMetadata: {
          type: "object",
          properties: {
            primary_identifier: { type: "string" },
            allowed_identifiers: {
              type: "array",
              items: { type: "string" },
            },
            recovery_identifiers: {
              type: "array",
              items: { type: "string" },
            },
            display_identifier: { type: "string" },
            login: {
              type: "object",
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                placeholder: { type: "string" },
              },
            },
          },
        },
        OrganizationDiscoveryItem: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            primary_domain: { type: "string", nullable: true },
            branding: { $ref: "#/components/schemas/TenantBranding" },
            labels: {
              type: "object",
              properties: {
                participant_singular: { type: "string" },
                participant_plural: { type: "string" },
              },
            },
            identity: { $ref: "#/components/schemas/TenantIdentityMetadata" },
          },
        },
        Announcement: {
          type: "object",
          properties: {
            id: { type: "string" },
            owner_scope: {
              type: "string",
              enum: ["tenant", "platform"],
            },
            audience_scope: { type: "string" },
            channels: {
              type: "array",
              items: {
                type: "string",
                enum: ["in_app", "email"],
              },
            },
            title: { type: "string" },
            body: { type: "string" },
            cta_link: { type: "string", nullable: true },
            status: { type: "string" },
            created_at: { type: "string", format: "date-time" },
            published_at: { type: "string", format: "date-time", nullable: true },
          },
        },
        BiometricProviderConfig: {
          type: "object",
          properties: {
            active_provider: { type: "string", example: "aws_rekognition" },
            providers: {
              type: "object",
              additionalProperties: {
                type: "object",
                properties: {
                  enabled: { type: "boolean" },
                  configured: { type: "boolean" },
                  region: { type: "string", nullable: true },
                  similarity_threshold: { type: "number", nullable: true },
                  access_key_id_masked: { type: "string", nullable: true },
                  secret_access_key_masked: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        Student: {
          type: "object",
          properties: {
            id: { type: "string" },
            matric_no: { type: "string", example: "BU22CSC1005", nullable: true },
            display_identifier: { type: "string", nullable: true },
            full_name: { type: "string", example: "John Doe" },
            email: { type: "string", format: "email", nullable: true },
            department: { type: "string", example: "Computer Science", nullable: true },
            department_code: { type: "string", example: "CSC", nullable: true },
            college: { type: "string", example: "College of Computing", nullable: true },
            level: {
              type: "string",
              enum: ["100", "200", "300", "400", "500", "600"],
              nullable: true,
            },
            photo_url: { type: "string", nullable: true },
            has_facial_data: { type: "boolean" },
            is_active: { type: "boolean" },
            first_login: { type: "boolean" },
            last_login_at: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Admin: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string", format: "email" },
            full_name: { type: "string" },
            role: { type: "string", enum: ["admin", "super_admin"] },
            is_active: { type: "boolean" },
            last_login_at: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
          },
        },
        VotingSession: {
          type: "object",
          properties: {
            _id: { type: "string" },
            title: { type: "string", example: "Student Council Election 2026" },
            description: { type: "string" },
            start_time: { type: "string", format: "date-time" },
            end_time: { type: "string", format: "date-time" },
            status: { type: "string", enum: ["upcoming", "active", "ended"] },
            categories: { type: "array", items: { type: "string" } },
            location: { $ref: "#/components/schemas/Location" },
            eligible_college: { type: "string", nullable: true },
            eligible_departments: {
              type: "array",
              items: { type: "string" },
              nullable: true,
            },
            eligible_levels: {
              type: "array",
              items: { type: "string" },
              nullable: true,
            },
            is_off_campus_allowed: { type: "boolean", default: false },
            results_public: { type: "boolean" },
            candidates: { type: "array", items: { type: "string" } },
          },
        },
        Location: {
          type: "object",
          properties: {
            lat: { type: "number", format: "double", example: 7.8525 },
            lng: { type: "number", format: "double", example: 4.2811 },
            radius_meters: { type: "number", example: 5000 },
          },
          required: ["lat", "lng"],
        },
        Candidate: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string", example: "Jane Smith" },
            position: { type: "string", example: "President" },
            photo_url: { type: "string" },
            bio: { type: "string" },
            manifesto: { type: "string" },
            vote_count: { type: "integer", default: 0 },
            session_id: { type: "string" },
          },
        },
        Vote: {
          type: "object",
          properties: {
            _id: { type: "string" },
            student_id: { type: "string" },
            session_id: { type: "string" },
            candidate_id: { type: "string" },
            position: { type: "string" },
            geo_location: {
              type: "object",
              properties: {
                lat: { type: "number" },
                lng: { type: "number" },
              },
            },
            face_match_score: { type: "number" },
            face_verification_passed: { type: "boolean" },
            status: {
              type: "string",
              enum: ["valid", "duplicate", "rejected", "accepted"],
            },
            device_id: { type: "string", nullable: true },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        College: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string", example: "College of Computing" },
            code: { type: "string", example: "COC" },
            description: { type: "string" },
            dean_name: { type: "string" },
            dean_email: { type: "string", format: "email" },
            departments: {
              type: "array",
              items: { $ref: "#/components/schemas/Department" },
            },
            is_active: { type: "boolean" },
            student_count: { type: "integer" },
          },
        },
        Department: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string", example: "Computer Science" },
            code: { type: "string", example: "CSC" },
            description: { type: "string" },
            hod_name: { type: "string" },
            hod_email: { type: "string", format: "email" },
            available_levels: {
              type: "array",
              items: { type: "string" },
              example: ["100", "200", "300", "400"],
            },
            is_active: { type: "boolean" },
            student_count: { type: "integer" },
          },
        },
        AuditLog: {
          type: "object",
          properties: {
            id: { type: "string" },
            action: { type: "string" },
            details: { type: "object" },
            admin: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string" },
              },
            },
            timestamp: { type: "string", format: "date-time" },
            ip_address: { type: "string" },
            user_agent: { type: "string" },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            total: { type: "integer" },
            page: { type: "integer" },
            limit: { type: "integer" },
            pages: { type: "integer" },
          },
        },
      },
    },
    tags: [
      {
        name: "Auth",
        description:
          "Participant and admin authentication, password management, session bootstrap, and organization-aware portal login",
      },
      {
        name: "Public",
        description:
          "Public landing data, organization discovery, testimonials, and tenant application endpoints",
      },
      {
        name: "Admin - Sessions",
        description: "Admin management of voting sessions",
      },
      {
        name: "Admin - Students",
        description:
          "Admin management of participants (CRUD, CSV upload, bulk operations, identity-aware data entry)",
      },
      {
        name: "Admin - Candidates",
        description: "Admin management of candidates",
      },
      {
        name: "Admin - Admins",
        description: "Super-admin management of admin accounts",
      },
      {
        name: "Admin - System",
        description: "System-level admin operations (cleanup)",
      },
      {
        name: "Colleges",
        description: "Tenant structure management for colleges, departments, and canonical structure aliases",
      },
      {
        name: "Sessions",
        description: "Participant-facing session browsing, ballot details, and live session visibility",
      },
      {
        name: "Voting",
        description: "Vote submission with face verification and geofencing",
      },
      { name: "Results", description: "Election results and statistics" },
      {
        name: "Dashboard",
        description: "Dashboard data for admin and participant portals",
      },
      {
        name: "Settings",
        description: "Tenant settings, platform settings, system config, audit logs, exports, and participant structure policy",
      },
      {
        name: "Support",
        description: "Support tickets, threaded conversations, and support queue management",
      },
      {
        name: "Notifications",
        description: "In-app notification inbox, unread summaries, and notification state updates",
      },
      {
        name: "Announcements",
        description: "Tenant and platform announcement publishing, listing, and broadcast delivery",
      },
      {
        name: "Platform",
        description: "Super-admin platform controls including biometric provider configuration, university onboarding, and verification monitoring",
      },
      { name: "Health", description: "Server health checks and keep-alive" },
    ],
  },
  apis: [path.join(__dirname, "../routes/*.js")],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
