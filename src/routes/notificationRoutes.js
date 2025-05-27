import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import { cache } from '../middleware/cache.js';
import { validate, validateQuery, validateParams } from '../utils/validation.js';
import { querySchemas, paramSchemas } from '../utils/validation.js';
import notificationController from '../controllers/notificationController.js';
import { catchAsync } from '../utils/helpers.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Apply rate limiting
router.use(generalLimiter);

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Notification ID
 *         userId:
 *           type: string
 *           description: User ID
 *         type:
 *           type: string
 *           enum: [task_assigned, task_completed, task_overdue, process_completed, system_notification]
 *         title:
 *           type: string
 *           description: Notification title
 *         message:
 *           type: string
 *           description: Notification message
 *         priority:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         isRead:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of notifications per page
 *       - in: query
 *         name: isRead
 *         schema:
 *           type: boolean
 *         description: Filter by read status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by notification type
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: Filter by priority
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Notification'
 *                     pagination:
 *                       type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/',
  validateQuery(querySchemas.pagination),
  cache({ ttl: 60 }), // 1 minute cache
  catchAsync(notificationController.getNotifications)
);

/**
 * @swagger
 * /api/notifications/counts:
 *   get:
 *     summary: Get notification counts
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification counts retrieved successfully
 */
router.get('/counts',
  cache({ ttl: 30 }), // 30 seconds cache
  catchAsync(notificationController.getNotificationCounts)
);

/**
 * @swagger
 * /api/notifications/{id}:
 *   get:
 *     summary: Get specific notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification retrieved successfully
 *       404:
 *         description: Notification not found
 */
router.get('/:id',
  validateParams(paramSchemas.id),
  catchAsync(notificationController.getNotification)
);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
router.patch('/:id/read',
  validateParams(paramSchemas.id),
  catchAsync(notificationController.markAsRead)
);

/**
 * @swagger
 * /api/notifications/mark-all-read:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.patch('/mark-all-read',
  catchAsync(notificationController.markAllAsRead)
);

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *       404:
 *         description: Notification not found
 */
router.delete('/:id',
  validateParams(paramSchemas.id),
  catchAsync(notificationController.deleteNotification)
);

/**
 * @swagger
 * /api/notifications:
 *   delete:
 *     summary: Delete all notifications for user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications deleted successfully
 */
router.delete('/',
  catchAsync(notificationController.deleteAllNotifications)
);

// Admin routes
/**
 * @swagger
 * /api/notifications/admin/broadcast:
 *   post:
 *     summary: Send broadcast notification (Admin only)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *               - recipients
 *             properties:
 *               title:
 *                 type: string
 *                 description: Notification title
 *               message:
 *                 type: string
 *                 description: Notification message
 *               recipients:
 *                 type: string
 *                 enum: [all, admins, managers, users, department]
 *                 description: Recipient group
 *               department:
 *                 type: string
 *                 description: Department name (required if recipients is 'department')
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: medium
 *     responses:
 *       200:
 *         description: Broadcast notification sent successfully
 *       403:
 *         description: Admin access required
 */
router.post('/admin/broadcast',
  authorize('admin'),
  catchAsync(notificationController.sendBroadcastNotification)
);

export default router;