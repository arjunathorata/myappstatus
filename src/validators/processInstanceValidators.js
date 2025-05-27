const Joi = require('joi');

const createProcessInstanceSchema = Joi.object({
  processTemplateId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'any.required': 'Process template ID is required',
      'string.pattern.base': 'Invalid process template ID format'
    }),
  
  name: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(100)
    .messages({
      'any.required': 'Process name is required',
      'string.min': 'Process name cannot be empty',
      'string.max': 'Process name cannot exceed 100 characters'
    }),
  
  description: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow(''),
  
  priority: Joi.string()
    .valid('low', 'medium', 'high', 'critical')
    .default('medium'),
  
  dueDate: Joi.date()
    .min('now')
    .optional()
    .messages({
      'date.min': 'Due date cannot be in the past'
    }),
  
  variables: Joi.object()
    .optional()
    .default({}),
  
  tags: Joi.array()
    .items(Joi.string().trim().max(50))
    .optional()
    .default([]),
  
  autoStart: Joi.boolean()
    .default(false)
});

const updateProcessInstanceSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .optional(),
  
  description: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow(''),
  
  priority: Joi.string()
    .valid('low', 'medium', 'high', 'critical')
    .optional(),
  
  dueDate: Joi.date()
    .optional()
    .allow(null),
  
  tags: Joi.array()
    .items(Joi.string().trim().max(50))
    .optional()
});

const getProcessInstancesQuerySchema = Joi.object({
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
  
  status: Joi.string()
    .valid('draft', 'active', 'completed', 'cancelled', 'suspended')
    .optional(),
  
  priority: Joi.string()
    .valid('low', 'medium', 'high', 'critical')
    .optional(),
  
  initiatedBy: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  
  processTemplateId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  
  overdue: Joi.boolean()
    .optional(),
  
  tags: Joi.string()
    .trim()
    .optional(),
  
  sortBy: Joi.string()
    .valid('name', 'createdAt', 'startDate', 'dueDate', 'priority', 'status')
    .default('createdAt'),
  
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
});

const updateVariablesSchema = Joi.object({
  variables: Joi.object()
    .required()
    .messages({
      'any.required': 'Variables object is required'
    }),
  
  merge: Joi.boolean()
    .default(true)
});

const processActionSchema = Joi.object({
  reason: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow('')
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

module.exports = {
  createProcessInstanceSchema,
  updateProcessInstanceSchema,
  getProcessInstancesQuerySchema,
  updateVariablesSchema,
  processActionSchema,
  addCommentSchema
};