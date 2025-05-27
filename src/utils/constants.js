// User roles
export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user'
};

// Process statuses
export const PROCESS_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error'
};

// Step statuses
export const STEP_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
  ERROR: 'error'
};

// Process priorities
export const PROCESS_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// Step types
export const STEP_TYPES = {
  USER_TASK: 'user_task',
  SERVICE_TASK: 'service_task',
  DECISION: 'decision',
  GATEWAY: 'gateway',
  START: 'start',
  END: 'end'
};

// Assignee types
export const ASSIGNEE_TYPES = {
  USER: 'user',
  ROLE: 'role',
  DEPARTMENT: 'department',
  SYSTEM: 'system'
};

// Notification types
export const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: 'task_assigned',
  TASK_COMPLETED: 'task_completed',
  TASK_OVERDUE: 'task_overdue',
  TASK_ESCALATED: 'task_escalated',
  PROCESS_STARTED: 'process_started',
  PROCESS_COMPLETED: 'process_completed',
  PROCESS_CANCELLED: 'process_cancelled',
  COMMENT_ADDED: 'comment_added',
  SYSTEM_NOTIFICATION: 'system_notification'
};

// Notification priorities
export const NOTIFICATION_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// Token types
export const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  RESET_PASSWORD: 'reset_password',
  VERIFY_EMAIL: 'verify_email'
};

// Log levels
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  HTTP: 'http',
  VERBOSE: 'verbose',
  DEBUG: 'debug',
  SILLY: 'silly'
};

// Environments
export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
  STAGING: 'staging'
};

// Time durations (in milliseconds)
export const TIME_DURATIONS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000
};

// Date formats
export const DATE_FORMATS = {
  ISO_DATE: 'YYYY-MM-DD',
  ISO_DATETIME: 'YYYY-MM-DD HH:mm:ss',
  DISPLAY_DATE: 'MMM DD, YYYY',
  DISPLAY_DATETIME: 'MMM DD, YYYY HH:mm',
  API_DATE: 'YYYY-MM-DD',
  API_DATETIME: 'YYYY-MM-DDTHH:mm:ss.SSSZ'
};

// Regular expressions
export const REGEX = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[\+]?[1-9][\d]{0,15}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{6,}$/,
  USERNAME: /^[a-zA-Z0-9_]{3,30}$/,
  MONGODB_OBJECT_ID: /^[0-9a-fA-F]{24}$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
};

// Validation rules
export const VALIDATION_RULES = {
  USERNAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 30,
    PATTERN: REGEX.USERNAME
  },
  PASSWORD: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 128,
    PATTERN: REGEX.PASSWORD
  },
  EMAIL: {
    MAX_LENGTH: 255,
    PATTERN: REGEX.EMAIL
  },
  PHONE: {
    PATTERN: REGEX.PHONE
  },
  PROCESS_NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 200
  },
  STEP_NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 200
  },
  COMMENT: {
    MAX_LENGTH: 1000
  },
  DESCRIPTION: {
    MAX_LENGTH: 2000
  }
};

// File upload constraints
export const FILE_UPLOAD = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_FILES: 10,
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]
};

// API response codes
export const API_CODES = {
  SUCCESS: 'SUCCESS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  SERVER_ERROR: 'SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR'
};

// Cache keys
export const CACHE_KEYS = {
  USER_PROFILE: 'user:profile:',
  PROCESS_TEMPLATE: 'process:template:',
  PROCESS_INSTANCE: 'process:instance:',
  STEP_INSTANCE: 'step:instance:',
  DASHBOARD_STATS: 'dashboard:stats:',
  REPORTS: 'reports:'
};

// Events
export const EVENTS = {
  PROCESS_STARTED: 'process.started',
  PROCESS_COMPLETED: 'process.completed',
  PROCESS_CANCELLED: 'process.cancelled',
  STEP_ASSIGNED: 'step.assigned',
  STEP_COMPLETED: 'step.completed',
  STEP_ESCALATED: 'step.escalated',
  USER_REGISTERED: 'user.registered',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout'
};

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1
};


// Default values
export const DEFAULTS = {
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  PROCESS_PRIORITY: PROCESS_PRIORITY.MEDIUM,
  NOTIFICATION_PRIORITY: NOTIFICATION_PRIORITY.MEDIUM,
  CACHE_TTL: 300, // 5 minutes
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  PASSWORD_RESET_TIMEOUT: 10 * 60 * 1000, // 10 minutes
  EMAIL_VERIFICATION_TIMEOUT: 24 * 60 * 60 * 1000 // 24 hours
};

// Error messages
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Insufficient permissions',
  NOT_FOUND: 'Resource not found',
  VALIDATION_FAILED: 'Validation failed',
  INVALID_CREDENTIALS: 'Invalid email or password',
  TOKEN_EXPIRED: 'Token has expired',
  TOKEN_INVALID: 'Invalid token',
  USER_EXISTS: 'User already exists',
  USER_NOT_FOUND: 'User not found',
  PROCESS_NOT_FOUND: 'Process not found',
  STEP_NOT_FOUND: 'Step not found',
  INVALID_INPUT: 'Invalid input data',
  SERVER_ERROR: 'Internal server error',
  DATABASE_ERROR: 'Database operation failed',
  FILE_TOO_LARGE: 'File size exceeds limit',
  INVALID_FILE_TYPE: 'Invalid file type',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded'
};

// Success messages
export const SUCCESS_MESSAGES = {
  USER_CREATED: 'User created successfully',
  USER_UPDATED: 'User updated successfully',
  USER_DELETED: 'User deleted successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  PASSWORD_CHANGED: 'Password changed successfully',
  PASSWORD_RESET_SENT: 'Password reset email sent',
  EMAIL_VERIFIED: 'Email verified successfully',
  PROCESS_CREATED: 'Process created successfully',
  PROCESS_UPDATED: 'Process updated successfully',
  PROCESS_STARTED: 'Process started successfully',
  PROCESS_COMPLETED: 'Process completed successfully',
  STEP_COMPLETED: 'Step completed successfully',
  NOTIFICATION_SENT: 'Notification sent successfully',
  FILE_UPLOADED: 'File uploaded successfully'
};

export default {
  USER_ROLES,
  PROCESS_STATUS,
  STEP_STATUS,
  PROCESS_PRIORITY,
  STEP_TYPES,
  ASSIGNEE_TYPES,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITY,
  TOKEN_TYPES,
  LOG_LEVELS,
  ENVIRONMENTS,
  TIME_DURATIONS,
  DATE_FORMATS,
  REGEX,
  VALIDATION_RULES,
  FILE_UPLOAD,
  API_CODES,
  CACHE_KEYS,
  EVENTS,
  DEFAULTS,
  ERROR_MESSAGES,
  PAGINATION,
  SUCCESS_MESSAGES
};