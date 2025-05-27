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

export const registerSchema = Joi.object({
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
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'any.required': 'Password is required',
      'string.min': 'Password must be at least 6 characters',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    }),
  
  confirmPassword: Joi.string()
    .required()
    .valid(Joi.ref('password'))
    .messages({
      'any.required': 'Confirm password is required',
      'any.only': 'Passwords do not match'
    }),
  
  profile: profileSchema.required(),
  
  role: Joi.string()
    .valid('admin', 'manager', 'user')
    .default('user')
});

export const loginSchema = Joi.object({
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
    .min(1)
    .messages({
      'any.required': 'Password is required',
      'string.min': 'Password cannot be empty'
    }),
  
  rememberMe: Joi.boolean()
    .default(false)
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Refresh token is required',
      'string.empty': 'Refresh token cannot be empty'
    })
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .min(1)
    .messages({
      'any.required': 'Current password is required',
      'string.min': 'Current password cannot be empty'
    }),
  
  newPassword: Joi.string()
    .required()
    .min(6)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'any.required': 'New password is required',
      'string.min': 'New password must be at least 6 characters',
      'string.max': 'New password cannot exceed 128 characters',
      'string.pattern.base': 'New password must contain at least one lowercase letter, one uppercase letter, and one number'
    }),
  
  confirmPassword: Joi.string()
    .required()
    .valid(Joi.ref('newPassword'))
    .messages({
      'any.required': 'Confirm password is required',
      'any.only': 'Passwords do not match'
    })
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .required()
    .trim()
    .email()
    .lowercase()
    .messages({
      'any.required': 'Email is required',
      'string.email': 'Invalid email format'
    })
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Reset token is required',
      'string.empty': 'Reset token cannot be empty'
    }),
  
  password: Joi.string()
    .required()
    .min(6)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'any.required': 'Password is required',
      'string.min': 'Password must be at least 6 characters',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    }),
  
  confirmPassword: Joi.string()
    .required()
    .valid(Joi.ref('password'))
    .messages({
      'any.required': 'Confirm password is required',
      'any.only': 'Passwords do not match'
    })
});