# Univote Backend - Quick Start Guide

## ⚡ 5-Minute Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env` file and update these critical values:

```env
MONGO_URI=mongodb://localhost:27017/univote
JWT_SECRET=change_this_to_something_secure
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-gmail-app-password
AZURE_FACE_ENDPOINT=your-azure-endpoint
AZURE_FACE_KEY=your-azure-key
```

### 3. Start MongoDB

Make sure MongoDB is running on your system.

### 4. Seed Database

```bash
npm run seed
```

This creates:

- **Admin**: `admin@univote.com` / `admin123`
- **Students**: Multiple students with matric format `BU{YY}{CODE}{NNNN}` / `1234`

### 5. Start Server

```bash
npm run dev
```

Server runs on `http://localhost:5000`

## 🎯 First API Calls

### Test Server

```bash
curl http://localhost:5000/health
```

### Login as Admin

```bash
curl -X POST http://localhost:5000/api/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@univote.com","password":"admin123"}'
```

### Login as Student

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"matric_no":"BU22CSC1001","password":"1234"}'
```

Note: First login requires password change!

## 📁 Project Structure

```
Univote Backend/
├── src/
│   ├── controllers/     # Request handlers
│   ├── routes/          # API routes
│   ├── models/          # Database schemas
│   ├── services/        # Business logic (Azure, Email)
│   ├── middleware/      # Auth, validation, rate limiting
│   ├── utils/           # Helper functions
│   ├── emails/          # HTML email templates
│   ├── config/          # Configuration files
│   └── app.js          # Main application
├── scripts/
│   └── seed.js         # Database seeding
├── .env                # Environment variables
├── package.json        # Dependencies
└── README.md          # Full documentation
```

## 🔑 Key Features

1. **Authentication**

   - JWT tokens with 24h expiry
   - Forced password change on first login
   - Single active session per student

2. **Voting**

   - Azure Face API for duplicate prevention
   - Geofencing with customizable radius
   - Multi-position voting in single session

3. **Security**

   - Rate limiting on all endpoints
   - Input validation
   - Audit logging
   - Bcrypt password hashing

4. **Admin Features**
   - CSV student upload
   - Dynamic session creation
   - Real-time statistics
   - Result publication

## 📧 Email Setup (Gmail)

1. Enable 2FA on Gmail
2. Go to https://myaccount.google.com/apppasswords
3. Create app password for "Mail"
4. Use that password in `EMAIL_PASS`

## 🔧 Common Issues

### MongoDB Connection Failed

```bash
# Windows
net start MongoDB

# Linux
sudo systemctl start mongod

# Mac
brew services start mongodb-community
```

### Port 5000 Already in Use

```bash
# Change PORT in .env file
PORT=3000
```

### Azure Face API Errors

- Verify your endpoint URL format
- Check subscription key is valid
- Ensure you haven't exceeded free tier quota

## 📚 Next Steps

1. Read `README.md` for complete documentation
2. Check `API_TESTING.md` for testing examples
3. Review `DEPLOYMENT.md` before going to production
4. Customize email templates in `src/emails/`
5. Adjust rate limits in `.env` as needed

## 🆘 Getting Help

- Check the logs: `npm run dev` shows detailed errors
- Review `README.md` for API documentation
- Test endpoints with Postman or curl
- Check MongoDB is running: `mongod --version`

## 🚀 Production Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Use production MongoDB (MongoDB Atlas)
- [ ] Set `NODE_ENV=production`
- [ ] Configure production email service
- [ ] Set up SSL/HTTPS
- [ ] Configure CORS for your domain
- [ ] Review rate limiting settings
- [ ] Set up monitoring and logging
- [ ] Configure backups

## 📞 Support

For detailed documentation, see:

- `README.md` - Complete documentation
- `API_TESTING.md` - API testing guide
- `DEPLOYMENT.md` - Deployment guide

---

**Happy Coding! 🎉**
