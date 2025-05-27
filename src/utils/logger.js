import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import { LOG_LEVELS, ENVIRONMENTS } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
import fs from 'fs';
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `${timestamp} ${level}: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Create transports based on environment
const createTransports = () => {
  const transports = [];
  const environment = process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT;
  
  // Console transport (always present in development)
  if (environment === ENVIRONMENTS.DEVELOPMENT || environment === ENVIRONMENTS.TEST) {
    transports.push(
      new winston.transports.Console({
        level: process.env.LOG_LEVEL || LOG_LEVELS.DEBUG,
        format: consoleFormat,
        handleExceptions: true,
        handleRejections: true
      })
    );
  }
  
  // File transports for production and development
  if (environment !== ENVIRONMENTS.TEST) {
    // Error log file
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: LOG_LEVELS.ERROR,
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        handleExceptions: true,
        handleRejections: true
      })
    );
    
    // Combined log file
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        level: process.env.LOG_LEVEL || LOG_LEVELS.INFO,
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10
      })
    );
    
    // Access log file (for HTTP requests)
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'access.log'),
        level: LOG_LEVELS.HTTP,
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10
      })
    );
    
    // Debug log file (development only)
    if (environment === ENVIRONMENTS.DEVELOPMENT) {
      transports.push(
        new winston.transports.File({
          filename: path.join(logsDir, 'debug.log'),
          level: LOG_LEVELS.DEBUG,
          format: logFormat,
          maxsize: 5 * 1024 * 1024, // 5MB
          maxFiles: 3
        })
      );
    }
  }
  
  return transports;
};

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || LOG_LEVELS.INFO,
  format: logFormat,
  defaultMeta: {
    service: 'myappstatus',
    environment: process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT,
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: createTransports(),
  exitOnError: false
});

// Add custom logging methods
logger.http = (message, meta = {}) => {
  logger.log(LOG_LEVELS.HTTP, message, meta);
};

logger.request = (req, meta = {}) => {
  logger.http('Incoming Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?._id,
    ...meta
  });
};

logger.response = (req, res, duration, meta = {}) => {
  logger.http('Outgoing Response', {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userId: req.user?._id,
    ...meta
  });
};

logger.security = (message, meta = {}) => {
  logger.warn(`[SECURITY] ${message}`, {
    type: 'security',
    timestamp: new Date().toISOString(),
    ...meta
  });
};

logger.audit = (action, userId, meta = {}) => {
  logger.info(`[AUDIT] ${action}`, {
    type: 'audit',
    userId,
    timestamp: new Date().toISOString(),
    ...meta
  });
};

logger.performance = (operation, duration, meta = {}) => {
  const level = duration > 5000 ? LOG_LEVELS.WARN : LOG_LEVELS.INFO;
  logger.log(level, `[PERFORMANCE] ${operation} completed in ${duration}ms`, {
    type: 'performance',
    operation,
    duration,
    ...meta
  });
};

logger.database = (query, duration, meta = {}) => {
  logger.debug(`[DATABASE] Query executed in ${duration}ms`, {
    type: 'database',
    query: typeof query === 'string' ? query : JSON.stringify(query),
    duration,
    ...meta
  });
};

logger.external = (service, operation, duration, meta = {}) => {
  logger.info(`[EXTERNAL] ${service} ${operation} completed in ${duration}ms`, {
    type: 'external',
    service,
    operation,
    duration,
    ...meta
  });
};

logger.business = (event, meta = {}) => {
  logger.info(`[BUSINESS] ${event}`, {
    type: 'business',
    event,
    timestamp: new Date().toISOString(),
    ...meta
  });
};

// Error logging with context
logger.errorWithContext = (error, context = {}) => {
  logger.error(error.message || 'Unknown error', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      errorCode: error.errorCode
    },
    context,
    timestamp: new Date().toISOString()
  });
};

// Log unhandled exceptions and rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    type: 'uncaughtException'
  });
  
  // Give time for the log to be written before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack
    } : reason,
    promise: promise.toString(),
    type: 'unhandledRejection'
  });
});

// Graceful shutdown logging
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
});

// Log startup information
logger.info('MyAppStatus logger initialized', {
  environment: process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT,
  logLevel: process.env.LOG_LEVEL || LOG_LEVELS.INFO,
  transports: logger.transports.map(t => t.constructor.name),
  logsDirectory: logsDir
});

export default logger;