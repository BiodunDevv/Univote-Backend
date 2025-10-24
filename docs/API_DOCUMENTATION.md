# Univote API Documentation

## 📚 Swagger Documentation

The complete API documentation is available via Swagger UI. Once the server is running, visit:

**🔗 http://localhost:5000/api-docs**

The Swagger documentation provides:
- ✅ Complete endpoint reference (31 endpoints)
- ✅ Interactive API testing interface
- ✅ Request/response schemas
- ✅ Authentication flows
- ✅ Example payloads
- ✅ Error responses

---

## 🚀 Quick Start

### 1. Start the Server
```bash
npm run dev
```

### 2. Access Documentation
Open your browser and navigate to:
```
http://localhost:5000/api-docs
```

### 3. Test the API
The root URL automatically redirects to documentation:
```
http://localhost:5000/
```

---

## 📖 API Overview

### Base URL
```
http://localhost:5000/api
```

### Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Token Types
- **`first_login`** - Initial login token (requires password change)
- **`student`** - Regular student access token
- **`admin`** - Admin access token

---

## 🔐 Authentication Flow

### New Student Login Flow

1. **First Login** (Default password: `1234`)
   ```http
   POST /api/auth/login
   {
     "matric_no": "BU22CSC1005",
     "password": "1234"
   }
   ```
   **Response**: Returns `first_login` token

2. **Change Password**
   ```http
   PATCH /api/auth/change-password
   Authorization: Bearer <first_login_token>
   {
     "new_password": "mySecurePassword123"
   }
   ```
   **Response**: Returns `student` token + sends welcome email ✉️

3. **Regular Login** (Use new password)
   ```http
   POST /api/auth/login
   {
     "matric_no": "BU22CSC1005",
     "password": "mySecurePassword123"
   }
   ```
   **Response**: Returns `student` token

### Admin Login Flow

```http
POST /api/auth/admin-login
{
  "email": "louisdiaz43@gmail.com",
  "password": "balikiss12"
}
```
**Response**: Returns `admin` token

---

## 📋 Endpoint Categories

### 🔑 Authentication (6 endpoints)
- `POST /api/auth/login` - Student login
- `POST /api/auth/admin-login` - Admin login
- `PATCH /api/auth/change-password` - Change password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get profile

### 👥 Admin - Students (3 endpoints)
- `POST /api/admin/upload-students` - Bulk upload students
- `GET /api/admin/students` - Get all students (with filters)
- `DELETE /api/admin/remove-department` - Remove department

### 🗳️ Admin - Sessions (5 endpoints)
- `POST /api/admin/create-session` - Create voting session
- `GET /api/admin/sessions` - Get all sessions
- `PATCH /api/admin/update-session/:id` - Update session
- `DELETE /api/admin/delete-session/:id` - Delete session
- `GET /api/admin/session-stats/:id` - Get session statistics

### ⚙️ Admin - System (2 endpoints)
- `POST /api/admin/create-admin` - Create admin (super admin only)
- `DELETE /api/admin/cleanup-all` - Cleanup all data (super admin only)

### 📊 Student - Sessions (2 endpoints)
- `GET /api/sessions` - List eligible sessions
- `GET /api/sessions/:id` - Get session details

### ✅ Student - Voting (2 endpoints)
- `POST /api/vote` - Submit vote (with face verification & geofencing)
- `GET /api/vote/history` - Get voting history

### 🏆 Results (3 endpoints)
- `GET /api/results/:session_id` - Get session results
- `POST /api/results/:session_id/publish` - Publish results (admin)
- `GET /api/results/stats/overview` - Get overall statistics (admin)

---

## 🎯 Common Use Cases

### Use Case 1: Admin Creates Election

```http
# 1. Admin Login
POST /api/auth/admin-login
{
  "email": "louisdiaz43@gmail.com",
  "password": "balikiss12"
}

# 2. Create Voting Session
POST /api/admin/create-session
Authorization: Bearer <admin_token>
{
  "title": "Student Union Elections 2024",
  "start_time": "2025-10-28T08:00:00Z",
  "end_time": "2025-10-28T18:00:00Z",
  "eligibility_criteria": {
    "colleges": ["COCCS", "COMSS"],
    "levels": ["200", "300", "400"]
  },
  "location": {
    "coordinates": [4.2811, 7.8525],
    "name": "Bowen University Campus",
    "radius_meters": 5000
  },
  "categories": [
    {
      "position": "President",
      "max_selections": 1,
      "candidates": [
        {
          "matric_no": "BU22CSC1005",
          "manifesto": "Building a united community"
        }
      ]
    }
  ]
}
```

### Use Case 2: Student Votes

```http
# 1. Student Login
POST /api/auth/login
{
  "matric_no": "BU22CSC2001",
  "password": "studentPassword123"
}

# 2. View Available Sessions
GET /api/sessions?status=active
Authorization: Bearer <student_token>

# 3. Submit Vote
POST /api/vote
Authorization: Bearer <student_token>
{
  "session_id": "507f1f77bcf86cd799439011",
  "choices": [
    {
      "position": "President",
      "candidate_id": "507f1f77bcf86cd799439012"
    }
  ],
  "image_url": "https://example.com/student-face.jpg",
  "lat": 7.8525,
  "lng": 4.2811
}
```

### Use Case 3: Admin Publishes Results

```http
# 1. Check Session Statistics
GET /api/admin/session-stats/507f1f77bcf86cd799439011
Authorization: Bearer <admin_token>

# 2. Publish Results (sends emails to all participants)
POST /api/results/507f1f77bcf86cd799439011/publish
Authorization: Bearer <admin_token>
```

---

## 🔒 Security Features

### Rate Limiting
- **Authentication**: 5 requests per 15 minutes
- **Voting**: 10 requests per minute
- **Face API**: 20 requests per minute
- **General API**: 100 requests per 15 minutes

### Geofencing
- **Campus Location**: Bowen University (7.8525°N, 4.2811°E)
- **Radius**: 5000 meters
- **Validation**: Student must be within radius to vote

### Face Verification
- **Provider**: Azure Face API v1.0
- **Minimum Confidence**: 70%
- **Verification**: Student's face must match enrolled photo

### Password Security
- **Hashing**: bcrypt with 10 rounds
- **Minimum Length**: 6 characters (8 for admins)
- **Default Password**: `1234` (must change on first login)

---

## 📧 Email Notifications

The system sends automated emails for:

1. **Welcome Email** ✉️
   - Triggered after first password change
   - Contains account details and getting started guide

2. **Vote Confirmation** ✉️
   - Sent immediately after successful vote
   - Includes session details and security notice

3. **New Device Alert** ✉️
   - Sent when login from new device detected
   - Contains device info and security instructions

4. **Result Announcement** ✉️
   - Sent when admin publishes results
   - Includes election summary and results link

5. **Password Reset** ✉️
   - Contains reset link (valid for 1 hour)
   - Security warning included

**All emails use Facebook-style black/white theme with inline SVG icons**

---

## 🎓 Bowen University Configuration

### Colleges (7)
- **COAES** - College of Agriculture & Engineering Sciences
- **COMSS** - College of Management & Social Sciences
- **COLAW** - College of Law
- **COLBS** - College of Life and Biological Sciences
- **COHES** - College of Health Sciences
- **COCCS** - College of Computing & Communication Studies
- **COEVS** - College of Environmental Sciences

### Student Levels
- 100, 200, 300, 400, 500

### Default Admin
- **Email**: louisdiaz43@gmail.com
- **Password**: balikiss12
- **Role**: Super Admin

### Test Student
- **Matric No**: BU22CSC1005
- **Email**: muhammedabiodun42@gmail.com
- **Department**: Computer Science (COCCS)
- **Default Password**: 1234

---

## 🧪 Testing with Swagger UI

### Step 1: Authorize
1. Click the **"Authorize"** button in Swagger UI
2. Login using admin or student endpoint
3. Copy the token from response
4. Paste into Authorization modal: `Bearer <token>`
5. Click "Authorize"

### Step 2: Test Endpoints
- All authorized endpoints will now include your token
- Click "Try it out" on any endpoint
- Modify request body as needed
- Click "Execute"
- View response below

### Step 3: Common Test Flow
1. **Admin Login** → Copy admin token → Authorize
2. **Create Session** → Save session ID
3. **Student Login** → Copy student token → Authorize
4. **List Sessions** → Verify session appears
5. **Submit Vote** → Provide face image URL & GPS
6. **Get Results** → View published results

---

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

---

## 🔍 Filtering & Pagination

Many endpoints support query parameters:

### Students List
```
GET /api/admin/students?college=COCCS&department=Computer%20Science&level=200&page=1&limit=20
```

### Sessions List
```
GET /api/sessions?status=active&page=1&limit=10
```

### Search Students
```
GET /api/admin/students?search=Mohammed
```

---

## 🛠️ Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized / Invalid Token |
| 403 | Forbidden / Insufficient Privileges |
| 404 | Resource Not Found |
| 429 | Rate Limit Exceeded |
| 500 | Internal Server Error |

---

## 📁 Additional Resources

- **Postman Collection**: `Univote_Backend_Postman_Collection.json`
- **Swagger YAML**: `swagger.yaml`
- **Environment Variables**: `.env.example`
- **API Documentation**: `/docs/API.md`
- **Database Schema**: `/docs/DATABASE.md`

---

## 💡 Tips

1. **Use Swagger UI for testing** - It's faster than Postman for quick tests
2. **Import Postman collection** - For automated testing and workflows
3. **Check rate limits** - Authentication endpoints are heavily rate-limited
4. **Save tokens** - Tokens are valid for 24 hours
5. **Test geofencing** - Use Bowen coordinates (7.8525, 4.2811) for testing
6. **Face verification** - Ensure face image URLs are publicly accessible

---

## 🆘 Support

For issues or questions:
- Check Swagger documentation for detailed schemas
- Review example requests in Postman collection
- Check server logs for error details
- Verify environment variables are set correctly

---

**Built with ❤️ for Bowen University**
