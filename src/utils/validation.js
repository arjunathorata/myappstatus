import { z } from 'zod';
import { isValidObjectId } from './helpers.js';

// Custom Zod validators
const objectId = z.string().refine(isValidObjectId, {
  message: 'Invalid ObjectId format'
});

const email = z.string().email().toLowerCase();

const password = z.string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number');

const username = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username must be less than 50 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');

// User validation schemas
export const userSchemas = {
  register: z.object({
    username,
    email,
    password,
    profile: z.object({
      firstName: z.string().min(1, 'First name is required').max(50),
      lastName: z.string().min(1, 'Last name is required').max(50),
      department: z.string().max(100).optional(),
      position: z.string().max(100).optional(),
      phone: z.string().regex(/^[\+]?[1-9][\d]{0,15}$/).optional()
    })
  }),

  login: z.object({
    email: z.string().email().or(username),
    password: z.string().min(1, 'Password is required')
  }),

  updateProfile: z.object({
    profile: z.object({
      firstName: z.string().min(1).max(50).optional(),
      lastName: z.string().min(1).max(50).optional(),
      department: z.string().max(100).optional(),
      position: z.string().max(100).optional(),
      phone: z.string().regex(/^[\+]?[1-9][\d]{0,15}$/).optional()
    }).optional(),
    notificationPreferences: z.object({
      emailNotifications: z.boolean().optional(),
      taskAssigned: z.boolean().optional(),
      taskOverdue: z.boolean().optional(),
      processCompleted: z.boolean().optional(),
      comments: z.boolean().optional(),
      escalations: z.boolean().optional(),
      systemNotifications: z.boolean().optional()
    }).optional()
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: password,
    confirmPassword: z.string()
  }).refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"]
  }),

  resetPassword: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: password,
    confirmPassword: z.string()
  }).refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"]
  })
};

// Process Template validation schemas
export const processTemplateSchemas = {
  create: z.object({
    name: z.string().min(1, 'Process name is required').max(200),
    description: z.string().max(1000).optional(),
    category: z.string().min(1, 'Category is required').max(100),
    tags: z.array(z.string().max(50)).max(10).optional(),
    steps: z.array(z.object({
      stepId: z.string().min(1, 'Step ID is required'),
      name: z.string().min(1, 'Step name is required').max(200),
      description: z.string().max(500).optional(),
      type: z.enum(['user_task', 'service_task', 'decision', 'gateway', 'start', 'end']),
      assigneeType: z.enum(['user', 'role', 'department', 'system']).optional(),
      assigneeValue: z.string().optional(),
      formFields: z.array(z.object({
        fieldId: z.string(),
        label: z.string(),
        type: z.enum(['text', 'textarea', 'number', 'date', 'boolean', 'select', 'file']),
        required: z.boolean().default(false),
        options: z.array(z.string()).optional()
      })).optional(),
      nextSteps: z.array(z.string()).optional(),
      conditions: z.array(z.object({
        field: z.string(),
        operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains']),
        value: z.any(),
        nextStep: z.string()
      })).optional(),
      dueInHours: z.number().min(0).optional(),
      escalationRules: z.array(z.object({
        condition: z.string(),
        action: z.enum(['notify', 'reassign', 'escalate']),
        target: z.string()
      })).optional()
    })).min(1, 'At least one step is required'),
    isPublished: z.boolean().default(false)
  }),

  update: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    category: z.string().min(1).max(100).optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
    isPublished: z.boolean().optional()
  })
};

// Process Instance validation schemas
export const processInstanceSchemas = {
  start: z.object({
    processTemplateId: objectId,
    name: z.string().min(1, 'Process name is required').max(200).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    dueDate: z.string().datetime().optional(),
    variables: z.record(z.any()).optional(),
    comments: z.string().max(1000).optional()
  }),

  update: z.object({
    name: z.string().min(1).max(200).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    dueDate: z.string().datetime().optional(),
    variables: z.record(z.any()).optional(),
    comments: z.string().max(1000).optional()
  })
};

// Step Instance validation schemas
export const stepInstanceSchemas = {
  complete: z.object({
    formData: z.record(z.any()).optional(),
    comments: z.string().max(1000).optional(),
    nextStep: z.string().optional()
  }),

  assign: z.object({
    assignedTo: objectId.optional(),
    assignedRole: z.string().optional(),
    assignedDepartment: z.string().optional(),
    comments: z.string().max(500).optional()
  }).refine(data => 
    data.assignedTo || data.assignedRole || data.assignedDepartment, {
    message: 'At least one assignment target is required'
  }),

  addComment: z.object({
    comment: z.string().min(1, 'Comment cannot be empty').max(1000)
  })
};

// Query validation schemas
export const querySchemas = {
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc')
  }),

  search: z.object({
    q: z.string().min(1).max(200).optional(),
    category: z.string().max(100).optional(),
    status: z.string().max(50).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    assignedTo: objectId.optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional()
  }),

  userFilter: z.object({
    role: z.enum(['admin', 'manager', 'user']).optional(),
    department: z.string().max(100).optional(),
    isActive: z.coerce.boolean().optional()
  })
};

// Validation middleware factory
export const validate = (schema) => {
  return (req, res, next) => {
    try {
      const result = schema.parse(req.body);
      req.body = result; // Replace with validated/transformed data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: validationErrors
        });
      }
      next(error);
    }
  };
};

// Query validation middleware
export const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      const result = schema.parse(req.query);
      req.query = result;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          status: 'error',
          message: 'Query validation failed',
          errors: validationErrors
        });
      }
      next(error);
    }
  };
};

// Params validation middleware
export const validateParams = (schema) => {
  return (req, res, next) => {
    try {
      const result = schema.parse(req.params);
      req.params = result;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          status: 'error',
          message: 'Parameter validation failed',
          errors: validationErrors
        });
      }
      next(error);
    }
  };
};

// Common parameter schemas
export const paramSchemas = {
  id: z.object({
    id: objectId
  }),
  
  processId: z.object({
    processId: objectId
  }),
  
  stepId: z.object({
    stepId: objectId
  }),
  
  userId: z.object({
    userId: objectId
  })
};

export default {
  userSchemas,
  processTemplateSchemas,
  processInstanceSchemas,
  stepInstanceSchemas,
  querySchemas,
  paramSchemas,
  validate,
  validateQuery,
  validateParams
};