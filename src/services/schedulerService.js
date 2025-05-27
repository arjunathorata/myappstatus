import cron from 'node-cron';
import logger from '../utils/logger.js';
import ProcessInstance from '../models/ProcessInstance.js';
import StepInstance from '../models/StepInstance.js';
import User from '../models/User.js';
import { PROCESS_STATUS, STEP_STATUS } from '../utils/constants.js';
import notificationService from './notificationService.js';
import config from '../config/environment.js';

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  // Initialize all scheduled jobs
  initialize() {
    if (this.isInitialized) {
      logger.warn('Scheduler service already initialized');
      return;
    }

    try {
      this.setupOverdueTasksJob();
      this.setupEscalationJob();
      this.setupCleanupJob();
      this.setupNotificationDigestJob();
      this.setupHealthCheckJob();

      this.isInitialized = true;
      logger.info('Scheduler service initialized successfully', {
        jobCount: this.jobs.size,
        jobs: Array.from(this.jobs.keys())
      });
    } catch (error) {
      logger.error('Failed to initialize scheduler service:', error);
      throw error;
    }
  }

  // Check for overdue tasks every 15 minutes
  setupOverdueTasksJob() {
    const job = cron.schedule('*/15 * * * *', async () => {
      try {
        await this.checkOverdueTasks();
      } catch (error) {
        logger.error('Error checking overdue tasks:', error);
      }
    }, {
      scheduled: false,
      timezone: config.app.timezone || 'UTC'
    });

    this.jobs.set('overdueTasksCheck', job);
    job.start();
    logger.info('Overdue tasks check job scheduled (every 15 minutes)');
  }

  // Check for task escalations every 30 minutes
  setupEscalationJob() {
    const job = cron.schedule('*/30 * * * *', async () => {
      try {
        await this.processTaskEscalations();
      } catch (error) {
        logger.error('Error processing task escalations:', error);
      }
    }, {
      scheduled: false,
      timezone: config.app.timezone || 'UTC'
    });

    this.jobs.set('taskEscalation', job);
    job.start();
    logger.info('Task escalation job scheduled (every 30 minutes)');
  }

  // Cleanup old data daily at 2 AM
  setupCleanupJob() {
    const job = cron.schedule('0 2 * * *', async () => {
      try {
        await this.cleanupOldData();
      } catch (error) {
        logger.error('Error during cleanup job:', error);
      }
    }, {
      scheduled: false,
      timezone: config.app.timezone || 'UTC'
    });

    this.jobs.set('dailyCleanup', job);
    job.start();
    logger.info('Daily cleanup job scheduled (2:00 AM daily)');
  }

  // Send notification digest daily at 9 AM
  setupNotificationDigestJob() {
    if (!config.features.enableEmailNotifications) {
      logger.info('Email notifications disabled, skipping notification digest job');
      return;
    }

    const job = cron.schedule('0 9 * * 1-5', async () => {
      try {
        await this.sendNotificationDigest();
      } catch (error) {
        logger.error('Error sending notification digest:', error);
      }
    }, {
      scheduled: false,
      timezone: config.app.timezone || 'UTC'
    });

    this.jobs.set('notificationDigest', job);
    job.start();
    logger.info('Notification digest job scheduled (9:00 AM weekdays)');
  }

  // Health check every 5 minutes
  setupHealthCheckJob() {
    const job = cron.schedule('*/5 * * * *', async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Error during health check:', error);
      }
    }, {
      scheduled: false,
      timezone: config.app.timezone || 'UTC'
    });

    this.jobs.set('healthCheck', job);
    job.start();
    logger.debug('Health check job scheduled (every 5 minutes)');
  }

  // Check for overdue tasks
  async checkOverdueTasks() {
    logger.debug('Checking for overdue tasks...');

    const currentDate = new Date();
    
    // Find overdue steps
    const overdueTasks = await StepInstance.find({
      status: { $in: [STEP_STATUS.PENDING, STEP_STATUS.IN_PROGRESS] },
      dueDate: { $lt: currentDate },
      escalated: { $ne: true }
    }).populate('assignedTo processInstanceId');

    if (overdueTasks.length === 0) {
      logger.debug('No overdue tasks found');
      return;
    }

    logger.info(`Found ${overdueTasks.length} overdue tasks`);

    for (const task of overdueTasks) {
      try {
        // Mark as escalated to prevent duplicate notifications
        task.escalated = true;
        await task.save();

        // Send overdue notification
        if (task.assignedTo) {
          await notificationService.createNotification({
            userId: task.assignedTo._id,
            type: 'task_overdue',
            title: 'Task Overdue',
            message: `Task "${task.name}" is overdue`,
            relatedStep: task._id,
            relatedProcess: task.processInstanceId._id,
            priority: 'high'
          });
        }

        logger.info(`Processed overdue task: ${task._id}`);
      } catch (error) {
        logger.error(`Failed to process overdue task ${task._id}:`, error);
      }
    }
  }

  // Process task escalations
  async processTaskEscalations() {
    logger.debug('Processing task escalations...');

    const currentDate = new Date();
    const escalationThreshold = new Date(currentDate.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago

    // Find tasks that need escalation
    const tasksToEscalate = await StepInstance.find({
      status: { $in: [STEP_STATUS.PENDING, STEP_STATUS.IN_PROGRESS] },
      dueDate: { $lt: escalationThreshold },
      escalated: true,
      escalationLevel: { $lt: 3 } // Max 3 escalation levels
    }).populate('assignedTo processInstanceId');

    if (tasksToEscalate.length === 0) {
      logger.debug('No tasks need escalation');
      return;
    }

    logger.info(`Found ${tasksToEscalate.length} tasks for escalation`);

    for (const task of tasksToEscalate) {
      try {
        const escalationLevel = (task.escalationLevel || 0) + 1;
        
        // Update escalation level
        task.escalationLevel = escalationLevel;
        await task.save();

        // Find escalation target (manager or admin)
        const escalationTargets = await User.find({
          $or: [
            { role: 'manager' },
            { role: 'admin' }
          ],
          isActive: true
        });

        // Send escalation notifications
        for (const target of escalationTargets) {
          await notificationService.createNotification({
            userId: target._id,
            type: 'task_escalated',
            title: `Task Escalated (Level ${escalationLevel})`,
            message: `Task "${task.name}" has been escalated due to being overdue`,
            relatedStep: task._id,
            relatedProcess: task.processInstanceId._id,
            priority: 'urgent'
          });
        }

        logger.info(`Escalated task ${task._id} to level ${escalationLevel}`);
      } catch (error) {
        logger.error(`Failed to escalate task ${task._id}:`, error);
      }
    }
  }

  // Cleanup old data
  async cleanupOldData() {
    logger.info('Starting data cleanup...');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    try {
      // Clean up old notifications (older than 30 days and read)
      const cleanedNotifications = await notificationService.deleteMany({
        createdAt: { $lt: thirtyDaysAgo },
        isRead: true
      });

      // Clean up old completed processes (older than 90 days)
      const cleanedProcesses = await ProcessInstance.deleteMany({
        status: PROCESS_STATUS.COMPLETED,
        endDate: { $lt: ninetyDaysAgo }
      });

      // Clean up orphaned step instances
      const cleanedSteps = await StepInstance.deleteMany({
        processInstanceId: { $in: [] }, // This would be updated with actual orphaned IDs
        createdAt: { $lt: ninetyDaysAgo }
      });

      logger.info('Data cleanup completed', {
        notificationsRemoved: cleanedNotifications.deletedCount || 0,
        processesRemoved: cleanedProcesses.deletedCount || 0,
        stepsRemoved: cleanedSteps.deletedCount || 0
      });
    } catch (error) {
      logger.error('Error during data cleanup:', error);
      throw error;
    }
  }

  // Send notification digest
  async sendNotificationDigest() {
    logger.info('Sending notification digest...');

    try {
      // Get users who want email notifications
      const users = await User.find({
        isActive: true,
        'notificationPreferences.emailNotifications': true
      });

      for (const user of users) {
        try {
          // Get user's pending tasks
          const pendingTasks = await StepInstance.find({
            assignedTo: user._id,
            status: { $in: [STEP_STATUS.PENDING, STEP_STATUS.IN_PROGRESS] }
          }).populate('processInstanceId');

          // Get overdue tasks
          const overdueTasks = pendingTasks.filter(task => 
            task.dueDate && new Date(task.dueDate) < new Date()
          );

          if (pendingTasks.length > 0) {
            await notificationService.sendDigestEmail(user, {
              pendingTasks: pendingTasks.length,
              overdueTasks: overdueTasks.length,
              tasks: pendingTasks.slice(0, 10) // Top 10 tasks
            });
          }
        } catch (error) {
          logger.error(`Failed to send digest to user ${user._id}:`, error);
        }
      }

      logger.info('Notification digest sent successfully');
    } catch (error) {
      logger.error('Error sending notification digest:', error);
      throw error;
    }
  }

  // Perform health check
  async performHealthCheck() {
    logger.debug('Performing system health check...');

    try {
      // Check database connectivity
      const processCount = await ProcessInstance.countDocuments();
      
      // Check for system issues
      const stuckProcesses = await ProcessInstance.find({
        status: PROCESS_STATUS.ACTIVE,
        updatedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Not updated in 24 hours
      });

      if (stuckProcesses.length > 0) {
        logger.warn(`Found ${stuckProcesses.length} potentially stuck processes`);
        
        // Notify administrators
        const admins = await User.find({ role: 'admin', isActive: true });
        for (const admin of admins) {
          await notificationService.createNotification({
            userId: admin._id,
            type: 'system_notification',
            title: 'System Health Alert',
            message: `Found ${stuckProcesses.length} potentially stuck processes`,
            priority: 'high'
          });
        }
      }

      logger.debug('Health check completed', {
        totalProcesses: processCount,
        stuckProcesses: stuckProcesses.length
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      throw error;
    }
  }

  // Stop a specific job
  stopJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      this.jobs.delete(jobName);
      logger.info(`Stopped job: ${jobName}`);
      return true;
    }
    return false;
  }

  // Stop all jobs
  stopAll() {
    logger.info('Stopping all scheduled jobs...');
    
    for (const [jobName, job] of this.jobs) {
      try {
        job.stop();
        logger.info(`Stopped job: ${jobName}`);
      } catch (error) {
        logger.error(`Error stopping job ${jobName}:`, error);
      }
    }
    
    this.jobs.clear();
    this.isInitialized = false;
    logger.info('All scheduled jobs stopped');
  }

  // Get job status
  getJobStatus() {
    const status = {};
    for (const [jobName, job] of this.jobs) {
      status[jobName] = {
        running: job.running || false,
        scheduled: true
      };
    }
    return status;
  }

  // Restart a job
  restartJob(jobName) {
    this.stopJob(jobName);
    
    // Reinitialize the specific job
    switch (jobName) {
      case 'overdueTasksCheck':
        this.setupOverdueTasksJob();
        break;
      case 'taskEscalation':
        this.setupEscalationJob();
        break;
      case 'dailyCleanup':
        this.setupCleanupJob();
        break;
      case 'notificationDigest':
        this.setupNotificationDigestJob();
        break;
      case 'healthCheck':
        this.setupHealthCheckJob();
        break;
      default:
        return false;
    }
    
    logger.info(`Restarted job: ${jobName}`);
    return true;
  }
}

export default new SchedulerService();