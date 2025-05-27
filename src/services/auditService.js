import ProcessHistory from '../models/ProcessHistory.js';
import User from '../models/User.js';
import ProcessInstance from '../models/ProcessInstance.js';
import StepInstance from '../models/StepInstance.js';
import logger from '../utils/logger.js';
import { HISTORY_ACTIONS } from '../utils/constants.js';

class AuditService {
  // Log user action
  async logUserAction(userId, action, details = {}) {
    try {
      const logEntry = {
        userId,
        action,
        timestamp: new Date(),
        details,
        ipAddress: details.ipAddress,
        userAgent: details.userAgent
      };

      // Store in database or external audit system
      logger.info('User action logged:', logEntry);
      
      return logEntry;
    } catch (error) {
      logger.error('Failed to log user action:', error);
      throw error;
    }
  }

  // Log process action
  async logProcessAction({
    processInstanceId,
    stepInstanceId = null,
    action,
    performedBy,
    fromStatus = null,
    toStatus = null,
    comments = null,
    metadata = {}
  }) {
    try {
      const historyEntry = new ProcessHistory({
        processInstanceId,
        stepInstanceId,
        action,
        performedBy,
        fromStatus,
        toStatus,
        comments,
        metadata,
        timestamp: new Date()
      });

      await historyEntry.save();
      logger.info(`Process action logged: ${action} for process ${processInstanceId}`);
      
      return historyEntry;
    } catch (error) {
      logger.error('Failed to log process action:', error);
      throw error;
    }
  }

  // Log system event
  async logSystemEvent(event, details = {}) {
    try {
      const logEntry = {
        type: 'system_event',
        event,
        timestamp: new Date(),
        details
      };

      logger.info('System event logged:', logEntry);
      return logEntry;
    } catch (error) {
      logger.error('Failed to log system event:', error);
      throw error;
    }
  }

  // Generate audit report
  async generateAuditReport(filters = {}) {
    try {
      const {
        startDate,
        endDate,
        userId,
        processInstanceId,
        actions,
        limit = 1000
      } = filters;

      const query = {};
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }
      
      if (userId) query.performedBy = userId;
      if (processInstanceId) query.processInstanceId = processInstanceId;
      if (actions && actions.length > 0) query.action = { $in: actions };

      const auditEntries = await ProcessHistory.find(query)
        .populate('performedBy', 'username email profile.firstName profile.lastName')
        .populate('processInstanceId', 'name status')
        .populate('stepInstanceId', 'name status')
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      const report = {
        filters,
        totalEntries: auditEntries.length,
        generatedAt: new Date(),
        entries: auditEntries
      };

      logger.info(`Audit report generated with ${auditEntries.length} entries`);
      return report;
    } catch (error) {
      logger.error('Failed to generate audit report:', error);
      throw error;
    }
  }

  // Get user activity summary
  async getUserActivitySummary(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const activities = await ProcessHistory.find({
        performedBy: userId,
        timestamp: { $gte: startDate }
      }).lean();

      const summary = {
        userId,
        period: `${days} days`,
        totalActivities: activities.length,
        actionBreakdown: {},
        dailyActivity: {}
      };

      // Count actions by type
      activities.forEach(activity => {
        summary.actionBreakdown[activity.action] = 
          (summary.actionBreakdown[activity.action] || 0) + 1;

        // Daily activity
        const date = activity.timestamp.toISOString().split('T')[0];
        summary.dailyActivity[date] = (summary.dailyActivity[date] || 0) + 1;
      });

      return summary;
    } catch (error) {
      logger.error('Failed to get user activity summary:', error);
      throw error;
    }
  }

  // Get process audit trail
  async getProcessAuditTrail(processInstanceId) {
    try {
      const auditTrail = await ProcessHistory.find({ processInstanceId })
        .populate('performedBy', 'username email profile.firstName profile.lastName')
        .populate('stepInstanceId', 'name stepId')
        .sort({ timestamp: 1 })
        .lean();

      const processInfo = await ProcessInstance.findById(processInstanceId)
        .populate('processTemplateId', 'name version')
        .populate('initiatedBy', 'username email profile.firstName profile.lastName')
        .lean();

      return {
        processInfo,
        auditTrail,
        totalEntries: auditTrail.length
      };
    } catch (error) {
      logger.error('Failed to get process audit trail:', error);
      throw error;
    }
  }

  // Get system activity statistics
  async getSystemActivityStats(period = 'week') {
    try {
      const periodMap = {
        day: 1,
        week: 7,
        month: 30,
        year: 365
      };

      const days = periodMap[period] || 7;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [
        totalActivities,
        actionBreakdown,
        userActivityCounts,
        processActivityCounts
      ] = await Promise.all([
        ProcessHistory.countDocuments({ timestamp: { $gte: startDate } }),
        ProcessHistory.aggregate([
          { $match: { timestamp: { $gte: startDate } } },
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        ProcessHistory.aggregate([
          { $match: { timestamp: { $gte: startDate }, performedBy: { $ne: null } } },
          { $group: { _id: '$performedBy', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'user'
            }
          }
        ]),
        ProcessHistory.aggregate([
          { $match: { timestamp: { $gte: startDate } } },
          { $group: { _id: '$processInstanceId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: 'processinstances',
              localField: '_id',
              foreignField: '_id',
              as: 'process'
            }
          }
        ])
      ]);

      return {
        period,
        startDate,
        endDate: new Date(),
        totalActivities,
        actionBreakdown: actionBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        topActiveUsers: userActivityCounts.map(item => ({
          user: item.user[0],
          activityCount: item.count
        })),
        topActiveProcesses: processActivityCounts.map(item => ({
          process: item.process[0],
          activityCount: item.count
        }))
      };
    } catch (error) {
      logger.error('Failed to get system activity stats:', error);
      throw error;
    }
  }

  // Track login/logout events
  async trackAuthEvent(userId, event, details = {}) {
    try {
      await this.logUserAction(userId, `user_${event}`, {
        ...details,
        timestamp: new Date()
      });

      // Update last login if it's a login event
      if (event === 'login') {
        await User.findByIdAndUpdate(userId, { lastLogin: new Date() });
      }
    } catch (error) {
      logger.error('Failed to track auth event:', error);
    }
  }

  // Track data access events
  async trackDataAccess(userId, resourceType, resourceId, action) {
    try {
      await this.logUserAction(userId, 'data_access', {
        resourceType,
        resourceId,
        action,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to track data access:', error);
    }
  }

  // Detect suspicious activities
  async detectSuspiciousActivities() {
    try {
      const lastHour = new Date();
      lastHour.setHours(lastHour.getHours() - 1);

      // Check for unusual activity patterns
      const suspiciousPatterns = await ProcessHistory.aggregate([
        { $match: { timestamp: { $gte: lastHour } } },
        { $group: { _id: '$performedBy', count: { $sum: 1 } } },
        { $match: { count: { $gt: 100 } } }, // More than 100 actions in an hour
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        }
      ]);

      if (suspiciousPatterns.length > 0) {
        logger.warn('Suspicious activity detected:', suspiciousPatterns);
        
        // Send alerts to administrators
        await this.sendSecurityAlert(suspiciousPatterns);
      }

      return suspiciousPatterns;
    } catch (error) {
      logger.error('Failed to detect suspicious activities:', error);
      return [];
    }
  }

  // Send security alert
  async sendSecurityAlert(suspiciousActivities) {
    try {
      const admins = await User.find({ role: 'admin', isActive: true });
      
      for (const admin of admins) {
        // Create notification or send email about suspicious activity
        logger.warn(`Security alert sent to admin: ${admin.email}`);
      }
    } catch (error) {
      logger.error('Failed to send security alert:', error);
    }
  }

  // Cleanup old audit logs
  async cleanupOldAuditLogs(daysToKeep = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await ProcessHistory.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      logger.info(`Cleaned up ${result.deletedCount} old audit log entries`);
      return result.deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old audit logs:', error);
      throw error;
    }
  }

  // Export audit data
  async exportAuditData(filters = {}, format = 'json') {
    try {
      const auditData = await this.generateAuditReport(filters);
      
      if (format === 'csv') {
        return this.convertToCSV(auditData.entries);
      }
      
      return auditData;
    } catch (error) {
      logger.error('Failed to export audit data:', error);
      throw error;
    }
  }

  // Convert audit data to CSV format
  convertToCSV(auditEntries) {
    try {
      const headers = [
        'Timestamp',
        'Action',
        'Performed By',
        'Process',
        'Step',
        'From Status',
        'To Status',
        'Comments'
      ];

      const csvRows = [headers.join(',')];

      auditEntries.forEach(entry => {
        const row = [
          entry.timestamp,
          entry.action,
          entry.performedBy?.username || 'System',
          entry.processInstanceId?.name || '',
          entry.stepInstanceId?.name || '',
          entry.fromStatus || '',
          entry.toStatus || '',
          entry.comments || ''
        ];
        
        csvRows.push(row.map(field => `"${field}"`).join(','));
      });

      return csvRows.join('\n');
    } catch (error) {
      logger.error('Failed to convert audit data to CSV:', error);
      throw error;
    }
  }
}

export default new AuditService();