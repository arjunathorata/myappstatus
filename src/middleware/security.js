import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import hpp from 'hpp';
import cors from 'cors';
import config from '../config/environment.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';

// Initialize DOMPurify for server-side use
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Security headers with Helmet
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// CORS configuration
export const corsConfig = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = Array.isArray(config.cors.origin) 
      ? config.cors.origin 
      : [config.cors.origin];
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new AppError('Not allowed by CORS', 403));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400
});

// Sanitize NoSQL injection attempts
export const noSQLInjectionProtection = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn(`NoSQL injection attempt detected`, {
      ip: req.ip,
      path: req.path,
      key,
      userAgent: req.get('User-Agent')
    });
  }
});

// XSS Protection using DOMPurify
export const xssProtection = (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }
    
    next();
  } catch (error) {
    logger.error('XSS protection error:', error);
    next(error);
  }
};

// Sanitize object recursively using DOMPurify
const sanitizeObject = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? DOMPurify.sanitize(obj) : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = DOMPurify.sanitize(key);
    sanitized[sanitizedKey] = sanitizeObject(value);
  }
  
  return sanitized;
};

// HTTP Parameter Pollution protection
export const hppProtection = hpp({
  whitelist: ['tags', 'categories', 'status', 'priority', 'roles']
});

// Apply all security middleware
export const applySecurity = (app) => {
  app.use(securityHeaders);
  app.use(corsConfig);
  app.use(noSQLInjectionProtection);
  app.use(xssProtection);
  app.use(hppProtection);
  
  logger.info('Security middleware applied');
};

export default {
  securityHeaders,
  corsConfig,
  noSQLInjectionProtection,
  xssProtection,
  hppProtection,
  applySecurity
};