import notificationService from '../services/notificationService.js';
import User from '../models/User.js';
import { AppError } from '../utils/helpers.js';
import { NOTIFICATION_TYPES, NOTIFICATION_PRIORITY, USER_ROLES } from '../utils/constants.js';
import logger from '../utils/logger.js';

class NotificationController {
  // Get user notifications
  async getNotifications(req, res) {
    try {
      const userId = req.user._id;
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        isRead: req.query.isRead !== undefined ? req.query.isRead === 'true' : undefined,
        type: req.query.type,
        priority: req.query.priority,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc'
      };

      const result = await notificationService.getUserNotifications(userId, options);

      logger.info('User notifications retrieved', {
        userId,
        count: result.notifications.length,
        total: result.pagination.total
      });

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.errorWithContext(error, {
        controller: 'NotificationController',
        method: 'getNotifications',
        userId: req.user._id
      });
      throw new AppError('Failed to retrieve notifications', 500);
    }
  }

  // Get specific notification
  async getNotification(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const Notification = (await import('../models/Notification.js')).default;
      const notification = await Notification.findOne({ _id: id, userId })
        .populate('relatedProcess', 'name status')
        .populate('relatedStep', 'name status');

      if (!notification) {
        throw new AppError('Notification not found', 404);
      }

      logger.info('Notification retrieved', {
        notificationId: id,
        userId
      });

      res.json({
        status: 'success',
        data: { notification }
      });
    } catch (error) {
      logger.errorWithContext(error, {
        controller: 'NotificationController',
        method: 'getNotification',
        notificationId: req.params.id,
        userId: req.user._id
      });
      
      if (error.statusCode) throw error;
      throw new AppError('Failed to retrieve notification', 500);
    }
  }

  // Get notification counts
  async getNotificationCounts(req, res) {
    try {
      const userId = req.user._id;
      const counts = await notificationService.getNotificationCounts(userId);

      logger.debug('Notification counts retrieved', {
        userId,
        counts
      });

      res.json({
        status: 'success',
        data: { counts }
      });
    } catch (error) {
      logger.errorWithContext(error, {
        controller: 'NotificationController',
        method: 'getNotificationCounts',
        userId: req.user._id
      });
      throw new AppError('Failed to retrieve notification counts', 500);
    }
  }

  // Mark notification as read
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const notification = await notificationService.markAsRead(id, userId);

      logger.info('Notification marked as read', {
        notificationId: id,
        userId
      });

      res.json({
        status: 'success',
        message: 'Notification marked as read',
        data: { notification }
      });
    } catch (error) {
      logger.errorWithContext(error, {
        controller: 'NotificationController',
        method: 'markAsRead',
        notificationId: req.params.id,
        userId: req.user._id
      });
      
      if (error.statusCode) throw error;
      throw new AppError('Failed to mark notification as read', 500);
    }
  }

  // Mark all notifications as read
  async markAllAsRead(req, res) {
    try {
      const userId = req.user._id;
      const result = await notificationService.markAllAsRead(userId);

      logger.info('All notifications marked as read', {
        userId,
        updatedCount: result.modifiedCount
      });

      res.json({
        status: 'success',
        message: 'All notifications marked as read',
        data: { updatedCount: result.modifiedCount }
      });
    } catch (error) {
      logger.errorWithContext(error, {
        controller: 'NotificationController',
        method: 'markAllAsRead',
        userId: req.user._id
      });
      throw new AppError('Failed to mark all notifications as read', 500);
    }
  }

  // Delete notification
  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const notification = await notificationService.deleteNotification(id, userId);

      logger.info('Notification deleted', {
        notificationId: id,
        userId
      });

      res.json({
        status: 'success',
        message: 'Notification deleted successfully',
        data: { notification }
      });
    } catch (error) {
      logger.errorWithContext(error, {
        controller: 'NotificationController',
        method: 'deleteNotification',
        notificationId: req.params.id,
        userId: req.user._id
      });
      
      if (error.statusCode) throw error;
      throw new AppError('Failed to delete notification', 500);
    }
  }

  // Delete all notifications
  async deleteAllNotifications(req, res) {
    try {
      const userId = req.user._id;
      const result = await notificationService.deleteAllNotifications(userId);

      logger.info('All notifications deleted', {
        userId,
        deletedCount: result.deletedCount
      });

      res.json({
        status: 'success',
        message: 'All notifications deleted successfully',
        data: { deletedCount: result.deletedCount }
      });
    } catch (error) {
      logger.errorWithContext(error, {
        controller: 'NotificationController',
        method: 'deleteAllNotifications',
        userId: req.user._id
      });
      throw new AppError('Failed to delete all notifications', 500);
    }
  }

  // Send broadcast notification (Admin only)
  async sendBroadcastNotification(req, res) {
    try {
      const { title, message, recipients, department, priority = NOTIFICATION_PRIORITY.MEDIUM } = req.body;
      
      // Validate required fields
      if (!title || !message || !recipients) {
        throw new AppError('Title, message, and recipients are required', 400);
      }

      // Get target users based on recipients
      let targetUsers = [];
      
      switch (recipients) {
        case 'all':
          targetUsers = await User.find({ isActive: true }).select('_id');
          break;
          
        case 'admins':
          targetUsers = await User.find({ 
            role: USER_ROLES.ADMIN, 
            isActive: true 
          }).select('_id');
          break;
          
        case 'managers':
          targetUsers = await User.find({ 
            role: USER_ROLES.MANAGER, 
            isActive: true 
          }).select('_id');
          break;
          
        case 'users':
          targetUsers = await User.find({ 
            role: USER_ROLES.USER, 
            isActive: true 
          }).select('_id');
          break;
          
        case 'department':
          if (!department) {
            throw new AppError('Department is required when recipients is "department"', 400);
          }
          targetUsers = await User.find({ 
            'profile.department': department, 
            isActive: true 
          }).select('_id');
          break;
          
        default:
          throw new AppError('Invalid recipients value', 400);
      }

      if (targetUsers.length === 0) {
        throw new AppError('No target users found', 400);
      }

      // Create notifications for all target users
      const notifications = targetUsers.map(user => ({
        userId: user._id,
        type: NOTIFICATION_TYPES.SYSTEM_NOTIFICATION,
        title,
        message,
        priority,
        data: {
          broadcast: true,
          recipients,
          department,
          sentBy: req.user._id
        }
      }));

      await notificationService.createBulkNotifications(notifications);

      logger.info('Broadcast notification sent', {
        sentBy: req.user._id,
        recipients,
        department,
        userCount: targetUsers.length,
        title
      });

      res.json({
        status: 'success',
        message: 'Broadcast notification sent successfully',
        data: {
          recipients,
          userCount: targetUsers.length,
          title,
          priority
        }
      });
    } catch (error) {
      logger.errorWithContext(error, {
        controller: 'NotificationController',
        method: 'sendBroadcastNotification',
        userId: req.user._id
      });
      
      if (error.statusCode) throw error;
      throw new AppError('Failed to send broadcast notification', 500);
    }
  }

  // Create notification (internal use)
  async createNotification(req, res) {
    try {
      const notificationData = {
        ...req.body,
        userId: req.body.userId || req.user._id
      };

      const notification = await notificationService.createNotification(notificationData);

      logger.info('Notification created', {
        notificationId: notification._id,
        userId: notification.userId,
        type: notification.type
      });

      res.status(201).json({
        status: 'success',
        message: 'Notification created successfully',
        data: { notification }
      });
    } catch (error) {
      logger.errorWithContext(error, {
        controller: 'NotificationController',
        method: 'createNotification',
        userId: req.user._id
      });
      
      if (error.statusCode) throw error;
      throw new AppError('Failed to create notification', 500);
    }
  }
}

export default new NotificationController();