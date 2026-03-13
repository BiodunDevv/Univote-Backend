const swaggerJsdoc = require("swagger-jsdoc");

const SERVER_URL = process.env.SERVER_URL || "http://localhost:5000";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Univote API",
      version: "1.0.0",
      description:
        "University Voting System Backend API — Secure elections with Face++ biometric verification, geofencing, and real-time results.",
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
          },
        },
        Student: {
          type: "object",
          properties: {
            id: { type: "string" },
            matric_no: { type: "string", example: "BU22CSC1005" },
            full_name: { type: "string", example: "John Doe" },
            email: { type: "string", format: "email" },
            department: { type: "string", example: "Computer Science" },
            department_code: { type: "string", example: "CSC" },
            college: { type: "string", example: "College of Computing" },
            level: {
              type: "string",
              enum: ["100", "200", "300", "400", "500", "600"],
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
              enum: ["valid", "duplicate", "rejected"],
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
          "Authentication — student and admin login/logout, password management",
      },
      {
        name: "Admin - Sessions",
        description: "Admin management of voting sessions",
      },
      {
        name: "Admin - Students",
        description:
          "Admin management of students (CRUD, CSV upload, bulk operations)",
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
      { name: "Colleges", description: "College and department management" },
      {
        name: "Sessions",
        description: "Student-facing session browsing and live results",
      },
      {
        name: "Voting",
        description: "Vote submission with face verification and geofencing",
      },
      { name: "Results", description: "Election results and statistics" },
      {
        name: "Dashboard",
        description: "Dashboard data for admin and student portals",
      },
      {
        name: "Settings",
        description: "Admin settings, system config, audit logs, exports",
      },
      { name: "Health", description: "Server health checks and keep-alive" },
    ],
  },
  apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
