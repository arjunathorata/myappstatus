import Joi from 'joi';

export const getDashboardQuerySchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'in_progress', 'completed', 'draft', 'active', 'cancelled', 'suspended')
    .optional(),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10),
  
  overdue: Joi.boolean()
    .optional(),
  
  days: Joi.number()
    .integer()
    .min(1)
    .max(365)
    .default(7),
  
  period: Joi.string()
    .valid('day', 'week', 'month', 'year')
    .default('month')
});