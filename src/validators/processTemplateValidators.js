import Joi from 'joi';

export const stepSchema = Joi.object({
  stepId: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Step ID is required'
    }),
  
  name: Joi.string()
    .required()
    .trim()
    .max(100)
    .messages({
      'any.required': 'Step name is required',
      'string.max': 'Step name cannot exceed 100 characters'
    }),
  
  description: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow(''),
  
  type: Joi.string()
    .valid('user_task', 'service_task', 'decision', 'parallel', 'exclusive', 'start', 'end')
    .required()
    .messages({
      'any.required': 'Step type is required',
      'any.only': 'Invalid step type'
    }),
  
  assigneeType: Joi.string()
    .valid('user', 'role', 'department', 'auto')
    .default('user'),
  
  assignees: Joi.array()
    .items(Joi.string().trim())
    .optional()
    .default([]),
  
  formSchema: Joi.object()
    .optional()
    .default({}),
  
  autoComplete: Joi.boolean()
    .default(false),
  
  timeLimit: Joi.number()
    .min(0)
    .optional(),
  
  escalation: Joi.object({
    enabled: Joi.boolean().default(false),
    timeLimit: Joi.number().min(0).optional(),
    escalateTo: Joi.array().items(Joi.string().trim()).optional().default([])
  }).optional().default({}),
  
  nextSteps: Joi.array()
    .items(Joi.object({
      condition: Joi.string().trim().optional().allow(''),
      stepId: Joi.string().required().trim()
    }))
    .optional()
    .default([]),
  
  position: Joi.object({
    x: Joi.number().default(0),
    y: Joi.number().default(0)
  }).optional().default({ x: 0, y: 0 })
});

export const variableSchema = Joi.object({
  name: Joi.string()
    .required()
    .trim()
    .max(50),
  
  type: Joi.string()
    .valid('string', 'number', 'boolean', 'date', 'object')
    .default('string'),
  
  defaultValue: Joi.any().optional(),
  
  required: Joi.boolean().default(false),
  
  description: Joi.string()
    .trim()
    .max(200)
    .optional()
});

export const createProcessTemplateSchema = Joi.object({
  name: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(100)
    .messages({
      'any.required': 'Template name is required',
      'string.min': 'Template name cannot be empty',
      'string.max': 'Template name cannot exceed 100 characters'
    }),
  
  description: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow(''),
  
  version: Joi.string()
    .trim()
    .pattern(/^\d+\.\d+\.\d+$/)
    .default('1.0.0')
    .messages({
      'string.pattern.base': 'Version must be in format x.y.z'
    }),
  
  category: Joi.string()
    .required()
    .trim()
    .max(50)
    .messages({
      'any.required': 'Category is required'
    }),
  
  steps: Joi.array()
    .items(stepSchema)
    .min(1)
    .required()
    .messages({
      'any.required': 'At least one step is required',
      'array.min': 'At least one step is required'
    }),
  
  startStep: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Start step is required'
    }),
  
  endSteps: Joi.array()
    .items(Joi.string().trim())
    .min(1)
    .required()
    .messages({
      'any.required': 'At least one end step is required',
      'array.min': 'At least one end step is required'
    }),
  
  variables: Joi.array()
    .items(variableSchema)
    .optional()
    .default([]),
  
  tags: Joi.array()
    .items(Joi.string().trim().max(50))
    .optional()
    .default([])
});

export const updateProcessTemplateSchema = Joi.object({
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
  
  category: Joi.string()
    .trim()
    .max(50)
    .optional(),
  
  steps: Joi.array()
    .items(stepSchema)
    .min(1)
    .optional(),
  
  startStep: Joi.string()
    .trim()
    .optional(),
  
  endSteps: Joi.array()
    .items(Joi.string().trim())
    .min(1)
    .optional(),
  
  variables: Joi.array()
    .items(variableSchema)
    .optional(),
  
  tags: Joi.array()
    .items(Joi.string().trim().max(50))
    .optional()
});

export const getProcessTemplatesQuerySchema = Joi.object({
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
  
  category: Joi.string()
    .trim()
    .max(50)
    .optional(),
  
  isPublished: Joi.boolean()
    .optional(),
  
  createdBy: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  
  tags: Joi.string()
    .trim()
    .optional(),
  
  sortBy: Joi.string()
    .valid('name', 'createdAt', 'updatedAt', 'version', 'category')
    .default('createdAt'),
  
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
});

export const publishTemplateSchema = Joi.object({
  version: Joi.string()
    .trim()
    .pattern(/^\d+\.\d+\.\d+$/)
    .optional()
    .messages({
      'string.pattern.base': 'Version must be in format x.y.z'
    })
});

export const validateTemplateSchema = Joi.object({
  checkReferences: Joi.boolean()
    .default(true),
  
  checkAssignments: Joi.boolean()
    .default(true)
});

export const createVersionSchema = Joi.object({
  version: Joi.string()
    .required()
    .trim()
    .pattern(/^\d+\.\d+\.\d+$/)
    .messages({
      'any.required': 'Version is required',
      'string.pattern.base': 'Version must be in format x.y.z'
    }),
  
  changes: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .allow('')
});



