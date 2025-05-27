import Joi from 'joi';

const profileSchema = Joi.object({
  firstName: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(50)
    .messages({
      'any.required': 'First name is required',
      'string.min': 'First name cannot be empty',
      'string.max': 'First name cannot exceed 50 characters'
    }),
  
  lastName: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(50)
    .messages({
      'any.required': 'Last name is required',
      'string.min': 'Last name cannot be empty',
      'string.max': 'Last name cannot exceed 50 characters'
    }),
  
  department: Joi.string()
    .trim()
    .max(100)
    .optional()
    .allow(''),
  
  position: Joi.string()
    .trim()
    .max(100)
    .optional()
    .allow(''),
  
  phone: Joi.string()
    .trim()
    .pattern(/^[\+]?[1-9][\d]{0,15}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Invalid phone number format'
    })
});

export const createUserSchema = Joi.object({
  username: Joi.string()
    .required()
    .trim()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9_]+$/)
    .messages({
      'any.required': 'Username is required',
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username cannot exceed 50 characters',
      'string.pattern.base': 'Username can only contain letters, numbers, and underscores'
    }),
  
  email: Joi.string()
    .required()
    .trim()
    .email()
    .lowercase()
    .messages({
      'any.required': 'Email is required',
      'string.email': 'Invalid email format'
    }),
  
  password: Joi.string()
    .required()
    .min(6)
    .max(128)
    .messages({
      'any.required': 'Password is required',
      'string.min': 'Password must be at least 6 characters',
      'string.max': 'Password cannot exceed 128 characters'
    }),
  
  role: Joi.string()
    .valid('admin', 'manager', 'user')
    .default('user'),
  
  profile: profileSchema.required()
});

export const updateUserSchema = Joi.object({
  username: Joi.string()
    .trim()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9_]+$/)
    .optional()
    .messages({
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username cannot exceed 50 characters',
      'string.pattern.base': 'Username can only contain letters, numbers, and underscores'
    }),
  
  email: Joi.string()
    .trim()
    .email()
    .lowercase()
    .optional()
    .messages({
      'string.email': 'Invalid email format'
    }),
  
  role: Joi.string()
    .valid('admin', 'manager', 'user')
    .optional(),
  
  profile: Joi.object({
    firstName: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .optional(),
    
    lastName: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .optional(),
    
    department: Joi.string()
      .trim()
      .max(100)
      .optional()
      .allow(''),
    
    position: Joi.string()
      .trim()
      .max(100)
      .optional()
      .allow(''),
    
    phone: Joi.string()
      .trim()
      .pattern(/^[\+]?[1-9][\d]{0,15}$/)
      .optional()
      .allow('')
      .messages({
        'string.pattern.base': 'Invalid phone number format'
      })
  }).optional()
});

export const updateProfileSchema = Joi.object({
  firstName: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .optional(),
  
  lastName: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .optional(),
  
  department: Joi.string()
    .trim()
    .max(100)
    .optional()
    .allow(''),
  
  position: Joi.string()
    .trim()
    .max(100)
    .optional()
    .allow(''),
  
  phone: Joi.string()
    .trim()
    .pattern(/^[\+]?[1-9][\d]{0,15}$/)
    .optional()
    .allow('')
    .messages({
      'string.pattern.base': 'Invalid phone number format'
    })
});

export const changeUserStatusSchema = Joi.object({
  isActive: Joi.boolean()
    .required()
    .messages({
      'any.required': 'Active status is required'
    }),
  
  reason: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow('')
});

export const getUsersQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  
  search: Joi.string()
    .trim()
    .max(100)
    .optional(),
  
  role: Joi.string()
    .valid('admin', 'manager', 'user')
    .optional(),
  
  department: Joi.string()
    .trim()
    .max(100)
    .optional(),
  
  isActive: Joi.boolean()
    .optional(),
  
  sortBy: Joi.string()
    .valid('username', 'email', 'createdAt', 'lastLogin', 'profile.firstName', 'profile.lastName')
    .default('createdAt'),
  
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
});