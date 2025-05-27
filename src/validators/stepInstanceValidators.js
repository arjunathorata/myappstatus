const Joi = require('joi');

const getStepInstancesQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  
  status: Joi.string()
    .valid('pending', 'in_progress', 'completed', 'skipped', 'failed', 'cancelled')
    .optional(),
  
  assignedTo: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  
  assignedRole: Joi.string()
    .trim()
    .optional(),
  
  assignedDepartment: Joi.string()
    .trim()
    .optional(),
  
  processInstanceId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  
  overdue: Joi.boolean()
    .optional(),
  
  escalated: Joi.boolean()
    .optional(),
  
  type: Joi.string()
    .valid('user_task', 'service_task', 'decision', 'parallel', 'exclusive')
    .optional(),
  
  sortBy: Joi.string()
    .valid('dueDate', 'createdAt', 'startDate', 'priority')
    .default('dueDate'),
  
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('asc')
});

const completeStepSchema = Joi.object({
  formData: Joi.object()
    .optional()
    .default({}),
  
  comment: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .allow(''),
  
  decision: Joi.string()
    .trim()
    .optional()
    .when('$stepType', {
      is: 'decision',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
  
  variables: Joi.object()
    .optional()
    .default({})
});

const assignStepSchema = Joi.object({
  assignedTo: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .when('assignedRole', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() })
    .when('assignedDepartment', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() }),
  
  assignedRole: Joi.string()
    .trim()
    .max(50)
    .optional(),
  
  assignedDepartment: Joi.string()
    .trim()
    .max(100)
    .optional(),
  
  comment: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow(''),
  
  dueDate: Joi.date()
    .min('now')
    .optional()
    .messages({
      'date.min': 'Due date cannot be in the past'
    })
});

const reassignStepSchema = Joi.object({
  assignedTo: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'any.required': 'New assignee is required',
      'string.pattern.base': 'Invalid user ID format'
    }),
  
  reason: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(500)
    .messages({
      'any.required': 'Reason for reassignment is required',
      'string.min': 'Reason cannot be empty'
    })
});

const escalateStepSchema = Joi.object({
  escalateTo: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'any.required': 'Escalation target is required',
      'string.pattern.base': 'Invalid user ID format'
    }),
  
  reason: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(500)
    .messages({
      'any.required': 'Reason for escalation is required',
      'string.min': 'Reason cannot be empty'
    })
});

const addCommentSchema = Joi.object({
  comment: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(1000)
    .messages({
      'any.required': 'Comment is required',
      'string.min': 'Comment cannot be empty',
      'string.max': 'Comment cannot exceed 1000 characters'
    }),
  
  isInternal: Joi.boolean()
    .default(false)
});

const skipStepSchema = Joi.object({
  reason: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(500)
    .messages({
      'any.required': 'Reason for skipping is required',
      'string.min': 'Reason cannot be empty'
    })
});

module.exports = {
  getStepInstancesQuerySchema,
  completeStepSchema,
  assignStepSchema,
  reassignStepSchema,
  escalateStepSchema,
  addCommentSchema,
  skipStepSchema
};