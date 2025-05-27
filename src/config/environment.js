import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Default configuration with fallbacks
const config = {
  app: {
    name: process.env.APP_NAME || 'MyAppStatus',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || 'localhost'
  },

  database: {
    uri: process.env.DATABASE_URI || 'mongodb://localhost:27017/myappstatus',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT, 10) || 27017,
    name: process.env.DATABASE_NAME || 'myappstatus',
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    authSource: process.env.DATABASE_AUTH_SOURCE || 'admin',
    maxPoolSize: parseInt(process.env.DATABASE_MAX_POOL_SIZE, 10) || 10,
    serverSelectionTimeoutMS: parseInt(process.env.DATABASE_SERVER_SELECTION_TIMEOUT, 10) || 5000,
    socketTimeoutMS: parseInt(process.env.DATABASE_SOCKET_TIMEOUT, 10) || 45000,
    maxIdleTimeMS: parseInt(process.env.DATABASE_MAX_IDLE_TIME, 10) || 30000
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production-minimum-32-characters',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    algorithm: process.env.JWT_ALGORITHM || 'HS256'
  },

  redis: {
    host: process.env.REDIS_HOST || null,
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: parseInt(process.env.REDIS_DB, 10) || 0
  },

  email: {
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASS || ''
    }
  },

  cors: {
    origin: process.env.CORS_ORIGIN ? 
      process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : 
      ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080'],
    credentials: true
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5,
    lockoutTime: parseInt(process.env.LOCKOUT_TIME, 10) || 15 * 60 * 1000
  },

  features: {
    enableSwagger: process.env.ENABLE_SWAGGER !== 'false',
    enableEmailNotifications: process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false',
    enableCaching: process.env.ENABLE_CACHING !== 'false'
  }
};

export default config;