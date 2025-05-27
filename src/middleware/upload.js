import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AppError, generateUniqueFilename } from '../utils/helpers.js';
import { FILE_TYPES } from '../utils/constants.js';
import logger from '../utils/logger.js';

// Ensure upload directories exist
const createUploadDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Create upload directories
const uploadDirs = {
  processes: 'uploads/processes/',
  steps: 'uploads/steps/',
  users: 'uploads/users/',
  temp: 'uploads/temp/'
};

Object.values(uploadDirs).forEach(createUploadDir);

// Storage configuration for different upload types
const createStorage = (uploadPath) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueFilename = generateUniqueFilename(file.originalname);
      cb(null, uniqueFilename);
    }
  });
};

// File filter function
const fileFilter = (allowedTypes = FILE_TYPES.ALLOWED_MIME_TYPES) => {
  return (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(`File type ${file.mimetype} is not allowed`, 400), false);
    }
  };
};

// Create multer instances for different upload types
export const processUpload = multer({
  storage: createStorage(uploadDirs.processes),
  limits: {
    fileSize: FILE_TYPES.MAX_FILE_SIZE,
    files: 10 // Maximum 10 files per upload
  },
  fileFilter: fileFilter()
});

export const stepUpload = multer({
  storage: createStorage(uploadDirs.steps),
  limits: {
    fileSize: FILE_TYPES.MAX_FILE_SIZE,
    files: 5
  },
  fileFilter: fileFilter()
});

export const userUpload = multer({
  storage: createStorage(uploadDirs.users),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB for user uploads (smaller limit)
    files: 1
  },
  fileFilter: fileFilter(['image/jpeg', 'image/png', 'image/gif']) // Only images for users
});

export const documentUpload = multer({
  storage: createStorage(uploadDirs.temp),
  limits: {
    fileSize: FILE_TYPES.MAX_FILE_SIZE,
    files: 20
  },
  fileFilter: fileFilter([
    ...FILE_TYPES.ALLOWED_MIME_TYPES,
    'application/zip',
    'application/x-zip-compressed'
  ])
});

// Middleware for handling single file uploads
export const uploadSingle = (uploadType = 'document', fieldName = 'file') => {
  const uploaders = {
    process: processUpload,
    step: stepUpload,
    user: userUpload,
    document: documentUpload
  };

  const uploader = uploaders[uploadType] || documentUpload;

  return (req, res, next) => {
    uploader.single(fieldName)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('File too large', 400));
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(new AppError('Unexpected file field', 400));
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return next(new AppError('Too many files', 400));
          }
        }
        return next(err);
      }

      // Log file upload
      if (req.file) {
        logger.info(`File uploaded: ${req.file.originalname} by user ${req.user?._id}`);
      }

      next();
    });
  };
};

// Middleware for handling multiple file uploads
export const uploadMultiple = (uploadType = 'document', fieldName = 'files', maxCount = 10) => {
  const uploaders = {
    process: processUpload,
    step: stepUpload,
    user: userUpload,
    document: documentUpload
  };

  const uploader = uploaders[uploadType] || documentUpload;

  return (req, res, next) => {
    uploader.array(fieldName, maxCount)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('One or more files are too large', 400));
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return next(new AppError(`Too many files. Maximum ${maxCount} files allowed`, 400));
          }
        }
        return next(err);
      }

      // Log file uploads
      if (req.files && req.files.length > 0) {
        logger.info(`${req.files.length} files uploaded by user ${req.user?._id}`);
      }

      next();
    });
  };
};

// Middleware for handling mixed file uploads (different field names)
export const uploadFields = (uploadType = 'document', fields = []) => {
  const uploaders = {
    process: processUpload,
    step: stepUpload,
    user: userUpload,
    document: documentUpload
  };

  const uploader = uploaders[uploadType] || documentUpload;

  return (req, res, next) => {
    uploader.fields(fields)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('One or more files are too large', 400));
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return next(new AppError('Too many files', 400));
          }
        }
        return next(err);
      }

      // Log file uploads
      let totalFiles = 0;
      if (req.files) {
        Object.values(req.files).forEach(files => {
          totalFiles += files.length;
        });
      }

      if (totalFiles > 0) {
        logger.info(`${totalFiles} files uploaded by user ${req.user?._id}`);
      }

      next();
    });
  };
};

// Clean up uploaded files (for error cases)
export const cleanupUploadedFiles = (req, res, next) => {
  res.on('finish', () => {
    // Only cleanup on error responses
    if (res.statusCode >= 400) {
      const filesToCleanup = [];

      if (req.file) {
        filesToCleanup.push(req.file.path);
      }

      if (req.files) {
        if (Array.isArray(req.files)) {
          req.files.forEach(file => filesToCleanup.push(file.path));
        } else {
          Object.values(req.files).forEach(files => {
            files.forEach(file => filesToCleanup.push(file.path));
          });
        }
      }

      // Clean up files
      filesToCleanup.forEach(filePath => {
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') {
            logger.error(`Failed to cleanup uploaded file: ${filePath}`, err);
          }
        });
      });
    }
  });

  next();
};

// Validate uploaded file
export const validateUpload = (options = {}) => {
  const {
    required = false,
    maxSize = FILE_TYPES.MAX_FILE_SIZE,
    allowedTypes = FILE_TYPES.ALLOWED_MIME_TYPES,
    minCount = 0,
    maxCount = 1
  } = options;

  return (req, res, next) => {
    const files = req.files || (req.file ? [req.file] : []);

    // Check if files are required
    if (required && files.length === 0) {
      return next(new AppError('File upload is required', 400));
    }

    // Check file count
    if (files.length < minCount) {
      return next(new AppError(`Minimum ${minCount} file(s) required`, 400));
    }

    if (files.length > maxCount) {
      return next(new AppError(`Maximum ${maxCount} file(s) allowed`, 400));
    }

    // Validate each file
    for (const file of files) {
      // Check file size
      if (file.size > maxSize) {
        return next(new AppError(`File ${file.originalname} exceeds maximum size`, 400));
      }

      // Check file type
      if (!allowedTypes.includes(file.mimetype)) {
        return next(new AppError(`File type ${file.mimetype} is not allowed`, 400));
      }

      // Check file extension
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.zip'];
      
      if (!allowedExtensions.includes(ext)) {
        return next(new AppError(`File extension ${ext} is not allowed`, 400));
      }
    }

    next();
  };
};

// Get file info middleware
export const getFileInfo = (req, res, next) => {
  if (req.file) {
    req.fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date()
    };
  }

  if (req.files) {
    req.filesInfo = [];
    const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
    
    files.forEach(file => {
      req.filesInfo.push({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date()
      });
    });
  }

  next();
};

export default {
  uploadSingle,
  uploadMultiple,
  uploadFields,
  cleanupUploadedFiles,
  validateUpload,
  getFileInfo,
  processUpload,
  stepUpload,
  userUpload,
  documentUpload
};