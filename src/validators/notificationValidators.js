const Joi = require('joi');

const getNotificationsQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  
  isRead: Joi.boolean()
    .optional(),
  
  type: Joi.string()
    .valid(
      'task_assigned', 'task_reassigned', 'task_completed', 'task_overdue', 
      'task_escalated', 'process_started', 'process_completed', 'process_cancelled',
      'comment_added', 'attachment_added', 'system_notification'
    )
    .optional(),
  
  priority: Joi.string()
    .valid('low', 'medium', 'high', 'urgent')
    .optional(),
  
  relatedProcess: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  
  sortBy: Joi.string()
    .valid('createdAt', 'priority', 'isRead')
    .default('createdAt'),
  
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
});

const createNotificationSchema = Joi.object({
  userId: Joi.alternatives()
    .try(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
      Joi.string().valid('all')
    )
    .required()
    .messages({
      'any.required': 'User ID is required',
      'alternatives.match': 'User ID must be a valid ObjectId or "all"'
    }),
  
  type: Joi.string()
    .valid(
      'task_assigned', 'task_reassigned', 'task_completed', 'task_overdue', 
      'task_escalated', 'process_started', 'process_completed', 'process_cancelled',
      'comment_added', 'attachment_added', 'system_notification'
    )
    .required()
    .messages({
      'any.required': 'Notification type is required'
    }),
  
  title: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(200)
    .messages({
      'any.required': 'Title is required',
      'string.min': 'Title cannot be empty',
      'string.max': 'Title cannot exceed 200 characters'
    }),
  
  message: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(1000)
    .messages({
      'any.required': 'Message is required',
      'string.min': 'Message cannot be empty',
      'string.max': 'Message cannot exceed 1000 characters'
    }),
  
  relatedProcess: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  
  relatedStep: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  
  priority: Joi.string()
    .valid('low', 'medium', 'high', 'urgent')
    .default('medium'),
  
  sendEmail: Joi.boolean()
    .default(false),
  
  metadata: Joi.object()
    .optional()
    .default({})
});

const markNotificationsReadSchema = Joi.object({
  type: Joi.string()
    .valid(
      'task_assigned', 'task_reassigned', 'task_completed', 'task_overdue', 
      'task_escalated', 'process_started', 'process_completed', 'process_cancelled',
      'comment_added', 'attachment_added', 'system_notification'
    )
    .optional(),
  
  olderThan: Joi.date()
    .optional()
});

const bulkDeleteSchema = Joi.object({
  notificationIds: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .when('deleteRead', { is: false, then: Joi.required() })
    .when('olderThan', { is: Joi.exist(), then: Joi.optional() }),
  
  deleteRead: Joi.boolean()
    .default(false),
  
  olderThan: Joi.date()
    .optional()
}).or('notificationIds', 'deleteRead', 'olderThan');

const notificationPreferencesSchema = Joi.object({
  emailNotifications: Joi.boolean().default(true),
  taskAssigned: Joi.boolean().default(true),
  taskOverdue: Joi.boolean().default(true),
  processCompleted: Joi.boolean().default(true),
  comments: Joi.boolean().default(true),
  escalations: Joi.boolean().default(true),
  systemNotifications: Joi.boolean().default(true)
});

module.exports = {
  getNotificationsQuerySchema,
  createNotificationSchema,
  markNotificationsReadSchema,
  bulkDeleteSchema,
  notificationPreferencesSchema
};