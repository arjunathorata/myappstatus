import ProcessInstance from '../models/ProcessInstance.js';
import StepInstance from '../models/StepInstance.js';
import User from '../models/User.js';
import ProcessTemplate from '../models/ProcessTemplate.js';
import ProcessHistory from '../models/ProcessHistory.js';
import { AppError, formatDate, calculatePercentage } from '../utils/helpers.js';
import { PROCESS_STATUS, STEP_STATUS } from '../utils/constants.js';
import logger from '../utils/logger.js';
import dayjs from 'dayjs';

class ReportController {
  // Get dashboard statistics
  async getDashboardStats(req, res) {
    try {
      const userId = req.user._id;
      const userRole = req.user.role;
      
      // Base query filters based on user role
      const getBaseQuery = () => {
        if (userRole === 'admin') {
          return {}; // Admin can see all
        } else if (userRole === 'manager') {
          return {
            $or: [
              { initiatedBy: userId },
              { 'assignedUsers': userId },
              { 'steps.assignedTo': userId }
            ]
          };
        } else {
          return {
            $or: [
              { initiatedBy: userId },
              { 'steps.assignedTo': userId }
            ]
          };
        }
      };

      const baseQuery = getBaseQuery();
      const currentDate = new Date();
      const startOfMonth = dayjs().startOf('month').toDate();
      const startOfWeek = dayjs().startOf('week').toDate();

      // Process statistics
      const [
        totalProcesses,
        activeProcesses,
        completedProcesses,
        overdueProcesses,
        weeklyProcesses,
        monthlyProcesses
      ] = await Promise.all([
        ProcessInstance.countDocuments(baseQuery),
        ProcessInstance.countDocuments({ ...baseQuery, status: PROCESS_STATUS.ACTIVE }),
        ProcessInstance.countDocuments({ ...baseQuery, status: PROCESS_STATUS.COMPLETED }),
        ProcessInstance.countDocuments({
          ...baseQuery,
          status: PROCESS_STATUS.ACTIVE,
          dueDate: { $lt: currentDate }
        }),
        ProcessInstance.countDocuments({
          ...baseQuery,
          createdAt: { $gte: startOfWeek }
        }),
        ProcessInstance.countDocuments({
          ...baseQuery,
          createdAt: { $gte: startOfMonth }
        })
      ]);

      // Task statistics
      const taskQuery = userRole === 'admin' ? {} : { assignedTo: userId };
      
      const [
        myTasks,
        pendingTasks,
        completedTasks,
        overdueTasks
      ] = await Promise.all([
        StepInstance.countDocuments(taskQuery),
        StepInstance.countDocuments({ ...taskQuery, status: STEP_STATUS.PENDING }),
        StepInstance.countDocuments({ ...taskQuery, status: STEP_STATUS.COMPLETED }),
        StepInstance.countDocuments({
          ...taskQuery,
          status: { $in: [STEP_STATUS.PENDING, STEP_STATUS.IN_PROGRESS] },
          dueDate: { $lt: currentDate }
        })
      ]);

      // Recent activity
      const recentProcesses = await ProcessInstance.find(baseQuery)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('processTemplateId', 'name category')
        .populate('initiatedBy', 'username profile.firstName profile.lastName')
        .select('name status priority createdAt dueDate');

      const recentTasks = await StepInstance.find(taskQuery)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('processInstanceId', 'name')
        .populate('assignedTo', 'username profile.firstName profile.lastName')
        .select('name status dueDate createdAt');

      // Process completion rate
      const completionRate = totalProcesses > 0 
        ? calculatePercentage(completedProcesses, totalProcesses)
        : 0;

      // Average process duration (for completed processes)
      const avgDurationResult = await ProcessInstance.aggregate([
        {
          $match: {
            ...baseQuery,
            status: PROCESS_STATUS.COMPLETED,
            endDate: { $exists: true }
          }
        },
        {
          $project: {
            duration: {
              $subtract: ['$endDate', '$startDate']
            }
          }
        },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$duration' }
          }
        }
      ]);

      const avgDuration = avgDurationResult.length > 0 
        ? Math.round(avgDurationResult[0].avgDuration / (1000 * 60 * 60 * 24)) // Convert to days
        : 0;

      // Process distribution by status
      const statusDistribution = await ProcessInstance.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Priority distribution
      const priorityDistribution = await ProcessInstance.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 }
          }
        }
      ]);

      const stats = {
        overview: {
          totalProcesses,
          activeProcesses,
          completedProcesses,
          overdueProcesses,
          completionRate,
          avgDuration,
          weeklyProcesses,
          monthlyProcesses
        },
        tasks: {
          myTasks,
          pendingTasks,
          completedTasks,
          overdueTasks
        },
        recentActivity: {
          processes: recentProcesses,
          tasks: recentTasks
        },
        distributions: {
          status: statusDistribution,
          priority: priorityDistribution
        },
        generatedAt: new Date(),
        userRole
      };

      res.json({
        status: 'success',
        data: stats
      });
    } catch (error) {
      logger.errorWithContext(error, { 
        controller: 'ReportController',
        method: 'getDashboardStats',
        userId: req.user._id 
      });
      throw new AppError('Failed to generate dashboard statistics', 500);
    }
  }

  // Get process performance report
  async getProcessPerformanceReport(req, res) {
    try {
      const { dateFrom, dateTo, processTemplateId } = req.query;
      
      // Build query
      const query = {};
      
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }
      
      if (processTemplateId) {
        query.processTemplateId = processTemplateId;
      }

      // Process performance metrics
      const performanceData = await ProcessInstance.aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'processtemplates',
            localField: 'processTemplateId',
            foreignField: '_id',
            as: 'template'
          }
        },
        { $unwind: '$template' },
        {
          $group: {
            _id: {
              templateId: '$processTemplateId',
              templateName: '$template.name',
              status: '$status'
            },
            count: { $sum: 1 },
            avgDuration: {
              $avg: {
                $cond: [
                  { $and: ['$startDate', '$endDate'] },
                  { $subtract: ['$endDate', '$startDate'] },
                  null
                ]
              }
            },
            totalDuration: {
              $sum: {
                $cond: [
                  { $and: ['$startDate', '$endDate'] },
                  { $subtract: ['$endDate', '$startDate'] },
                  0
                ]
              }
            }
          }
        },
        {
          $group: {
            _id: {
              templateId: '$_id.templateId',
              templateName: '$_id.templateName'
            },
            statusBreakdown: {
              $push: {
                status: '$_id.status',
                count: '$count',
                avgDuration: '$avgDuration'
              }
            },
            totalProcesses: { $sum: '$count' },
            overallAvgDuration: { $avg: '$avgDuration' }
          }
        },
        { $sort: { totalProcesses: -1 } }
      ]);

      // Calculate completion rates and SLA compliance
      const enrichedData = performanceData.map(item => {
        const statusMap = {};
        item.statusBreakdown.forEach(status => {
          statusMap[status.status] = status;
        });

        const completedCount = statusMap[PROCESS_STATUS.COMPLETED]?.count || 0;
        const completionRate = calculatePercentage(completedCount, item.totalProcesses);
        
        // Convert average duration from milliseconds to days
        const avgDurationDays = item.overallAvgDuration 
          ? Math.round(item.overallAvgDuration / (1000 * 60 * 60 * 24))
          : 0;

        return {
          templateId: item._id.templateId,
          templateName: item._id.templateName,
          totalProcesses: item.totalProcesses,
          completionRate,
          avgDurationDays,
          statusBreakdown: item.statusBreakdown
        };
      });

      res.json({
        status: 'success',
        data: {
          summary: {
            totalTemplates: enrichedData.length,
            totalProcesses: enrichedData.reduce((sum, item) => sum + item.totalProcesses, 0),
            avgCompletionRate: enrichedData.length > 0 
              ? Math.round(enrichedData.reduce((sum, item) => sum + item.completionRate, 0) / enrichedData.length)
              : 0
          },
          processTemplates: enrichedData,
          filters: { dateFrom, dateTo, processTemplateId },
          generatedAt: new Date()
        }
      });
    } catch (error) {
      logger.errorWithContext(error, { 
        controller: 'ReportController',
        method: 'getProcessPerformanceReport' 
      });
      throw new AppError('Failed to generate process performance report', 500);
    }
  }

  // Get user workload report
  async getUserWorkloadReport(req, res) {
    try {
      const { department, dateFrom, dateTo } = req.query;
      
      // Build user query
      const userQuery = { isActive: true };
      if (department) {
        userQuery['profile.department'] = department;
      }

      // Build task query
      const taskQuery = {};
      if (dateFrom || dateTo) {
        taskQuery.createdAt = {};
        if (dateFrom) taskQuery.createdAt.$gte = new Date(dateFrom);
        if (dateTo) taskQuery.createdAt.$lte = new Date(dateTo);
      }

      // Get user workload data
      const workloadData = await User.aggregate([
        { $match: userQuery },
        {
          $lookup: {
            from: 'stepinstances',
            let: { userId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$assignedTo', '$$userId'] },
                  ...taskQuery
                }
              }
            ],
            as: 'tasks'
          }
        },
        {
          $project: {
            username: 1,
            'profile.firstName': 1,
            'profile.lastName': 1,
            'profile.department': 1,
            'profile.position': 1,
            totalTasks: { $size: '$tasks' },
            pendingTasks: {
              $size: {
                $filter: {
                  input: '$tasks',
                  cond: { $eq: ['$$this.status', STEP_STATUS.PENDING] }
                }
              }
            },
            inProgressTasks: {
              $size: {
                $filter: {
                  input: '$tasks',
                  cond: { $eq: ['$$this.status', STEP_STATUS.IN_PROGRESS] }
                }
              }
            },
            completedTasks: {
              $size: {
                $filter: {
                  input: '$tasks',
                  cond: { $eq: ['$$this.status', STEP_STATUS.COMPLETED] }
                }
              }
            },
            overdueTasks: {
              $size: {
                $filter: {
                  input: '$tasks',
                  cond: {
                    $and: [
                      { $in: ['$$this.status', [STEP_STATUS.PENDING, STEP_STATUS.IN_PROGRESS]] },
                      { $lt: ['$$this.dueDate', new Date()] }
                    ]
                  }
                }
              }
            },
            avgTaskDuration: {
              $avg: {
                $map: {
                  input: {
                    $filter: {
                      input: '$tasks',
                      cond: {
                        $and: [
                          { $eq: ['$$this.status', STEP_STATUS.COMPLETED] },
                          { $ne: ['$$this.completedAt', null] }
                        ]
                      }
                    }
                  },
                  as: 'task',
                  in: {
                    $subtract: ['$$task.completedAt', '$$task.createdAt']
                  }
                }
              }
            }
          }
        },
        {
          $addFields: {
            completionRate: {
              $cond: [
                { $gt: ['$totalTasks', 0] },
                { $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] },
                0
              ]
            },
            avgTaskDurationHours: {
              $cond: [
                { $ne: ['$avgTaskDuration', null] },
                { $divide: ['$avgTaskDuration', 1000 * 60 * 60] }, // Convert to hours
                0
              ]
            }
          }
        },
        { $sort: { totalTasks: -1 } }
      ]);

      // Department summary
      const departmentSummary = await User.aggregate([
        { $match: userQuery },
        {
          $lookup: {
            from: 'stepinstances',
            let: { userId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$assignedTo', '$$userId'] },
                  ...taskQuery
                }
              }
            ],
            as: 'tasks'
          }
        },
        {
          $group: {
            _id: '$profile.department',
            userCount: { $sum: 1 },
            totalTasks: { $sum: { $size: '$tasks' } },
            avgTasksPerUser: { $avg: { $size: '$tasks' } }
          }
        },
        { $sort: { totalTasks: -1 } }
      ]);

      res.json({
        status: 'success',
        data: {
          summary: {
            totalUsers: workloadData.length,
            totalTasks: workloadData.reduce((sum, user) => sum + user.totalTasks, 0),
            avgTasksPerUser: workloadData.length > 0 
              ? Math.round(workloadData.reduce((sum, user) => sum + user.totalTasks, 0) / workloadData.length)
              : 0
          },
          users: workloadData,
          departmentSummary,
          filters: { department, dateFrom, dateTo },
          generatedAt: new Date()
        }
      });
    } catch (error) {
      logger.errorWithContext(error, { 
        controller: 'ReportController',
        method: 'getUserWorkloadReport' 
      });
      throw new AppError('Failed to generate user workload report', 500);
    }
  }

  // Get SLA compliance report
  async getSLAComplianceReport(req, res) {
    try {
      const { dateFrom, dateTo } = req.query;
      
      const query = {};
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      // Process SLA compliance
      const processSLA = await ProcessInstance.aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'processtemplates',
            localField: 'processTemplateId',
            foreignField: '_id',
            as: 'template'
          }
        },
        { $unwind: '$template' },
        {
          $project: {
            templateName: '$template.name',
            status: 1,
            dueDate: 1,
            endDate: 1,
            isOverdue: {
              $cond: [
                { $and: ['$dueDate', { $ne: ['$status', PROCESS_STATUS.COMPLETED] }] },
                { $lt: ['$dueDate', new Date()] },
                false
              ]
            },
            isOnTime: {
              $cond: [
                { $and: ['$dueDate', '$endDate', { $eq: ['$status', PROCESS_STATUS.COMPLETED] }] },
                { $lte: ['$endDate', '$dueDate'] },
                null
              ]
            }
          }
        },
        {
          $group: {
            _id: '$templateName',
            totalProcesses: { $sum: 1 },
            completedProcesses: {
              $sum: {
                $cond: [{ $eq: ['$status', PROCESS_STATUS.COMPLETED] }, 1, 0]
              }
            },
            overdueProcesses: {
              $sum: {
                $cond: ['$isOverdue', 1, 0]
              }
            },
            onTimeCompletions: {
              $sum: {
                $cond: ['$isOnTime', 1, 0]
              }
            }
          }
        },
        {
          $addFields: {
            completionRate: {
              $multiply: [
                { $divide: ['$completedProcesses', '$totalProcesses'] },
                100
              ]
            },
            slaCompliance: {
              $cond: [
                { $gt: ['$completedProcesses', 0] },
                {
                  $multiply: [
                    { $divide: ['$onTimeCompletions', '$completedProcesses'] },
                    100
                  ]
                },
                0
              ]
            }
          }
        },
        { $sort: { totalProcesses: -1 } }
      ]);

      // Task SLA compliance
      const taskSLA = await StepInstance.aggregate([
        { $match: query },
        {
          $project: {
            name: 1,
            status: 1,
            dueDate: 1,
            completedAt: 1,
            isOverdue: {
              $cond: [
                { $and: ['$dueDate', { $ne: ['$status', STEP_STATUS.COMPLETED] }] },
                { $lt: ['$dueDate', new Date()] },
                false
              ]
            },
            isOnTime: {
              $cond: [
                { $and: ['$dueDate', '$completedAt', { $eq: ['$status', STEP_STATUS.COMPLETED] }] },
                { $lte: ['$completedAt', '$dueDate'] },
                null
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            completedTasks: {
              $sum: {
                $cond: [{ $eq: ['$status', STEP_STATUS.COMPLETED] }, 1, 0]
              }
            },
            overdueTasks: {
              $sum: {
                $cond: ['$isOverdue', 1, 0]
              }
            },
            onTimeCompletions: {
              $sum: {
                $cond: ['$isOnTime', 1, 0]
              }
            }
          }
        },
        {
          $addFields: {
            taskCompletionRate: {
              $multiply: [
                { $divide: ['$completedTasks', '$totalTasks'] },
                100
              ]
            },
            taskSlaCompliance: {
              $cond: [
                { $gt: ['$completedTasks', 0] },
                {
                  $multiply: [
                    { $divide: ['$onTimeCompletions', '$completedTasks'] },
                    100
                  ]
                },
                0
              ]
            }
          }
        }
      ]);

      const overallSLA = taskSLA[0] || {
        totalTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
        onTimeCompletions: 0,
        taskCompletionRate: 0,
        taskSlaCompliance: 0
      };

      res.json({
        status: 'success',
        data: {
          summary: {
            overallSlaCompliance: Math.round(
              processSLA.reduce((sum, item) => sum + item.slaCompliance, 0) / 
              Math.max(processSLA.length, 1)
            ),
            totalProcesses: processSLA.reduce((sum, item) => sum + item.totalProcesses, 0),
            totalOverdue: processSLA.reduce((sum, item) => sum + item.overdueProcesses, 0)
          },
          processSLA,
          taskSLA: overallSLA,
          filters: { dateFrom, dateTo },
          generatedAt: new Date()
        }
      });
    } catch (error) {
      logger.errorWithContext(error, { 
        controller: 'ReportController',
        method: 'getSLAComplianceReport' 
      });
      throw new AppError('Failed to generate SLA compliance report', 500);
    }
  }

  // Get process trends report
  async getProcessTrendsReport(req, res) {
    try {
      const { period = 'daily', dateFrom, dateTo } = req.query;
      
      const query = {};
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      // Define date grouping based on period
      let dateGroup;
      switch (period) {
        case 'yearly':
          dateGroup = { $year: '$createdAt' };
          break;
        case 'monthly':
          dateGroup = {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          };
          break;
        case 'weekly':
          dateGroup = {
            year: { $year: '$createdAt' },
            week: { $week: '$createdAt' }
          };
          break;
        default: // daily
          dateGroup = {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          };
      }

      // Process creation trends
      const creationTrends = await ProcessInstance.aggregate([
        { $match: query },
        {
          $group: {
            _id: dateGroup,
            processesCreated: { $sum: 1 },
            processesCompleted: {
              $sum: {
                $cond: [{ $eq: ['$status', PROCESS_STATUS.COMPLETED] }, 1, 0]
              }
            },
            avgPriority: { $avg: { $switch: {
              branches: [
                { case: { $eq: ['$priority', 'low'] }, then: 1 },
                { case: { $eq: ['$priority', 'medium'] }, then: 2 },
                { case: { $eq: ['$priority', 'high'] }, then: 3 },
                { case: { $eq: ['$priority', 'urgent'] }, then: 4 }
              ],
              default: 2
            }}}
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      // Category trends
      const categoryTrends = await ProcessInstance.aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'processtemplates',
            localField: 'processTemplateId',
            foreignField: '_id',
            as: 'template'
          }
        },
        { $unwind: '$template' },
        {
          $group: {
            _id: {
              period: dateGroup,
              category: '$template.category'
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.period',
            categories: {
              $push: {
                category: '$_id.category',
                count: '$count'
              }
            }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      res.json({
        status: 'success',
        data: {
          period,
          creationTrends,
          categoryTrends,
          summary: {
            totalDataPoints: creationTrends.length,
            totalProcesses: creationTrends.reduce((sum, item) => sum + item.processesCreated, 0),
            totalCompleted: creationTrends.reduce((sum, item) => sum + item.processesCompleted, 0)
          },
          filters: { period, dateFrom, dateTo },
          generatedAt: new Date()
        }
      });
    } catch (error) {
      logger.errorWithContext(error, { 
        controller: 'ReportController',
        method: 'getProcessTrendsReport' 
      });
      throw new AppError('Failed to generate process trends report', 500);
    }
  }

  // Export report
  async exportReport(req, res) {
    try {
      const { reportType } = req.params;
      const { format = 'csv' } = req.query;

      // Map report types to methods
      const reportMethods = {
        'dashboard': 'getDashboardStats',
        'process-performance': 'getProcessPerformanceReport',
        'user-workload': 'getUserWorkloadReport',
        'sla-compliance': 'getSLAComplianceReport',
        'process-trends': 'getProcessTrendsReport'
      };

      if (!reportMethods[reportType]) {
        throw new AppError('Invalid report type', 400);
      }

      // Generate the report data (you would implement actual export logic here)
      const reportData = await this[reportMethods[reportType]](req, { json: () => {} });

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${reportType}-${formatDate(new Date(), 'YYYY-MM-DD')}.csv`);
        res.send('CSV export functionality would be implemented here');
      } else if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${reportType}-${formatDate(new Date(), 'YYYY-MM-DD')}.pdf`);
        res.send('PDF export functionality would be implemented here');
      } else {
        throw new AppError('Invalid export format', 400);
      }
    } catch (error) {
      logger.errorWithContext(error, { 
        controller: 'ReportController',
        method: 'exportReport' 
      });
      throw new AppError('Failed to export report', 500);
    }
  }

  // Generate custom report
  async generateCustomReport(req, res) {
    try {
      const { reportName, filters, groupBy, metrics, dateRange } = req.body;

      // This is a simplified implementation
      // In a real application, you would build dynamic aggregation pipelines
      const query = {};
      
      if (dateRange) {
        query.createdAt = {};
        if (dateRange.from) query.createdAt.$gte = new Date(dateRange.from);
        if (dateRange.to) query.createdAt.$lte = new Date(dateRange.to);
      }

      // Apply custom filters
      if (filters) {
        Object.assign(query, filters);
      }

      const customData = await ProcessInstance.find(query)
        .populate('processTemplateId', 'name category')
        .populate('initiatedBy', 'username profile')
        .limit(1000); // Limit for performance

      res.json({
        status: 'success',
        data: {
          reportName,
          recordCount: customData.length,
          data: customData,
          parameters: { filters, groupBy, metrics, dateRange },
          generatedAt: new Date()
        }
      });
    } catch (error) {
      logger.errorWithContext(error, { 
        controller: 'ReportController',
        method: 'generateCustomReport' 
      });
      throw new AppError('Failed to generate custom report', 500);
    }
  }
}

export default new ReportController();