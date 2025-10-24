# API Testing Guide

This guide helps you test the Univote API using curl, Postman, or any HTTP client.

## Prerequisites

- Server running on `http://localhost:5000`
- Database seeded with `npm run seed`

## Quick Test Flow

### 1. Admin Login

```bash
curl -X POST http://localhost:5000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@univote.com",
    "password": "admin123"
  }'
```

Save the `token` from the response as `ADMIN_TOKEN`.

### 2. Get Students List

```bash
curl http://localhost:5000/api/admin/students \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### 3. Student Login (First Time)

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "matric_no": "BU22CSC1001",
    "password": "1234"
  }'
```

This will return a 403 error requiring password change.

### 4. Change Password

```bash
curl -X PATCH http://localhost:5000/api/auth/change-password \
  -H "Authorization: Bearer FIRST_LOGIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "new_password": "newpassword123"
  }'
```

### 5. Login with New Password

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "matric_no": "BU22CSC1001",
    "password": "newpassword123"
  }'
```

Save the `token` as `STUDENT_TOKEN`.

### 6. Create Voting Session (Admin)

```bash
curl -X POST http://localhost:5000/api/admin/create-session \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "SUG Elections 2024",
    "description": "Student Union Government Elections",
    "start_time": "2024-01-01T08:00:00Z",
    "end_time": "2025-12-31T18:00:00Z",
    "categories": ["President", "Vice President"],
    "location": {
      "lat": 7.8525,
      "lng": 4.2811,
      "radius_meters": 5000
    },
    "candidates": [
      {
        "name": "John Doe",
        "position": "President",
        "photo_url": "https://via.placeholder.com/150",
        "bio": "Student leader"
      },
      {
        "name": "Jane Smith",
        "position": "President",
        "photo_url": "https://via.placeholder.com/150",
        "bio": "Future president"
      }
    ]
  }'
```

Save the `session._id` as `SESSION_ID`.

### 7. Get Eligible Sessions (Student)

```bash
curl http://localhost:5000/api/sessions \
  -H "Authorization: Bearer STUDENT_TOKEN"
```

### 8. Get Session Details

```bash
curl http://localhost:5000/api/sessions/SESSION_ID \
  -H "Authorization: Bearer STUDENT_TOKEN"
```

### 9. Submit Vote

```bash
curl -X POST http://localhost:5000/api/vote \
  -H "Authorization: Bearer STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "SESSION_ID",
    "choices": [
      {
        "candidate_id": "CANDIDATE_ID",
        "category": "President"
      }
    ],
    "image_url": "https://via.placeholder.com/300",
    "lat": 7.8525,
    "lng": 4.2811
  }'
```

Note: In production, `image_url` should be a real face image. For testing, the Azure API will reject placeholder images.

### 10. Get Results

```bash
curl http://localhost:5000/api/results/SESSION_ID \
  -H "Authorization: Bearer STUDENT_TOKEN"
```

## Postman Collection

Import this collection into Postman:

```json
{
  "info": {
    "name": "Univote API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Auth",
      "item": [
        {
          "name": "Student Login",
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\"matric_no\":\"BU22CSC1001\",\"password\":\"1234\"}"
            },
            "url": "{{base_url}}/api/auth/login"
          }
        },
        {
          "name": "Admin Login",
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\"email\":\"admin@univote.com\",\"password\":\"admin123\"}"
            },
            "url": "{{base_url}}/api/auth/admin-login"
          }
        }
      ]
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:5000"
    }
  ]
}
```

## Testing Face Detection

For testing face detection without real images, you can:

1. **Use Azure Face API Test Console**

   - Go to Azure Portal
   - Test detection manually

2. **Mock Image URLs**

   - Use services like `https://thispersondoesnotexist.com/`
   - Upload to a CDN/storage and use the URL

3. **Test Mode** (Development Only)
   - Temporarily modify `azureService.js` to skip detection
   - Remember to restore for production!

## Common Responses

### Success Response

```json
{
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Responses

```json
{
  "error": "Error message",
  "details": [ ... ]
}
```

### Validation Error

```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Valid email is required"
    }
  ]
}
```

## Rate Limiting

If you get rate limited:

```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

Wait for the time window to reset or adjust `RATE_LIMIT_WINDOW` and `RATE_LIMIT_MAX` in `.env`.
