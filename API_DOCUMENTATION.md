# Univote API Documentation

Complete API documentation for the Univote electronic voting system.

## 📋 Overview

Univote is a secure university voting system with the following features:

- **JWT-based authentication** for students and admins
- **Face++ API** facial verification
- **Geofencing** validation for voting locations
- **Real-time and final results**
- **Automated session ending** and results publishing
- **Email notifications** for voters
- **Comprehensive admin panel**

## 🚀 Quick Start

### 1. View API Documentation

The API documentation is available in multiple formats:

#### Swagger/OpenAPI Specification

- **File**: `swagger.json`
- **Format**: OpenAPI 3.0.3 JSON
- **View Online**: Import `swagger.json` into [Swagger Editor](https://editor.swagger.io/) or [Swagger UI](https://swagger.io/tools/swagger-ui/)

#### Interactive Test Pages

Located in the `test/` directory:

1. **Student Authentication Test** (`test/student-auth-test.html`)

   - Login & logout
   - Password management
   - Profile access
   - Token management

2. **Voting System Test** (`test/student-voting-test.html`)

   - Active sessions
   - Vote submission with face verification
   - Voting history
   - Live and final results

3. **Admin Panel Test** (`test/admin-test.html`)
   - Student management (CRUD)
   - Session management (CRUD)
   - CSV bulk upload
   - Session statistics

### 2. Start the Server

```bash
npm install
npm run dev
```

Server will start at `http://localhost:5000`

### 3. Open Test Interface

Navigate to `test/index.html` in your browser:

```
file:///path/to/Univote Backend/test/index.html
```

Or use a local server:

```bash
cd test
python -m http.server 8080
# Then open http://localhost:8080
```

## 📚 API Endpoints Overview

### Authentication Endpoints

| Method | Endpoint                    | Description                   | Auth Required           |
| ------ | --------------------------- | ----------------------------- | ----------------------- |
| POST   | `/api/auth/login`           | Student login                 | No                      |
| POST   | `/api/auth/admin-login`     | Admin login                   | No                      |
| GET    | `/api/auth/me`              | Get current user profile      | Yes (Student/Admin)     |
| PATCH  | `/api/auth/change-password` | Change password (first login) | Yes (First Login Token) |
| PATCH  | `/api/auth/update-password` | Update password               | Yes (Student/Admin)     |
| POST   | `/api/auth/logout`          | Logout                        | Yes (Student/Admin)     |

### Student Management (Admin Only)

| Method | Endpoint                     | Description                     | Auth Required |
| ------ | ---------------------------- | ------------------------------- | ------------- |
| POST   | `/api/admin/upload-students` | Bulk upload students from CSV   | Yes (Admin)   |
| GET    | `/api/admin/students`        | Get all students (with filters) | Yes (Admin)   |
| GET    | `/api/admin/students/:id`    | Get student by ID               | Yes (Admin)   |
| PATCH  | `/api/admin/students/:id`    | Update student                  | Yes (Admin)   |
| DELETE | `/api/admin/students/:id`    | Delete student                  | Yes (Admin)   |

### Session Management (Admin Only)

| Method | Endpoint                        | Description            | Auth Required |
| ------ | ------------------------------- | ---------------------- | ------------- |
| POST   | `/api/admin/create-session`     | Create voting session  | Yes (Admin)   |
| GET    | `/api/admin/sessions`           | Get all sessions       | Yes (Admin)   |
| GET    | `/api/admin/sessions/:id`       | Get session by ID      | Yes (Admin)   |
| PATCH  | `/api/admin/update-session/:id` | Update session         | Yes (Admin)   |
| DELETE | `/api/admin/delete-session/:id` | Delete session         | Yes (Admin)   |
| GET    | `/api/admin/session-stats/:id`  | Get session statistics | Yes (Admin)   |

### College Management (Admin Only)

| Method | Endpoint                              | Description       | Auth Required |
| ------ | ------------------------------------- | ----------------- | ------------- |
| GET    | `/api/admin/colleges`                 | Get all colleges  | Yes (Admin)   |
| POST   | `/api/admin/colleges`                 | Create college    | Yes (Admin)   |
| GET    | `/api/admin/colleges/:id`             | Get college by ID | Yes (Admin)   |
| PATCH  | `/api/admin/colleges/:id`             | Update college    | Yes (Admin)   |
| DELETE | `/api/admin/colleges/:id`             | Delete college    | Yes (Admin)   |
| POST   | `/api/admin/colleges/:id/departments` | Add department    | Yes (Admin)   |

### Candidate Management (Admin Only)

| Method | Endpoint                    | Description         | Auth Required |
| ------ | --------------------------- | ------------------- | ------------- |
| GET    | `/api/admin/candidates/:id` | Get candidate by ID | Yes (Admin)   |
| PATCH  | `/api/admin/candidates/:id` | Update candidate    | Yes (Admin)   |
| DELETE | `/api/admin/candidates/:id` | Delete candidate    | Yes (Admin)   |

### Super Admin Operations

| Method | Endpoint                  | Description               | Auth Required     |
| ------ | ------------------------- | ------------------------- | ----------------- |
| POST   | `/api/admin/create-admin` | Create new admin          | Yes (Super Admin) |
| GET    | `/api/admin/admins`       | Get all admins            | Yes (Super Admin) |
| DELETE | `/api/admin/cleanup-all`  | Delete all sessions/votes | Yes (Super Admin) |

### Voting Endpoints

| Method | Endpoint            | Description        | Auth Required |
| ------ | ------------------- | ------------------ | ------------- |
| POST   | `/api/vote`         | Submit vote        | Yes (Student) |
| GET    | `/api/vote/history` | Get voting history | Yes (Student) |

### Session Endpoints (Student)

| Method | Endpoint                         | Description         | Auth Required |
| ------ | -------------------------------- | ------------------- | ------------- |
| GET    | `/api/sessions/active`           | Get active sessions | Yes (Student) |
| GET    | `/api/sessions/:id`              | Get session details | Yes (Student) |
| GET    | `/api/sessions/my-votes`         | Get my votes        | Yes (Student) |
| GET    | `/api/sessions/:id/live-results` | Get live results    | Yes (Student) |

### Results Endpoints

| Method | Endpoint                   | Description       | Auth Required       |
| ------ | -------------------------- | ----------------- | ------------------- |
| GET    | `/api/results/:session_id` | Get final results | Yes (Student/Admin) |

## 🔐 Authentication

### Student Authentication Flow

1. **First Login**

   ```bash
   POST /api/auth/login
   Body: {
     "matric_no": "BU22CSC1005",
     "password": "1234"  # Default password
   }
   Response: {
     "error": "Password change required",
     "message": "You must change your password on first login",
     "code": "FIRST_LOGIN",
     "token": "first_login_token"
   }
   ```

2. **Change Password (First Login)**

   ```bash
   PATCH /api/auth/change-password
   Headers: { "Authorization": "Bearer first_login_token" }
   Body: {
     "new_password": "NewSecure@Pass123"
   }
   Response: {
     "message": "Password changed successfully",
     "token": "student_token",
     "student": {
       "id": "student_id",
       "matric_no": "BU22CSC1005",
       "full_name": "Muhammed Abiodun",
       "email": "muhammedabiodun42@gmail.com",
       "department": "Computer Science",
       "department_code": "CSC",
       "college": "College of Computing and Communication Studies",
       "level": "400",
       "photo_url": "https://cloudinary.com/.../photo.jpg",
       "has_facial_data": true
     }
   }
   ```

3. **Regular Login**

   ```bash
   POST /api/auth/login
   Body: {
     "matric_no": "BU22CSC1005",
     "password": "NewSecure@Pass123"
   }
   Response: {
     "message": "Login successful",
     "token": "student_token",
     "student": {
       "id": "student_id",
       "matric_no": "BU22CSC1005",
       "full_name": "Muhammed Abiodun",
       "email": "muhammedabiodun42@gmail.com",
       "department": "Computer Science",
       "department_code": "CSC",
       "college": "College of Computing and Communication Studies",
       "level": "400",
       "photo_url": "https://cloudinary.com/.../photo.jpg",
       "has_facial_data": true,
       "created_at": "2024-01-01T00:00:00.000Z",
       "last_login_at": "2024-03-01T10:30:00.000Z"
     },
     "new_device": false
   }
   ```

4. **Get Profile**

   ```bash
   GET /api/auth/me
   Headers: { "Authorization": "Bearer student_token" }
   Response: {
     "student": {
       "id": "student_id",
       "matric_no": "BU22CSC1005",
       "full_name": "Muhammed Abiodun",
       "email": "muhammedabiodun42@gmail.com",
       "department": "Computer Science",
       "department_code": "CSC",
       "college": "College of Computing and Communication Studies",
       "level": "400",
       "photo_url": "https://cloudinary.com/.../photo.jpg",
       "has_facial_data": true,
       "is_logged_in": true,
       "first_login": false,
       "last_login_at": "2024-03-01T10:30:00.000Z",
       "created_at": "2024-01-01T00:00:00.000Z",
       "has_voted_sessions": ["session_id_1", "session_id_2"]
     },
     "profile": {
       "id": "student_id",
       "matric_no": "BU22CSC1005",
       "full_name": "Muhammed Abiodun",
       "email": "muhammedabiodun42@gmail.com",
       "department": "Computer Science",
       "department_code": "CSC",
       "college": "College of Computing and Communication Studies",
       "level": "400",
       "photo_url": "https://cloudinary.com/.../photo.jpg",
       "has_facial_data": true,
       "is_logged_in": true,
       "first_login": false,
       "last_login_at": "2024-03-01T10:30:00.000Z",
       "created_at": "2024-01-01T00:00:00.000Z",
       "has_voted_sessions": ["session_id_1", "session_id_2"]
     }
   }
   ```

5. **Access Protected Routes**
   ```bash
   GET /api/sessions/active
   Headers: { "Authorization": "Bearer student_token" }
   ```

### Admin Authentication Flow

1. **Admin Login**

   ```bash
   POST /api/auth/admin-login
   Body: {
     "email": "admin@univote.com",
     "password": "AdminPass@123"
   }
   Response: {
     "token": "admin_token"
   }
   ```

2. **Access Admin Routes**
   ```bash
   GET /api/admin/students
   Headers: { "Authorization": "Bearer admin_token" }
   ```

## 📝 Example Requests

### Create a Voting Session

```bash
POST /api/admin/create-session
Headers: {
  "Authorization": "Bearer admin_token",
  "Content-Type": "application/json"
}
Body: {
  "title": "Student Union Election 2024",
  "description": "Annual student union election",
  "start_time": "2024-03-01T09:00:00Z",
  "end_time": "2024-03-01T17:00:00Z",
  "categories": [
    {
      "name": "President",
      "max_choices": 1
    },
    {
      "name": "Vice President",
      "max_choices": 1
    }
  ],
  "eligible_voters": {
    "colleges": ["Engineering", "Sciences"],
    "departments": [],
    "levels": ["300", "400", "500"]
  },
  "location": {
    "name": "Bowen University",
    "coordinates": {
      "lat": 7.8525,
      "lng": 4.2811
    },
    "radius": 5000
  }
}
```

### Submit a Vote

```bash
POST /api/vote
Headers: {
  "Authorization": "Bearer student_token",
  "Content-Type": "application/json"
}
Body: {
  "session_id": "65a1b2c3d4e5f6g7h8i9j0k1",
  "choices": [
    {
      "category": "President",
      "candidate_id": "65a1b2c3d4e5f6g7h8i9j0k2"
    },
    {
      "category": "Vice President",
      "candidate_id": "65a1b2c3d4e5f6g7h8i9j0k3"
    }
  ],
  "image_url": "https://example.com/face.jpg",
  "lat": 7.8525,
  "lng": 4.2811
}
```

### Upload Students from CSV

```bash
POST /api/admin/upload-students
Headers: {
  "Authorization": "Bearer admin_token",
  "Content-Type": "application/json"
}
Body: {
  "csv_data": [
    {
      "matric_no": "ENG/2020/001",
      "full_name": "John Doe",
      "email": "john.doe@student.com",
      "department": "Computer Science",
      "college": "Engineering",
      "level": "300"
    },
    {
      "matric_no": "SCI/2020/002",
      "full_name": "Jane Smith",
      "email": "jane.smith@student.com",
      "department": "Physics",
      "college": "Sciences",
      "level": "400"
    }
  ],
  "target_college": "Engineering",
  "target_level": "300"
}
```

## 🔧 Testing with cURL

### Student Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "matric_no": "ENG/2020/001",
    "password": "1234"
  }'
```

### Get Active Sessions

```bash
curl -X GET http://localhost:5000/api/sessions/active \
  -H "Authorization: Bearer <student_token>"
```

### Admin Create Session

```bash
curl -X POST http://localhost:5000/api/admin/create-session \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d @session.json
```

## 📊 Response Formats

### Success Response

```json
{
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

### Pagination Response

```json
{
  "students": [ ... ],
  "pagination": {
    "total": 100,
    "page": 1,
    "pages": 10,
    "limit": 10
  }
}
```

## 🧪 Test Credentials

### Student Accounts

- **Matric No**: Any registered student matric number
- **Default Password**: `1234` (must be changed on first login)

### Admin Accounts

- **Email**: Configure in admin seeder
- **Password**: Set during admin creation

### Sample Test Data

Use the test HTML files in the `test/` directory which include:

- Sample student data generators
- Sample session creators
- Pre-filled form data for quick testing

## 📖 Additional Resources

- **Swagger Editor**: [https://editor.swagger.io/](https://editor.swagger.io/)
- **Postman Collection**: Import `swagger.json` as OpenAPI 3.0 spec
- **Interactive Tests**: Open `test/index.html` for browser-based testing

## 🐛 Troubleshooting

### Common Issues

1. **401 Unauthorized**

   - Ensure you're using the correct token
   - Check if token has expired
   - Verify Authorization header format: `Bearer <token>`

2. **403 Forbidden**

   - Check if you have the required permissions
   - Admin endpoints require admin token
   - Super Admin endpoints require super_admin role

3. **400 Bad Request**

   - Validate request body against schema
   - Check required fields
   - Ensure correct data types

4. **CORS Errors**
   - Server must be running on same origin or CORS enabled
   - Check API URL in test files

## 📧 Support

For issues or questions:

- Email: support@univote.com
- Check the test HTML files for working examples
- Review swagger.json for complete API specification

---

**Last Updated**: 2024
**API Version**: 2.0.0
**Documentation Format**: OpenAPI 3.0.3
