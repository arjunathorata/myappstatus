import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';
import config from '../config/environment.js';

// Handle different types of errors
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400, 'CAST_ERROR');
};

const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyPattern || {})[0] || 'field';
  const value = err.keyValue ? err.keyValue[field] : 'unknown';
  const message = `${field} '${value}' already exists`;
  return new AppError(message, 409, 'DUPLICATE_ERROR');
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors || {}).map(val => val.message);
  const message = `Invalid input data: ${errors.join('. ')}`;
  return new AppError(message, 400, 'VALIDATION_ERROR');
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401, 'JWT_ERROR');

const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401, 'JWT_EXPIRED');

const handleMulterError = (err) => {
  let message = 'File upload error';
  
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      message = 'File too large';
      break;
    case 'LIMIT_FILE_COUNT':
      message = 'Too many files';
      break;
    case 'LIMIT_UNEXPECTED_FILE':
      message = 'Unexpected file field';
      break;
    default:
      message = err.message || 'File upload error';
  }
  
  return new AppError(message, 400, 'FILE_UPLOAD_ERROR');
};

// Send error response in development
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    errorCode: err.errorCode,
    details: err.details,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
};

// Send error response in production
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      errorCode: err.errorCode,
      details: err.details,
      timestamp: new Date().toISOString()
    });
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('Unexpected error:', err);
    
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
      timestamp: new Date().toISOString()
    });
  }
};

// Main error handling middleware
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error with context
  const errorContext = {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?._id,
    body: req.body,
    params: req.params,
    query: req.query,
    timestamp: new Date().toISOString()
  };

  if (err.statusCode >= 500) {
    logger.error('Server Error:', {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        statusCode: err.statusCode
      },
      context: errorContext
    });
  } else {
    logger.warn('Client Error:', {
      error: {
        name: err.name,
        message: err.message,
        statusCode: err.statusCode
      },
      context: errorContext
    });
  }

  let error = { ...err };
  error.message = err.message;

  // Handle specific error types
  if (error.name === 'CastError') error = handleCastErrorDB(error);
  if (error.code === 11000) error = handleDuplicateFieldsDB(error);
  if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
  if (error.name === 'JsonWebTokenError') error = handleJWTError();
  if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
  if (error.name === 'MulterError') error = handleMulterError(error);

  // Send error response
  if (config.app.environment === 'development') {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

export default errorHandler;