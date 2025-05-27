import Redis from 'ioredis';
import config from '../config/environment.js';
import logger from '../utils/logger.js';

// Redis client setup
let redisClient = null;

const initializeRedis = async () => {
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
        logger.error('Redis error:', err);
      });

      redisClient.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      logger.info('Redis client initialized');
    } catch (error) {
      logger.warn('Failed to initialize Redis client:', error);
      redisClient = null;
    }
  }
};

// Initialize Redis
initializeRedis();

// Memory cache fallback
const memoryCache = new Map();
const memoryTTL = new Map();

// Generate cache key
const generateCacheKey = (req, customKey) => {
  if (customKey) {
    return typeof customKey === 'function' ? customKey(req) : customKey;
  }
  
  const baseKey = `${req.method}:${req.originalUrl || req.url}`;
  const userId = req.user?._id ? `:user:${req.user._id}` : '';
  const query = Object.keys(req.query).length > 0 ? `:query:${JSON.stringify(req.query)}` : '';
  
  return `${baseKey}${userId}${query}`;
};

// Set cache value
const setCacheValue = async (key, value, ttl = 300) => {
  try {
    const serializedValue = JSON.stringify(value);
    
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.setex(key, ttl, serializedValue);
    } else {
      memoryCache.set(key, serializedValue);
      memoryTTL.set(key, Date.now() + (ttl * 1000));
    }
    
    logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
  } catch (error) {
    logger.error('Failed to set cache value:', error);
  }
};

// Get cache value
const getCacheValue = async (key) => {
  try {
    let value = null;
    
    if (redisClient && redisClient.status === 'ready') {
      value = await redisClient.get(key);
    } else {
      const cachedValue = memoryCache.get(key);
      const expirationTime = memoryTTL.get(key);
      
      if (cachedValue && expirationTime && Date.now() < expirationTime) {
        value = cachedValue;
      } else if (cachedValue) {
        memoryCache.delete(key);
        memoryTTL.delete(key);
      }
    }
    
    if (value) {
      logger.debug(`Cache hit: ${key}`);
      return JSON.parse(value);
    }
    
    logger.debug(`Cache miss: ${key}`);
    return null;
  } catch (error) {
    logger.error('Failed to get cache value:', error);
    return null;
  }
};

// Cache middleware
export const cache = (options = {}) => {
  const {
    ttl = 300,
    keyGenerator = null,
    condition = null,
    exclude = [],
    skipCache = false
  } = options;

  return async (req, res, next) => {
    if (skipCache || 
        req.method !== 'GET' || 
        exclude.some(path => req.path.includes(path))) {
      return next();
    }

    if (condition && !condition(req)) {
      return next();
    }

    const cacheKey = generateCacheKey(req, keyGenerator);
    
    try {
      const cachedResponse = await getCacheValue(cacheKey);
      
      if (cachedResponse) {
        logger.debug(`Serving cached response for: ${req.originalUrl}`);
        return res.json(cachedResponse);
      }

      const originalSend = res.json;
      res.json = function(data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          setCacheValue(cacheKey, data, ttl);
        }
        
        return originalSend.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
};

// Cache reports with longer TTL
export const cacheReports = (ttl = 1800) => { // 30 minutes default
  return cache({
    ttl,
    keyGenerator: (req) => {
      const params = { ...req.query, ...req.params };
      const paramStr = JSON.stringify(params);
      return `report:${req.path}:${Buffer.from(paramStr).toString('base64')}`;
    }
  });
};

export default {
  cache,
  cacheReports,
  setCacheValue,
  getCacheValue
};