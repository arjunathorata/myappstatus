import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import duration from 'dayjs/plugin/duration.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { TIME_DURATIONS, DATE_FORMATS, REGEX } from './constants.js';

// Configure dayjs plugins
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(utc);
dayjs.extend(timezone);

// Enhanced Error Class
export class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = null, details = null) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errorCode = errorCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      status: this.status,
      message: this.message,
      errorCode: this.errorCode,
      details: this.details,
      timestamp: this.timestamp,
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
    };
  }

  static fromValidation(details) {
    return new AppError(
      'Validation failed',
      400,
      'VALIDATION_ERROR',
      details
    );
  }

  static fromDatabase(dbError) {
    let message = 'Database operation failed';
    let statusCode = 500;
    
    if (dbError.code === 11000) {
      const field = Object.keys(dbError.keyPattern || {})[0] || 'field';
      const value = dbError.keyValue ? dbError.keyValue[field] : 'unknown';
      message = `${field} '${value}' already exists`;
      statusCode = 409;
    } else if (dbError.name === 'ValidationError') {
      message = 'Database validation failed';
      statusCode = 400;
    } else if (dbError.name === 'CastError') {
      message = 'Invalid ID format';
      statusCode = 400;
    }

    return new AppError(message, statusCode, 'DATABASE_ERROR', {
      originalError: dbError.message
    });
  }
}

// Async wrapper with better error context
export const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      error.requestContext = {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?._id,
        timestamp: new Date().toISOString()
      };
      next(error);
    });
  };
};

// Secure random string generation
export const generateRandomString = (length = 32, characters = null) => {
  const defaultChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charset = characters || defaultChars;
  
  return Array.from(crypto.randomBytes(length))
    .map(byte => charset[byte % charset.length])
    .join('');
};

// Enhanced UUID generation
export const generateUUID = () => {
  try {
    return crypto.randomUUID();
  } catch (error) {
    // Fallback for older Node.js versions
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

export const generateUniqueFilename = (originalFilename) => {
  const timestamp = Date.now();
  const randomString = generateRandomString(8);
  const extension = path.extname(originalFilename);
  const baseName = path.basename(originalFilename, extension);
  
  return `${baseName}_${timestamp}_${randomString}${extension}`;
};

export const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

export const hashString = (str) => {
  return crypto.createHash('sha256').update(str).digest('hex');
};

// Validation helpers
export const isValidEmail = (email) => {
  return typeof email === 'string' && REGEX.EMAIL.test(email.toLowerCase());
};

export const isValidObjectId = (id) => {
  return typeof id === 'string' && REGEX.MONGODB_OBJECT_ID.test(id);
};

export const isValidUUID = (uuid) => {
  return typeof uuid === 'string' && REGEX.UUID.test(uuid);
};

// Enhanced sanitization
export const sanitizeFilename = (filename) => {
  if (typeof filename !== 'string') return '';
  return filename
    .replace(/[^a-z0-9\-_.]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase()
    .substring(0, 255);
};

// Format bytes to human readable
export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Format duration using dayjs
export const formatDuration = (startDate, endDate = new Date()) => {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const diff = end.diff(start);
  const duration = dayjs.duration(diff);
  
  const days = Math.floor(duration.asDays());
  const hours = duration.hours();
  const minutes = duration.minutes();
  const seconds = duration.seconds();
  
  const parts = [];
  
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  if (seconds > 0 && days === 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
  
  return parts.length > 0 ? parts.join(', ') : '0 seconds';
};

// Format date using dayjs
export const formatDate = (date, format = DATE_FORMATS.DISPLAY_DATE) => {
  return dayjs(date).format(format);
};

// Get relative time using dayjs
export const getRelativeTime = (date) => {
  return dayjs(date).fromNow();
};

// Check if date is overdue using dayjs
export const isOverdue = (dueDate) => {
  return dayjs(dueDate).isBefore(dayjs());
};

// Calculate percentage
export const calculatePercentage = (value, total) => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
};

// Paginate array
export const paginateArray = (array, page = 1, limit = 20) => {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  return {
    data: array.slice(startIndex, endIndex),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: array.length,
      pages: Math.ceil(array.length / limit)
    }
  };
};

// Deep clone object
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const copy = {};
    Object.keys(obj).forEach(key => {
      copy[key] = deepClone(obj[key]);
    });
    return copy;
  }
};

// Remove undefined values from object
export const removeUndefined = (obj) => {
  const cleaned = {};
  
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        cleaned[key] = removeUndefined(obj[key]);
      } else {
        cleaned[key] = obj[key];
      }
    }
  });
  
  return cleaned;
};

// Pick specific fields from object
export const pick = (obj, fields) => {
  const result = {};
  fields.forEach(field => {
    if (obj[field] !== undefined) {
      result[field] = obj[field];
    }
  });
  return result;
};

// Omit specific fields from object
export const omit = (obj, fields) => {
  const result = { ...obj };
  fields.forEach(field => {
    delete result[field];
  });
  return result;
};

// Enhanced password strength validation
export const validatePasswordStrength = (password) => {
  if (typeof password !== 'string') {
    return { score: 0, strength: 'invalid', feedback: ['Password must be a string'] };
  }

  const result = {
    score: 0,
    feedback: [],
    checks: {
      length: false,
      lowercase: false,
      uppercase: false,
      numbers: false,
      symbols: false,
      commonWords: false
    }
  };

  // Length check
  if (password.length >= 8) {
    result.score += 1;
    result.checks.length = true;
  } else {
    result.feedback.push('Password should be at least 8 characters long');
  }

  // Character type checks
  if (/[a-z]/.test(password)) {
    result.score += 1;
    result.checks.lowercase = true;
  } else {
    result.feedback.push('Password should contain lowercase letters');
  }

  if (/[A-Z]/.test(password)) {
    result.score += 1;
    result.checks.uppercase = true;
  } else {
    result.feedback.push('Password should contain uppercase letters');
  }

  if (/\d/.test(password)) {
    result.score += 1;
    result.checks.numbers = true;
  } else {
    result.feedback.push('Password should contain numbers');
  }

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    result.score += 1;
    result.checks.symbols = true;
  } else {
    result.feedback.push('Password should contain special characters');
  }

  // Check for common passwords
  const commonPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein'];
  if (!commonPasswords.includes(password.toLowerCase())) {
    result.score += 1;
    result.checks.commonWords = true;
  } else {
    result.feedback.push('Password is too common');
  }

  // Length bonus
  if (password.length >= 12) {
    result.score += 1;
  }

  // Determine strength
  if (result.score < 3) {
    result.strength = 'weak';
  } else if (result.score < 5) {
    result.strength = 'medium';
  } else {
    result.strength = 'strong';
  }

  return result;
};

// File utilities
export const fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
};

export const ensureDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

export const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
  return false;
};

export const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase();
};

// Wait and retry utilities
export const wait = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const retry = async (fn, options = {}) => {
  const {
    retries = 3,
    delay = 1000,
    backoff = 2,
    shouldRetry = () => true
  } = options;
  
  let lastError;
  
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i === retries || !shouldRetry(error)) {
        throw error;
      }
      
      const waitTime = delay * Math.pow(backoff, i);
      await wait(waitTime);
    }
  }
  
  throw lastError;
};

export default {
  AppError,
  catchAsync,
  generateRandomString,
  generateUUID,
  generateUniqueFilename,
  generateSecureToken,
  hashString,
  isValidEmail,
  isValidObjectId,
  isValidUUID,
  sanitizeFilename,
  formatBytes,
  formatDuration,
  formatDate,
  getRelativeTime,
  isOverdue,
  calculatePercentage,
  paginateArray,
  deepClone,
  removeUndefined,
  pick,
  omit,
  validatePasswordStrength,
  fileExists,
  ensureDirectory,
  deleteFile,
  getFileExtension,
  wait,
  retry
};