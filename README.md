# Univote Backend

<p align="center">
  <img src="../Univote-Web/public/Darklogo.png" alt="Univote logo" width="140" />
</p>

<p align="center">
  <strong>API and service layer for secure, tenant-aware university election operations.</strong>
</p>

Univote Backend powers the full operational core of the Univote platform. It provides authentication, tenant-aware access control, election lifecycle management, candidate and session administration, voting, result publication, notifications, support workflows, public product endpoints, dashboard data, and platform-level administration.

The system is designed for digital campus elections where integrity, traceability, and operational clarity matter. It combines secure authentication, Redis-backed rate limiting and caching, MongoDB persistence, tenant resolution, geofencing support, biometric-verification integrations, real-time sockets, and documented REST APIs.

## What This Backend Does

- authenticates students and administrators
- resolves tenant context for multi-institution operation
- manages elections, sessions, candidates, and vote windows
- validates voting rules and session lifecycle constraints
- supports biometric and liveness-related verification flows
- publishes results and dashboard statistics
- handles announcements, notifications, and support flows
- exposes public onboarding and platform endpoints
- serves Swagger API documentation

## Architecture Summary

### Runtime Stack

- Node.js
- Express
- MongoDB with Mongoose
- Redis for caching and rate limiting
- Socket.IO for real-time communication
- Swagger UI for API docs

### Security and Control

- JWT authentication
- bcrypt password hashing
- request rate limiting
- tenant-context resolution middleware
- audit logging
- geofencing support
- biometric-verification provider integration
- CORS controls with explicit origin handling

## Major Route Groups

Mounted route groups from `src/app.js` include:

- `/api/health`
- `/api/auth`
- `/api/admin`
- `/api/admin/settings`
- `/api/platform`
- `/api/public`
- `/api/announcements`
- `/api/support`
- `/api/notifications`
- `/api/sessions`
- `/api/vote`
- `/api/results`
- `/api/dashboard`
- `/api-docs`

## Main Backend Modules

```text
Univote-Backend/
├── src/
│   ├── app.js                  # Express bootstrap and route registration
│   ├── config/                 # DB, Redis, Swagger, constants, tenant roles
│   ├── controllers/            # Route handlers for auth, admin, voting, support, etc.
│   ├── middleware/             # Auth, tenant context, validation, rate limiting, audit logs
│   ├── models/                 # Mongoose models
│   ├── routes/                 # Express route modules
│   ├── services/               # Email, sockets, face verification, tenant access, caching
│   ├── utils/                  # JWT, geofence, scheduler, keep-alive, tenant helpers
│   └── emails/                 # Email templates and fragments
├── scripts/                    # Seed and smoke-testing scripts
└── test/                       # Generated coverage or testing artifacts
```

## Notable Domain Models

The backend includes models for:

- `Student`
- `Admin`
- `Tenant`
- `TenantAdminMembership`
- `VotingSession`
- `Candidate`
- `Vote`
- `Result`-oriented flows via result controllers and aggregations
- `Announcement`
- `Notification`
- `SupportTicket`
- `SupportMessage`
- `AuditLog`
- `VerificationLog`
- `PlatformSetting`
- `Testimonial`
- `College`

## Environment Variables

Do not commit real credentials. Create a local `.env` file with environment-specific values.

Example configuration shape:

```env
PORT=8000
NODE_ENV=development
SERVER_URL=http://localhost:8000
MONGO_URI=mongodb://localhost:27017/univote
JWT_SECRET=replace_me
JWT_EXPIRY=24h
BCRYPT_ROUNDS=10
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false
FRONTEND_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000
EMAIL_FROM_NAME=Univote
EMAIL_FROM_EMAIL=noreply@example.com
BREVO_API_KEY=replace_me
PAYSTACK_SECRET_KEY=replace_me
DEFAULT_CAMPUS_LAT=7.8525
DEFAULT_CAMPUS_LNG=4.2811
DEFAULT_CAMPUS_RADIUS=5000
AWS_ACCESS_KEY_ID=replace_me
AWS_SECRET_ACCESS_KEY=replace_me
AWS_REGION=us-east-1
AWS_REKOGNITION_COLLECTION_PREFIX=univote-students
AWS_REKOGNITION_SIMILARITY_THRESHOLD=70
AWS_REKOGNITION_LIVENESS_REQUIRED=true
AWS_REKOGNITION_LIVENESS_THRESHOLD=70
```

### Configuration Guide

- `PORT`: HTTP server port
- `SERVER_URL`: public URL used in logs, docs, and keep-alive checks
- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: secret used to sign access tokens
- `JWT_EXPIRY`: token lifetime
- `BCRYPT_ROUNDS`: password hashing strength
- `RATE_LIMIT_WINDOW`, `RATE_LIMIT_MAX`: global rate-limit settings
- `REDIS_*`: cache and rate-limit backing store configuration
- `FRONTEND_URL`: primary frontend origin
- `CORS_ALLOWED_ORIGINS`: comma-separated allowed origins for production
- `BREVO_API_KEY`: transactional email provider key
- `PAYSTACK_SECRET_KEY`: payment-related platform integration key, if enabled
- `DEFAULT_CAMPUS_*`: default geofence coordinates and radius
- `AWS_*`: Rekognition and liveness integration settings

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB
- Redis
- AWS account or biometric-provider credentials required by your verification flow
- Brevo account for outbound email

### Install

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

### Run in Production

```bash
npm start
```

### Seed Local Data

```bash
npm run seed
```

### Smoke-Test Routes

```bash
npm run smoke:testing-routes
```

### Test Suite

```bash
npm test
```

## API Documentation

When the server is running locally:

- Swagger UI: `http://localhost:8000/api-docs`
- Swagger JSON: `http://localhost:8000/api-docs.json`
- Health check: `http://localhost:8000/health`

## Key Platform Capabilities

### Authentication and Access

- student and admin authentication
- JWT-secured protected endpoints
- tenant-aware access resolution
- role and membership helpers for institution-specific operations

### Election Operations

- election-session lifecycle management
- candidate and category configuration
- vote submission and validation
- result retrieval and publishing flows
- dashboard summaries for election activity

### Platform Operations

- tenant onboarding and public application workflows
- announcement publishing
- support desk and ticketing
- notifications
- platform-level management and testimonial tooling

### Reliability and Observability

- startup checks for MongoDB and Redis
- keep-alive utility for hosted environments
- request ID and response-time headers
- development logging
- audit and verification records

## Real-Time Features

Socket.IO is initialized at server startup, enabling real-time experiences such as live election updates, notifications, or dashboard refresh workflows where the frontend subscribes to backend events.

## Deployment Notes

Before deploying, make sure to:

- configure production MongoDB and Redis instances
- set the correct `SERVER_URL`, `FRONTEND_URL`, and `CORS_ALLOWED_ORIGINS`
- store AWS, Brevo, Paystack, and JWT secrets in secure environment management
- confirm Swagger exposure is appropriate for the target environment
- verify TLS and proxy settings for the deployed platform

## Frontend Pairing

This README documents the API and service layer. For the user-facing application, onboarding pages, dashboards, and client integrations, see `../Univote-Web/README.md`.

## Product Vision

Univote Backend exists to give universities a trustworthy election engine that is secure enough for real campus deployment, flexible enough for multi-tenant growth, and practical enough for day-to-day election operations. It is the service backbone that turns the Univote idea into an auditable, scalable digital election platform.
