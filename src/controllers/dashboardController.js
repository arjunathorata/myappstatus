import ProcessInstance from '../models/ProcessInstance.js';
import StepInstance from '../models/StepInstance.js';
import ProcessHistory from '../models/ProcessHistory.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import ProcessTemplate from '../models/ProcessTemplate.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';

class DashboardController {
  // Get dashboard overview
  async getOverview(req, res, next) {
    try {
      const userId = req.user._id;
      const userRole = req.user.role;

      let processQuery = {};
      let taskQuery = {};

      // Filter data based on user role
      if (userRole === 'user') {
        processQuery = { initiatedBy: userId };
        taskQuery = { assignedTo: userId };
      } else if (userRole === 'manager') {
        // Managers see their department's data
        const departmentUsers = await User.find({
          'profile.department': req.user.profile.department
        }).select('_id');
        
        const userIds = departmentUsers.map(u => u._id);
        processQuery = { initiatedBy: { $in: userIds } };
        taskQuery = { assignedTo: { $in: userIds } };
      }
      // Admins see all data (no filter)

      const [
        totalProcesses,
        activeProcesses,
        completedProcesses,
        totalTasks,
        pendingTasks,
        inProgressTasks,
        overdueTasks,
        unreadNotifications,
        recentActivity
      ] = await Promise.all([
        ProcessInstance.countDocuments(processQuery),
        ProcessInstance.countDocuments({ ...processQuery, status: 'active' }),
        ProcessInstance.countDocuments({ ...processQuery, status: 'completed' }),
        StepInstance.countDocuments(taskQuery),
        StepInstance.countDocuments({ ...taskQuery, status: 'pending' }),
        StepInstance.countDocuments({ ...taskQuery, status: 'in_progress' }),
        StepInstance.countDocuments({
          ...taskQuery,
          status: { $in: ['pending', 'in_progress'] },
          dueDate: { $lt: new Date() }
        }),
        Notification.countDocuments({ userId, isRead: false }),
        this.getRecentActivityData(userRole === 'admin' ? {} : processQuery, 5)
      ]);

      const overview = {
        totalProcesses,
        activeProcesses,
        completedProcesses,
        totalTasks,
        pendingTasks,
        inProgressTasks,
        overdueTasks,
        unreadNotifications,
        recentActivity,
        processStatusDistribution: {
          draft: await ProcessInstance.countDocuments({ ...processQuery, status: 'draft' }),
          active: activeProcesses,
          completed: completedProcesses,
          cancelled: await ProcessInstance.countDocuments({ ...processQuery, status: 'cancelled' }),
          suspended: await ProcessInstance.countDocuments({ ...processQuery, status: 'suspended' })
        },
        taskStatusDistribution: {
          pending: pendingTasks,
          in_progress: inProgressTasks,
          completed: await StepInstance.countDocuments({ ...taskQuery, status: 'completed' }),
          overdue: overdueTasks
        }
      };

      res.json({
        status: 'success',
        data: overview
      });
    } catch (error) {
      next(error);
    }
  }

  // Get current user's tasks
  async getMyTasks(req, res, next) {
    try {
      const { status, limit = 10, overdue } = req.query;
      const userId = req.user._id;

      const query = { assignedTo: userId };
      
      if (status) {
        query.status = status;
      } else {
        query.status = { $in: ['pending', 'in_progress'] };
      }

      if (overdue === 'true') {
        query.dueDate = { $lt: new Date() };
      }

      const tasks = await StepInstance.find(query)
        .populate('processInstanceId', 'name status priority')
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(parseInt(limit))
        .lean();

      res.json({
        status: 'success',
        data: { tasks }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get current user's processes
  async getMyProcesses(req, res, next) {
    try {
      const { status, limit = 10 } = req.query;
      const userId = req.user._id;

      const query = { initiatedBy: userId };
      
      if (status) {
        query.status = status;
      }

      const processes = await ProcessInstance.find(query)
        .populate('processTemplateId', 'name category')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .lean();

      res.json({
        status: 'success',
        data: { processes }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get detailed statistics (Admin/Manager only)
  async getStatistics(req, res, next) {
    try {
      const [
        userStats,
        processStats,
        templateStats,
        performanceStats
      ] = await Promise.all([
        this.getUserStatistics(),
        this.getProcessStatistics(),
        this.getTemplateStatistics(),
        this.getPerformanceStatistics()
      ]);

      const statistics = {
        users: userStats,
        processes: processStats,
        templates: templateStats,
        performance: performanceStats
      };

      res.json({
        status: 'success',
        data: statistics
      });
    } catch (error) {
      next(error);
    }
  }

  // Get recent activity
  async getRecentActivity(req, res, next) {
    try {
      const { limit = 20, days = 7 } = req.query;
      const userId = req.user._id;
      const userRole = req.user.role;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      let query = { timestamp: { $gte: startDate } };

      // Filter based on user role
      if (userRole === 'user') {
        query.performedBy = userId;
      } else if (userRole === 'manager') {
        // Get department users
        const departmentUsers = await User.find({
          'profile.department': req.user.profile.department
        }).select('_id');
        
        const userIds = departmentUsers.map(u => u._id);
        query.performedBy = { $in: userIds };
      }

      const activities = await ProcessHistory.find(query)
        .populate('performedBy', 'username profile.firstName profile.lastName')
        .populate('processInstanceId', 'name')
        .populate('stepInstanceId', 'name')
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .lean();

      res.json({
        status: 'success',
        data: { activities }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get performance metrics
  async getPerformanceMetrics(req, res, next) {
    try {
      const { period = 'month' } = req.query;
      
      const periodMap = {
        day: 1,
        week: 7,
        month: 30,
        year: 365
      };

      const days = periodMap[period] || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [
        processMetrics,
        taskMetrics,
        userMetrics
      ] = await Promise.all([
        this.getProcessPerformanceMetrics(startDate),
        this.getTaskPerformanceMetrics(startDate),
        this.getUserPerformanceMetrics(startDate)
      ]);

      const metrics = {
        period,
        startDate,
        endDate: new Date(),
        processes: processMetrics,
        tasks: taskMetrics,
        users: userMetrics
      };

      res.json({
        status: 'success',
        data: metrics
      });
    } catch (error) {
      next(error);
    }
  }

  // Get workload distribution
  async getWorkloadDistribution(req, res, next) {
    try {
      const [
        tasksByUser,
        tasksByDepartment,
        processesByTemplate,
        overdueDistribution
      ] = await Promise.all([
        this.getTaskDistributionByUser(),
        this.getTaskDistributionByDepartment(),
        this.getProcessDistributionByTemplate(),
        this.getOverdueDistribution()
      ]);

      const workload = {
        tasksByUser,
        tasksByDepartment,
        processesByTemplate,
        overdueDistribution
      };

      res.json({
        status: 'success',
        data: workload
      });
    } catch (error) {
      next(error);
    }
  }

  // Helper methods
  async getRecentActivityData(query, limit) {
    return ProcessHistory.find(query)
      .populate('performedBy', 'username profile.firstName profile.lastName')
      .populate('processInstanceId', 'name')
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  }

  async getUserStatistics() {
    const [
      totalUsers,
      activeUsers,
      usersByRole,
      usersByDepartment
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      User.aggregate([
        { 
          $match: { 'profile.department': { $ne: null, $ne: '' } }
        },
        { 
          $group: { _id: '$profile.department', count: { $sum: 1 } }
        }
      ])
    ]);

    return {
      total: totalUsers,
      active: activeUsers,
      inactive: totalUsers - activeUsers,
      byRole: usersByRole.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byDepartment: usersByDepartment.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };
  }

  async getProcessStatistics() {
    const [
      totalProcesses,
      processesByStatus,
      processesByPriority,
      avgCompletionTime
    ] = await Promise.all([
      ProcessInstance.countDocuments(),
      ProcessInstance.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      ProcessInstance.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]),
      ProcessInstance.aggregate([
        {
          $match: {
            status: 'completed',
            startDate: { $ne: null },
            endDate: { $ne: null }
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
      ])
    ]);

    return {
      total: totalProcesses,
      byStatus: processesByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byPriority: processesByPriority.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      avgCompletionTime: avgCompletionTime[0]?.avgDuration || 0
    };
  }

  async getTemplateStatistics() {
    const [
      totalTemplates,
      publishedTemplates,
      templatesByCategory,
      mostUsedTemplates
    ] = await Promise.all([
      ProcessTemplate.countDocuments(),
      ProcessTemplate.countDocuments({ isPublished: true }),
      ProcessTemplate.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]),
      ProcessInstance.aggregate([
        {
          $group: {
            _id: '$processTemplateId',
            count: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'processtemplates',
            localField: '_id',
            foreignField: '_id',
            as: 'template'
          }
        },
        {
          $unwind: '$template'
        },
        {
          $project: {
            name: '$template.name',
            count: 1
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 5
        }
      ])
    ]);

    return {
      total: totalTemplates,
      published: publishedTemplates,
      draft: totalTemplates - publishedTemplates,
      byCategory: templatesByCategory.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      mostUsed: mostUsedTemplates
    };
  }

  async getPerformanceStatistics() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      processesCompleted,
      tasksCompleted,
      avgTaskCompletionTime
    ] = await Promise.all([
      ProcessInstance.countDocuments({
        status: 'completed',
        endDate: { $gte: thirtyDaysAgo }
      }),
      StepInstance.countDocuments({
        status: 'completed',
        endDate: { $gte: thirtyDaysAgo }
      }),
      StepInstance.aggregate([
        {
          $match: {
            status: 'completed',
            startDate: { $ne: null },
            endDate: { $ne: null },
            endDate: { $gte: thirtyDaysAgo }
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
      ])
    ]);

    return {
      processesCompleted,
      tasksCompleted,
      avgTaskCompletionTime: avgTaskCompletionTime[0]?.avgDuration || 0
    };
  }

  async getProcessPerformanceMetrics(startDate) {
    const [
      completed,
      created,
      avgDuration
    ] = await Promise.all([
      ProcessInstance.countDocuments({
        status: 'completed',
        endDate: { $gte: startDate }
      }),
      ProcessInstance.countDocuments({
        createdAt: { $gte: startDate }
      }),
      ProcessInstance.aggregate([
        {
          $match: {
            status: 'completed',
            startDate: { $ne: null },
            endDate: { $ne: null },
            endDate: { $gte: startDate }
          }
        },
        {
          $project: {
            duration: { $subtract: ['$endDate', '$startDate'] }
          }
        },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$duration' }
          }
        }
      ])
    ]);

    return {
      completed,
      created,
      completionRate: created > 0 ? (completed / created * 100).toFixed(2) : 0,
      avgDuration: avgDuration[0]?.avgDuration || 0
    };
  }

  async getTaskPerformanceMetrics(startDate) {
    const [
      completed,
      created,
      overdue
    ] = await Promise.all([
      StepInstance.countDocuments({
        status: 'completed',
        endDate: { $gte: startDate }
      }),
      StepInstance.countDocuments({
        createdAt: { $gte: startDate }
      }),
      StepInstance.countDocuments({
        createdAt: { $gte: startDate },
        dueDate: { $lt: new Date() },
        status: { $in: ['pending', 'in_progress'] }
      })
    ]);

    return {
      completed,
      created,
      overdue,
      completionRate: created > 0 ? (completed / created * 100).toFixed(2) : 0,
      overdueRate: created > 0 ? (overdue / created * 100).toFixed(2) : 0
    };
  }

  async getUserPerformanceMetrics(startDate) {
    const activeUsers = await User.countDocuments({
      lastLogin: { $gte: startDate }
    });

    const topPerformers = await StepInstance.aggregate([
      {
        $match: {
          status: 'completed',
          endDate: { $gte: startDate },
          assignedTo: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$assignedTo',
          tasksCompleted: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          name: {
            $concat: ['$user.profile.firstName', ' ', '$user.profile.lastName']
          },
          tasksCompleted: 1
        }
      },
      {
        $sort: { tasksCompleted: -1 }
      },
      {
        $limit: 5
      }
    ]);

    return {
      activeUsers,
      topPerformers
    };
  }

  async getTaskDistributionByUser() {
    return StepInstance.aggregate([
      {
        $match: {
          assignedTo: { $ne: null },
          status: { $in: ['pending', 'in_progress'] }
        }
      },
      {
        $group: {
          _id: '$assignedTo',
          pendingTasks: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
            }
          },
          inProgressTasks: {
            $sum: {
              $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          name: {
            $concat: ['$user.profile.firstName', ' ', '$user.profile.lastName']
          },
          department: '$user.profile.department',
          pendingTasks: 1,
          inProgressTasks: 1,
          totalTasks: { $add: ['$pendingTasks', '$inProgressTasks'] }
        }
      },
      {
        $sort: { totalTasks: -1 }
      }
    ]);
  }

  async getTaskDistributionByDepartment() {
    return User.aggregate([
      {
        $match: {
          'profile.department': { $ne: null, $ne: '' }
        }
      },
      {
        $lookup: {
          from: 'stepinstances',
          localField: '_id',
          foreignField: 'assignedTo',
          as: 'tasks'
        }
      },
      {
        $unwind: {
          path: '$tasks',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          'tasks.status': { $in: ['pending', 'in_progress'] }
        }
      },
      {
        $group: {
          _id: '$profile.department',
          taskCount: { $sum: 1 }
        }
      },
      {
        $sort: { taskCount: -1 }
      }
    ]);
  }

  async getProcessDistributionByTemplate() {
    return ProcessInstance.aggregate([
      {
        $group: {
          _id: '$processTemplateId',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'processtemplates',
          localField: '_id',
          foreignField: '_id',
          as: 'template'
        }
      },
      {
        $unwind: '$template'
      },
      {
        $project: {
          name: '$template.name',
          category: '$template.category',
          count: 1
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
  }

  async getOverdueDistribution() {
    return StepInstance.aggregate([
      {
        $match: {
          dueDate: { $lt: new Date() },
          status: { $in: ['pending', 'in_progress'] }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'assignedTo',
          foreignField: '_id',
          as: 'assignee'
        }
      },
      {
        $unwind: {
          path: '$assignee',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: '$assignee.profile.department',
          overdueCount: { $sum: 1 }
        }
      },
      {
        $sort: { overdueCount: -1 }
      }
    ]);
  }
}

export default new DashboardController();