import Notification from '../models/Notification.js';
import emailService from './emailService.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';
import { NOTIFICATION_TYPES, NOTIFICATION_PRIORITY } from '../utils/constants.js';
import config from '../config/environment.js';

class NotificationService {
  // Create a new notification
  async createNotification(notificationData) {
    try {
      const {
        userId,
        type,
        title,
        message,
        relatedProcess,
        relatedStep,
        priority = NOTIFICATION_PRIORITY.MEDIUM,
        data = {}
      } = notificationData;

      // Validate required fields
      if (!userId || !type || !title || !message) {
        throw new AppError('Missing required notification fields', 400);
      }

      // Create notification
      const notification = new Notification({
        userId,
        type,
        title,
        message,
        relatedProcess,
        relatedStep,
        priority,
        data,
        isRead: false
      });

      await notification.save();

      // Send email notification if enabled and user preferences allow
      if (config.features.enableEmailNotifications) {
        await this.sendEmailNotification(notification);
      }

      logger.info('Notification created successfully', {
        notificationId: notification._id,
        userId,
        type
      });

      return notification;
    } catch (error) {
      logger.error('Failed to create notification:', error);
      throw error;
    }
  }

  // Create multiple notifications
  async createBulkNotifications(notifications) {
    try {
      const results = [];
      
      for (const notificationData of notifications) {
        const notification = await this.createNotification(notificationData);
        results.push(notification);
      }

      logger.info(`Created ${results.length} bulk notifications`);
      return results;
    } catch (error) {
      logger.error('Failed to create bulk notifications:', error);
      throw error;
    }
  }

  // Get user notifications
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        isRead,
        type,
        priority,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      const query = { userId };
      
      if (isRead !== undefined) {
        query.isRead = isRead;
      }
      
      if (type) {
        query.type = type;
      }
      
      if (priority) {
        query.priority = priority;
      }

      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const skip = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        Notification.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('relatedProcess', 'name status')
          .populate('relatedStep', 'name status'),
        Notification.countDocuments(query)
      ]);

      return {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get user notifications:', error);
      throw error;
    }
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { isRead: true, readAt: new Date() },
        { new: true }
      );

      if (!notification) {
        throw new AppError('Notification not found', 404);
      }

      logger.info('Notification marked as read', {
        notificationId,
        userId
      });

      return notification;
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { userId, isRead: false },
        { isRead: true, readAt: new Date() }
      );

      logger.info('All notifications marked as read', {
        userId,
        updatedCount: result.modifiedCount
      });

      return result;
    } catch (error) {
      logger.error('Failed to mark all notifications as read:', error);
      throw error;
    }
  }

  // Delete notification
  async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        userId
      });

      if (!notification) {
        throw new AppError('Notification not found', 404);
      }

      logger.info('Notification deleted', {
        notificationId,
        userId
      });

      return notification;
    } catch (error) {
      logger.error('Failed to delete notification:', error);
      throw error;
    }
  }

  // Delete all notifications for a user
  async deleteAllNotifications(userId) {
    try {
      const result = await Notification.deleteMany({ userId });

      logger.info('All notifications deleted', {
        userId,
        deletedCount: result.deletedCount
      });

      return result;
    } catch (error) {
      logger.error('Failed to delete all notifications:', error);
      throw error;
    }
  }

  // Get notification counts
  async getNotificationCounts(userId) {
    try {
      const [total, unread, byType, byPriority] = await Promise.all([
        Notification.countDocuments({ userId }),
        Notification.countDocuments({ userId, isRead: false }),
        Notification.aggregate([
          { $match: { userId } },
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ]),
        Notification.aggregate([
          { $match: { userId, isRead: false } },
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ])
      ]);

      return {
        total,
        unread,
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byPriority: byPriority.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      };
    } catch (error) {
      logger.error('Failed to get notification counts:', error);
      throw error;
    }
  }

  // Send email notification
  async sendEmailNotification(notification) {
    try {
      // Populate user and related data
      await notification.populate('userId', 'email username profile notificationPreferences');
      
      const user = notification.userId;
      
      // Check if user has email notifications enabled
      if (!user.notificationPreferences?.emailNotifications) {
        logger.debug('Email notifications disabled for user', { userId: user._id });
        return;
      }

      // Check notification type preferences
      const typeKey = this.getTypePreferenceKey(notification.type);
      if (typeKey && !user.notificationPreferences[typeKey]) {
        logger.debug('Email notification disabled for type', { 
          userId: user._id, 
          type: notification.type 
        });
        return;
      }

      // Send email based on notification type
      await this.sendTypeSpecificEmail(notification, user);

    } catch (error) {
      logger.error('Failed to send email notification:', error);
      // Don't throw error to prevent notification creation failure
    }
  }

  // Get preference key for notification type
  getTypePreferenceKey(type) {
    const typeMapping = {
      [NOTIFICATION_TYPES.TASK_ASSIGNED]: 'taskAssigned',
      [NOTIFICATION_TYPES.TASK_OVERDUE]: 'taskOverdue',
      [NOTIFICATION_TYPES.PROCESS_COMPLETED]: 'processCompleted',
      [NOTIFICATION_TYPES.COMMENT_ADDED]: 'comments',
      [NOTIFICATION_TYPES.TASK_ESCALATED]: 'escalations',
      [NOTIFICATION_TYPES.SYSTEM_NOTIFICATION]: 'systemNotifications'
    };

    return typeMapping[type];
  }

  // Send type-specific email
  async sendTypeSpecificEmail(notification, user) {
    const emailData = {
      to: user.email,
      subject: notification.title,
      template: this.getEmailTemplate(notification.type)
    };

    const templateData = {
      userName: `${user.profile.firstName} ${user.profile.lastName}`,
      notificationTitle: notification.title,
      notificationMessage: notification.message,
      notificationType: notification.type,
      priority: notification.priority,
      createdAt: notification.createdAt,
      systemUrl: config.external?.frontendUrl || 'http://localhost:3000'
    };

    switch (notification.type) {
      case NOTIFICATION_TYPES.TASK_ASSIGNED:
        emailData.subject = `New Task Assigned: ${notification.title}`;
        templateData.actionUrl = `${templateData.systemUrl}/tasks/${notification.relatedStep}`;
        break;

      case NOTIFICATION_TYPES.TASK_OVERDUE:
        emailData.subject = `Task Overdue: ${notification.title}`;
        templateData.actionUrl = `${templateData.systemUrl}/tasks/${notification.relatedStep}`;
        break;

      case NOTIFICATION_TYPES.PROCESS_COMPLETED:
        emailData.subject = `Process Completed: ${notification.title}`;
        templateData.actionUrl = `${templateData.systemUrl}/processes/${notification.relatedProcess}`;
        break;

      case NOTIFICATION_TYPES.TASK_ESCALATED:
        emailData.subject = `Task Escalated: ${notification.title}`;
        templateData.actionUrl = `${templateData.systemUrl}/tasks/${notification.relatedStep}`;
        break;

      default:
        templateData.actionUrl = templateData.systemUrl;
    }

    await emailService.sendTemplatedEmail(emailData, templateData);
  }

  // Get email template for notification type
  getEmailTemplate(type) {
    const templates = {
      [NOTIFICATION_TYPES.TASK_ASSIGNED]: 'task-assignment',
      [NOTIFICATION_TYPES.TASK_OVERDUE]: 'task-reminder',
      [NOTIFICATION_TYPES.PROCESS_COMPLETED]: 'process-completion',
      [NOTIFICATION_TYPES.TASK_ESCALATED]: 'task-escalation',
      [NOTIFICATION_TYPES.SYSTEM_NOTIFICATION]: 'system-notification'
    };

    return templates[type] || 'general-notification';
  }

  // Send digest email
  async sendDigestEmail(user, digestData) {
    try {
      if (!user.notificationPreferences?.emailNotifications) {
        return;
      }

      const emailData = {
        to: user.email,
        subject: `Daily Task Digest - ${digestData.pendingTasks} pending tasks`,
        template: 'daily-digest'
      };

      const templateData = {
        userName: `${user.profile.firstName} ${user.profile.lastName}`,
        pendingTasks: digestData.pendingTasks,
        overdueTasks: digestData.overdueTasks,
        tasks: digestData.tasks,
        systemUrl: config.external?.frontendUrl || 'http://localhost:3000'
      };

      await emailService.sendTemplatedEmail(emailData, templateData);

      logger.info('Digest email sent', { userId: user._id });
    } catch (error) {
      logger.error('Failed to send digest email:', error);
      throw error;
    }
  }

  // Clean up old notifications
  async deleteMany(query) {
    try {
      const result = await Notification.deleteMany(query);
      logger.info('Notifications cleaned up', { deletedCount: result.deletedCount });
      return result;
    } catch (error) {
      logger.error('Failed to cleanup notifications:', error);
      throw error;
    }
  }

  // Send system notification to all administrators
  async notifyAdministrators(title, message, data = {}) {
    try {
      const User = (await import('../models/User.js')).default;
      const admins = await User.find({ role: 'admin', isActive: true });

      const notifications = admins.map(admin => ({
        userId: admin._id,
        type: NOTIFICATION_TYPES.SYSTEM_NOTIFICATION,
        title,
        message,
        priority: NOTIFICATION_PRIORITY.HIGH,
        data
      }));

      await this.createBulkNotifications(notifications);

      logger.info('System notification sent to administrators', {
        adminCount: admins.length,
        title
      });
    } catch (error) {
      logger.error('Failed to notify administrators:', error);
      throw error;
    }
  }
}

export default new NotificationService();