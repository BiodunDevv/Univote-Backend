# Univote - University Voting System Backend

A secure, scalable university voting system with facial recognition, geofencing, and real-time results. Built with Node.js, Express, MongoDB, and Face++ API.

## 🎯 Features

### Core Functionality

- **Secure Authentication**: JWT-based auth with forced password change on first login
- **Single Active Session**: Automatic logout when logging in from a new device
- **Facial Recognition**: Face++ API integration for identity verification during voting
- **Geofencing**: Location-based voting with customizable radius
- **Real-time Results**: Live vote counts and result publication
- **Email Notifications**: Welcome emails, device alerts, vote confirmations, and result announcements

### Security Features

- ✅ Bcrypt password hashing
- ✅ Rate limiting on all endpoints
- ✅ Input validation and sanitization
- ✅ Audit logging for all actions
- ✅ Single session enforcement
- ✅ Geofence validation
- ✅ Duplicate face detection
- ✅ CORS protection

### Admin Features

- CSV student upload with automatic welcome emails
- Dynamic voting session creation with custom categories
- Session management (create, update, delete)
- Student management (bulk operations)
- Real-time statistics and analytics
- Result publication and email notifications

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Face++ API account (free tier available)
- Gmail account (for email notifications)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd "Univote Backend"
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/univote

# JWT Secret (change this!)
JWT_SECRET=your_super_secret_jwt_key_here

# Email Configuration (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=Univote <noreply@univote.com>

# Face++ API Configuration
FACEPP_API_KEY=your_facepp_api_key
FACEPP_API_SECRET=your_facepp_api_secret
FACE_CONFIDENCE_THRESHOLD=80

# Geofence Configuration (Bowen University)
DEFAULT_CAMPUS_LAT=7.8525
DEFAULT_CAMPUS_LNG=4.2811
DEFAULT_CAMPUS_RADIUS=5000

# Security
BCRYPT_ROUNDS=10
JWT_EXPIRY=24h

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

### 3. Face++ API Setup

1. Go to [Face++ Console](https://console.faceplusplus.com/)
2. Sign up for a free account (no credit card required)
3. Create a new API Key
4. Copy the API Key and API Secret to your `.env` file
5. Free tier includes:
   - 1,000 calls/month for Detect API
   - 1,000 calls/month for Compare API
   - Perfect for testing and small deployments

### 4. Gmail App Password Setup

1. Enable 2-Factor Authentication on your Gmail account
2. Go to [App Passwords](https://myaccount.google.com/apppasswords)
3. Generate a new app password for "Mail"
4. Copy the password to `EMAIL_PASS` in `.env`

### 5. Seed Database

```bash
npm run seed
```

This will:

- Clear existing data
- Create a super admin account
- Generate sample students with realistic data
- Send welcome emails to all students

**Default Credentials:**

- **Admin**: `admin@univote.com` / `admin123`
- **Students**: `{matric_no}` / `1234` (must change on first login)

### 6. Start Server

```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

Server will run on `http://localhost:5000`

## 📚 API Documentation

### Authentication Endpoints

#### Student Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "matric_no": "BU22CSC1001",
  "password": "1234",
  "device_id": "optional-device-id"
}

Response:
{
  "message": "Login successful",
  "token": "jwt-token",
  "student": { ... },
  "new_device": false
}
```

#### Admin Login

```http
POST /api/auth/admin-login
Content-Type: application/json

{
  "email": "admin@univote.com",
  "password": "admin123"
}
```

#### Change Password

```http
PATCH /api/auth/change-password
Authorization: Bearer {token}
Content-Type: application/json

{
  "old_password": "1234",  // Not required for first login
  "new_password": "newpassword123"
}
```

#### Get Profile

```http
GET /api/auth/me
Authorization: Bearer {token}
```

#### Logout

```http
POST /api/auth/logout
Authorization: Bearer {token}
```

### Admin Endpoints

#### Upload Students (CSV)

```http
POST /api/admin/upload-students
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "csv_data": [
    {
      "matric_no": "BU22CSC1001",
      "full_name": "John Doe",
      "email": "john@example.com",
      "department": "Computer Science",
      "college": "College of Computing and Communication Studies",
      "level": "200"
    }
  ]
}
```

#### Create Voting Session

```http
POST /api/admin/create-session
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "title": "SUG Elections 2024",
  "description": "Student Union Government Elections",
  "start_time": "2024-03-01T08:00:00Z",
  "end_time": "2024-03-01T18:00:00Z",
  "eligible_college": null,
  "eligible_departments": null,
  "eligible_levels": ["200", "300", "400"],
  "categories": ["President", "Vice President", "Secretary"],
  "location": {
    "lat": 7.8525,
    "lng": 4.2811,
    "radius_meters": 5000
  },
  "is_off_campus_allowed": false,
  "candidates": [
    {
      "name": "Jane Smith",
      "position": "President",
      "photo_url": "https://example.com/photo.jpg",
      "bio": "Bio text",
      "manifesto": "Manifesto text"
    }
  ]
}
```

#### Update Session

```http
PATCH /api/admin/update-session/:id
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "title": "Updated Title",
  "results_public": true
}
```

#### Delete Session

```http
DELETE /api/admin/delete-session/:id
Authorization: Bearer {admin-token}
```

#### Remove Department

```http
DELETE /api/admin/remove-department
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "departments": ["Computer Science"]
  // or single: "departments": "Computer Science"
}
```

#### Create Admin

```http
POST /api/admin/create-admin
Authorization: Bearer {super-admin-token}
Content-Type: application/json

{
  "email": "newadmin@univote.com",
  "password": "securepassword",
  "full_name": "New Admin",
  "role": "admin"  // or "super_admin"
}
```

#### Get Students

```http
GET /api/admin/students?college=College&department=Dept&level=200&page=1&limit=50
Authorization: Bearer {admin-token}
```

#### Get Sessions

```http
GET /api/admin/sessions
Authorization: Bearer {admin-token}
```

#### Get Session Statistics

```http
GET /api/admin/session-stats/:id
Authorization: Bearer {admin-token}
```

### Student Endpoints

#### List Eligible Sessions

```http
GET /api/sessions?status=active
Authorization: Bearer {student-token}
```

#### Get Session Details

```http
GET /api/sessions/:id
Authorization: Bearer {student-token}
```

### Voting Endpoints

#### Submit Vote

```http
POST /api/vote
Authorization: Bearer {student-token}
Content-Type: application/json

{
  "session_id": "session-id",
  "choices": [
    {
      "candidate_id": "candidate-id",
      "category": "President"
    }
  ],
  "image_url": "https://example.com/selfie.jpg",
  "lat": 7.8525,
  "lng": 4.2811,
  "device_id": "optional-device-id"
}

Response on success:
{
  "message": "Vote submitted successfully",
  "votes": [
    {
      "position": "President",
      "candidate_name": "Jane Smith"
    }
  ]
}

Possible errors:
- 400: Face detection failed / No face / Multiple faces
- 403: Not eligible / Outside geofence
- 409: Already voted / Duplicate face detected
```

#### Get Voting History

```http
GET /api/vote/history
Authorization: Bearer {student-token}
```

### Results Endpoints

#### Get Session Results

```http
GET /api/results/:session_id
Authorization: Bearer {student-token}

Response:
{
  "session": { ... },
  "has_voted": true,
  "total_valid_votes": 150,
  "results": [
    {
      "position": "President",
      "total_votes": 150,
      "candidates": [
        {
          "id": "...",
          "name": "Jane Smith",
          "vote_count": 95,
          "percentage": 63.33,
          "is_winner": true
        }
      ]
    }
  ]
}
```

#### Publish Results (Admin)

```http
POST /api/results/:session_id/publish
Authorization: Bearer {admin-token}
```

#### Get Overview Statistics (Admin)

```http
GET /api/results/stats/overview
Authorization: Bearer {admin-token}
```

## 🗄️ Database Models

### Student

```javascript
{
  matric_no: String (unique),
  full_name: String,
  email: String,
  password_hash: String,
  first_login: Boolean,
  department: String,
  college: String,
  level: String ('100'-'600'),
  has_voted_sessions: [ObjectId],
  photo_url: String,
  face_token: String,
  embedding_vector: String,
  is_logged_in: Boolean,
  last_login_device: String,
  active_token: String
}
```

### Admin

```javascript
{
  email: String (unique),
  password_hash: String,
  role: String ('admin' | 'super_admin'),
  full_name: String,
  is_active: Boolean
}
```

### VotingSession

```javascript
{
  title: String,
  description: String,
  start_time: Date,
  end_time: Date,
  eligible_college: String?,
  eligible_departments: [String]?,
  eligible_levels: [String]?,
  categories: [String],
  status: String ('upcoming' | 'active' | 'ended'),
  candidates: [ObjectId],
  location: {
    lat: Number,
    lng: Number,
    radius_meters: Number
  },
  is_off_campus_allowed: Boolean,
  results_public: Boolean
}
```

### Candidate

```javascript
{
  session_id: ObjectId,
  name: String,
  position: String,
  photo_url: String,
  vote_count: Number,
  bio: String,
  manifesto: String
}
```

### Vote

```javascript
{
  student_id: ObjectId,
  session_id: ObjectId,
  candidate_id: ObjectId,
  position: String,
  geo_location: { lat: Number, lng: Number },
  face_match_score: Number,
  face_verification_passed: Boolean,
  face_token: String,
  timestamp: Date,
  status: String ('valid' | 'duplicate' | 'rejected'),
  device_id: String
}
```

## 🔒 Security Best Practices

1. **Password Security**

   - Default password: `1234` (must change on first login)
   - Minimum 6 characters for new passwords
   - Bcrypt hashing with salt rounds

2. **Session Management**

   - Single active session per student
   - Previous sessions invalidated on new login
   - Email notification on device change

3. **Rate Limiting**

   - Auth endpoints: 5 requests per 15 minutes
   - Vote endpoint: 10 requests per minute
   - Face API: 20 requests per minute
   - General API: 100 requests per 15 minutes

4. **Input Validation**

   - All inputs validated using express-validator
   - Coordinates validated for geofence
   - Image URLs validated before Face++ API calls

5. **Audit Logging**
   - All sensitive operations logged
   - Includes user info, action, and timestamp
   - Failed attempts tracked

## 🎨 Email Templates

All email templates use Facebook-style design with:

- Gradient headers
- Responsive layout
- Professional styling
- Mobile-friendly

Templates available:

- `welcome.html` - Sent on student creation
- `new_device_alert.html` - Sent on new device login
- `vote_confirmation.html` - Sent after successful vote
- `result_announcement.html` - Sent when results published
- `password_reset.html` - Sent for password reset

## 🧪 Testing

### Health Check

```bash
curl http://localhost:5000/health
```

### Test Admin Login

```bash
curl -X POST http://localhost:5000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@univote.com","password":"admin123"}'
```

### Test Student Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"matric_no":"BU22CSC1001","password":"1234"}'
```

## 📦 Deployment

### Environment Variables

Ensure all production values are set in `.env`:

- Use strong `JWT_SECRET`
- Use production MongoDB URI
- Configure real Face++ API credentials
- Use production email credentials

### MongoDB Atlas Setup

1. Create cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Whitelist your server IP
3. Create database user
4. Copy connection string to `MONGO_URI`

### PM2 Deployment

```bash
npm install -g pm2
pm2 start src/app.js --name univote-api
pm2 save
pm2 startup
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 📝 Matric Number Format

Students are generated with the format: `BU{YY}{CODE}{NNNN}`

Examples:

- `BU22CSC1001` - 2022, Computer Science, Student #1001
- `BU23ENG2050` - 2023, Engineering, Student #2050
- `BU21MGT0500` - 2021, Management, Student #0500

College codes:

- `CSC` - College of Computing and Communication Studies
- `ENG` - College of Engineering
- `SCI` - College of Science
- `MGT` - College of Management Sciences
- `SOC` - College of Social Sciences

## 🔧 Troubleshooting

### MongoDB Connection Issues

```bash
# Check if MongoDB is running
mongod --version

# Start MongoDB service
# Windows: net start MongoDB
# Linux: sudo systemctl start mongod
# Mac: brew services start mongodb-community
```

### Email Not Sending

- Verify Gmail app password is correct
- Check 2FA is enabled on Gmail account
- Ensure less secure apps access is NOT enabled (use app password instead)

### Face++ API Errors

- Verify API key and secret are correct
- Check you haven't exceeded free tier quota (1,000 calls/month)
- Ensure image URLs are publicly accessible
- Test credentials in Face++ Console

### Port Already in Use

```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :5000
kill -9 <PID>
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

ISC

## 👥 Support

For issues and questions:

- Create an issue on GitHub
- Email: support@univote.com

## 🎉 Acknowledgments

- Face++ API for facial recognition
- MongoDB for database
- Express.js for backend framework
- Nodemailer for email service

---

Built with ❤️ for secure university elections
