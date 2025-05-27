import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';
import config from '../config/environment.js';
import logger from '../utils/logger.js';

// Create Redis client for rate limiting (optional)
let redisClient = null;

if (config.redis && config.redis.host) {
  try {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    redisClient.on('error', (err) => {
      logger.error('Redis rate limiter error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Redis rate limiter connected');
    });
  } catch (error) {
    logger.warn('Failed to connect to Redis for rate limiting:', error);
    redisClient = null;
  }
}

// Default rate limit configuration
const defaultOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path === '/health' || req.path === '/api/health';
  },
  onLimitReached: (req, res, options) => {
    logger.warn(`Rate limit reached for ${req.ip}`, {
      ip: req.ip,
      path: req.path,
      userId: req.user?._id
    });
  }
};

// General API rate limiter
export const generalLimiter = rateLimit(defaultOptions);

// Report generation rate limiter
export const reportLimiter = rateLimit({
  ...defaultOptions,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 report generations per hour
  message: {
    status: 'error',
    message: 'Too many report generation requests, please try again later.',
    retryAfter: '1 hour'
  }
});

// Authentication rate limiter
export const authLimiter = rateLimit({
  ...defaultOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    status: 'error',
    message: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  keyGenerator: (req) => {
    return req.body.email || req.ip;
  }
});

export default {
  generalLimiter,
  reportLimiter,
  authLimiter
};