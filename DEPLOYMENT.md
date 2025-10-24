# Univote Backend - Deployment Checklist

## Pre-Deployment

### Security

- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Use production MongoDB URI (MongoDB Atlas)
- [ ] Set `NODE_ENV=production`
- [ ] Review and adjust rate limiting values
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS for production domain only
- [ ] Review and secure all API keys

### Database

- [ ] Create MongoDB Atlas cluster
- [ ] Configure IP whitelist
- [ ] Create database user with appropriate permissions
- [ ] Test connection from deployment server
- [ ] Set up database backups

### Email

- [ ] Configure production email service
- [ ] Test email delivery
- [ ] Set up SPF/DKIM records
- [ ] Configure email templates with production URLs

### Azure Face API

- [ ] Create production Azure Face resource
- [ ] Configure billing alerts
- [ ] Test API quota limits
- [ ] Set up monitoring

### Environment Variables

```bash
# Production .env template
NODE_ENV=production
PORT=5000

# MongoDB
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/univote

# JWT
JWT_SECRET=<GENERATE_STRONG_SECRET>
JWT_EXPIRY=24h

# Email
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASS=<APP_PASSWORD>
EMAIL_FROM=Univote <noreply@yourdomain.com>

# Azure
AZURE_FACE_ENDPOINT=https://region.api.cognitive.microsoft.com/face/v1.0
AZURE_FACE_KEY=<PRODUCTION_KEY>

# App
FRONTEND_URL=https://yourdomain.com

# Rate Limiting (adjust as needed)
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

## Deployment Options

### Option 1: VPS/Cloud Server (DigitalOcean, AWS EC2, etc.)

#### Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone repository
git clone <your-repo-url>
cd univote-backend

# Install dependencies
npm ci --production

# Setup environment
nano .env
# Paste production values

# Start with PM2
pm2 start src/app.js --name univote-api
pm2 save
pm2 startup
```

#### Nginx Configuration

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

### Option 2: Heroku

#### Preparation

```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
heroku create univote-api

# Add MongoDB addon
heroku addons:create mongolab:sandbox

# Set environment variables
heroku config:set JWT_SECRET=your_secret
heroku config:set AZURE_FACE_KEY=your_key
# ... set all other variables

# Deploy
git push heroku main

# Run seed (if needed)
heroku run npm run seed
```

### Option 3: Docker

#### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
```

#### docker-compose.yml

```yaml
version: "3.8"

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGO_URI=${MONGO_URI}
      - JWT_SECRET=${JWT_SECRET}
      # ... other env vars
    depends_on:
      - mongo
    restart: unless-stopped

  mongo:
    image: mongo:6
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

volumes:
  mongo-data:
```

#### Deploy

```bash
docker-compose up -d
```

### Option 4: Azure App Service

```bash
# Install Azure CLI
az login

# Create resource group
az group create --name univote-rg --location eastus

# Create app service plan
az appservice plan create --name univote-plan --resource-group univote-rg --sku B1 --is-linux

# Create web app
az webapp create --resource-group univote-rg --plan univote-plan --name univote-api --runtime "NODE|18-lts"

# Configure deployment
az webapp deployment source config --name univote-api --resource-group univote-rg --repo-url <your-git-url> --branch main

# Set environment variables
az webapp config appsettings set --resource-group univote-rg --name univote-api --settings JWT_SECRET=your_secret
```

## Post-Deployment

### Testing

- [ ] Test all API endpoints
- [ ] Verify authentication works
- [ ] Test file uploads (if applicable)
- [ ] Verify email sending
- [ ] Test face detection
- [ ] Check geofence validation
- [ ] Verify rate limiting
- [ ] Test error handling

### Monitoring

- [ ] Set up application monitoring (PM2, New Relic, DataDog)
- [ ] Configure error tracking (Sentry)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
- [ ] Configure log aggregation
- [ ] Set up alerts for critical errors

### Performance

- [ ] Enable compression
- [ ] Configure caching headers
- [ ] Optimize database queries
- [ ] Set up CDN for static assets
- [ ] Monitor API response times

### Backup

- [ ] Configure database backups
- [ ] Set up automated backup schedule
- [ ] Test restore procedure
- [ ] Document backup retention policy

### Documentation

- [ ] Update API documentation with production URLs
- [ ] Document deployment process
- [ ] Create runbook for common issues
- [ ] Document rollback procedure

## Maintenance

### Regular Tasks

- [ ] Monitor error logs daily
- [ ] Review performance metrics weekly
- [ ] Update dependencies monthly
- [ ] Review security advisories
- [ ] Test backups quarterly

### Scaling Considerations

- [ ] Monitor CPU/Memory usage
- [ ] Set up auto-scaling if needed
- [ ] Consider database read replicas
- [ ] Implement caching (Redis)
- [ ] Consider CDN for API responses

## Rollback Plan

If deployment fails:

1. **Immediate Rollback**

   ```bash
   # PM2
   pm2 stop univote-api
   git checkout previous-stable-tag
   npm ci --production
   pm2 restart univote-api

   # Heroku
   heroku rollback

   # Docker
   docker-compose down
   git checkout previous-stable-tag
   docker-compose up -d
   ```

2. **Database Rollback**

   - Restore from latest backup
   - Run migration scripts if needed

3. **Communication**
   - Notify users of issues
   - Update status page
   - Document incident

## Support Contacts

- **Hosting Provider**: [Support Link]
- **MongoDB Atlas**: support@mongodb.com
- **Azure Support**: [Azure Portal]
- **Domain Registrar**: [Support Link]

## Useful Commands

```bash
# PM2
pm2 status
pm2 logs univote-api
pm2 restart univote-api
pm2 monit

# Docker
docker-compose logs -f
docker-compose restart
docker-compose ps

# MongoDB
mongodump --uri="mongodb+srv://..." --out=backup/
mongorestore --uri="mongodb+srv://..." backup/

# Check disk space
df -h

# Check memory
free -h

# Check running processes
top
```

## Emergency Procedures

### Server Down

1. Check server status
2. Check application logs
3. Restart application
4. Check database connection
5. Verify external services (Azure, Email)

### Database Issues

1. Check MongoDB Atlas status
2. Verify connection string
3. Check network access rules
4. Review slow queries
5. Contact MongoDB support

### High Traffic

1. Enable rate limiting
2. Scale horizontally
3. Implement caching
4. Optimize database queries
5. Consider CDN

---

**Deployment Date**: ****\_\_\_****
**Deployed By**: ****\_\_\_****
**Version**: ****\_\_\_****
