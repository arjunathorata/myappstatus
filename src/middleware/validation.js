import Joi from 'joi';
import mongoose from 'mongoose';
import { AppError } from '../utils/helpers.js';
import logger from '../utils/logger.js';

// Fix: More comprehensive validation middleware
export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const dataToValidate = req[source];
      
      if (!dataToValidate) {
        return next(new AppError(`No ${source} data provided`, 400));
      }

      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        const errorDetails = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type
        }));

        logger.warn('Validation failed', {
          source,
          errors: errorDetails,
          data: dataToValidate,
          ip: req.ip,
          endpoint: req.originalUrl
        });

        return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
          details: errorDetails
        }));
      }

      // Replace original data with validated/sanitized data
      req[source] = value;
      next();
    } catch (validationError) {
      logger.errorWithContext(validationError, {
        middleware: 'validate',
        source,
        endpoint: req.originalUrl
      });
      next(new AppError('Validation processing failed', 500));
    }
  };
};

// Fix: Enhanced ObjectId validation
export const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!id) {
      return next(new AppError(`Parameter '${paramName}' is required`, 400));
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError(`Invalid ${paramName} format`, 400));
    }

    next();
  };
};

// Fix: Query parameter validation
export const validateQuery = (schema) => {
  return validate(schema, 'query');
};

// Fix: Array of ObjectIds validation
export const validateObjectIdArray = (fieldName) => {
  return (req, res, next) => {
    const ids = req.body[fieldName];
    
    if (!Array.isArray(ids)) {
      return next(new AppError(`${fieldName} must be an array`, 400));
    }

    const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
    
    if (invalidIds.length > 0) {
      return next(new AppError(`Invalid IDs in ${fieldName}: ${invalidIds.join(', ')}`, 400));
    }

    next();
  };
};

// Fix: File validation middleware
export const validateFileUpload = (options = {}) => {
  const {
    required = false,
    maxSize = 5 * 1024 * 1024, // 5MB
    allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'],
    maxFiles = 1
  } = options;

  return (req, res, next) => {
    const files = req.files || (req.file ? [req.file] : []);

    if (required && files.length === 0) {
      return next(new AppError('File upload is required', 400));
    }

    if (files.length > maxFiles) {
      return next(new AppError(`Maximum ${maxFiles} files allowed`, 400));
    }

    for (const file of files) {
      if (file.size > maxSize) {
        return next(new AppError(`File ${file.originalname} exceeds maximum size`, 400));
      }

      if (!allowedMimeTypes.includes(file.mimetype)) {
        return next(new AppError(`File type ${file.mimetype} not allowed`, 400));
      }
    }

    next();
  };
};

