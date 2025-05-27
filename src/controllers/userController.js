import User from '../models/User.js';
import ProcessInstance from '../models/ProcessInstance.js';
import StepInstance from '../models/StepInstance.js';
import ProcessHistory from '../models/ProcessHistory.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';
import { PAGINATION } from '../utils/constants.js';

class UserController {
  // Get all users with pagination and filtering
  async getUsers(req, res, next) {
    try {
      const {
        page = PAGINATION.DEFAULT_PAGE,
        limit = PAGINATION.DEFAULT_LIMIT,
        search,
        role,
        department,
        isActive,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = {};
      
      if (search) {
        query.$or = [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { 'profile.firstName': { $regex: search, $options: 'i' } },
          { 'profile.lastName': { $regex: search, $options: 'i' } }
        ];
      }
      
      if (role) query.role = role;
      if (department) query['profile.department'] = department;
      if (isActive !== undefined) query.isActive = isActive;

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const [users, total] = await Promise.all([
        User.find(query)
          .select('-refreshToken')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(query)
      ]);

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      };

      res.json({
        status: 'success',
        data: {
          users,
          pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get user by ID
  async getUserById(req, res, next) {
    try {
      const { id } = req.params;

      // Check if user can access this profile
      if (req.user.role === 'user' && req.user._id.toString() !== id) {
        throw new AppError('You can only access your own profile', 403);
      }

      const user = await User.findById(id)
        .select('-refreshToken')
        .lean();

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Get additional stats for managers/admins
      if (req.user.role !== 'user') {
        const [processCount, taskCount] = await Promise.all([
          ProcessInstance.countDocuments({ initiatedBy: id }),
          StepInstance.countDocuments({ assignedTo: id })
        ]);

        user.stats = {
          processesInitiated: processCount,
          tasksAssigned: taskCount
        };
      }

      res.json({
        status: 'success',
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  }

  // Create new user (Admin only)
  async createUser(req, res, next) {
    try {
      const userData = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { email: userData.email },
          { username: userData.username }
        ]
      });

      if (existingUser) {
        if (existingUser.email === userData.email) {
          throw new AppError('Email already registered', 400);
        }
        throw new AppError('Username already taken', 400);
      }

      // Create user
      const user = new User(userData);
      await user.save();

      // Log the creation
      await ProcessHistory.create({
        action: 'user_created',
        performedBy: req.user._id,
        metadata: {
          createdUserId: user._id,
          userEmail: user.email,
          userRole: user.role
        }
      });

      logger.info(`User created by ${req.user.email}: ${user.email}`);

      res.status(201).json({
        status: 'success',
        message: 'User created successfully',
        data: { user: user.toJSON() }
      });
    } catch (error) {
      next(error);
    }
  }

  // Update user
  async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Check permissions
      const canEdit = req.user.role === 'admin' || 
                     (req.user.role === 'manager' && req.user._id.toString() !== id) ||
                     req.user._id.toString() === id;

      if (!canEdit) {
        throw new AppError('Insufficient permissions to update this user', 403);
      }

      // Users can't change their own role
      if (req.user._id.toString() === id && updateData.role) {
        throw new AppError('You cannot change your own role', 403);
      }

      // Only admins can assign admin role
      if (updateData.role === 'admin' && req.user.role !== 'admin') {
        throw new AppError('Only admins can assign admin role', 403);
      }

      const user = await User.findById(id);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Check for email/username conflicts
      if (updateData.email || updateData.username) {
        const conflictQuery = {
          _id: { $ne: id },
          $or: []
        };

        if (updateData.email) {
          conflictQuery.$or.push({ email: updateData.email });
        }
        if (updateData.username) {
          conflictQuery.$or.push({ username: updateData.username });
        }

        const conflictUser = await User.findOne(conflictQuery);
        if (conflictUser) {
          if (conflictUser.email === updateData.email) {
            throw new AppError('Email already in use', 400);
          }
          throw new AppError('Username already taken', 400);
        }
      }

      // Update user
      Object.assign(user, updateData);
      await user.save();

      logger.info(`User updated by ${req.user.email}: ${user.email}`);

      res.json({
        status: 'success',
        message: 'User updated successfully',
        data: { user: user.toJSON() }
      });
    } catch (error) {
      next(error);
    }
  }

  // Update user profile
  async updateProfile(req, res, next) {
    try {
      const { id } = req.params;
      const profileData = req.body;

      // Check permissions
      const canEdit = req.user.role === 'admin' || 
                     req.user.role === 'manager' ||
                     req.user._id.toString() === id;

      if (!canEdit) {
        throw new AppError('Insufficient permissions to update this profile', 403);
      }

      const user = await User.findById(id);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Update profile
      Object.assign(user.profile, profileData);
      await user.save();

      logger.info(`Profile updated for user: ${user.email}`);

      res.json({
        status: 'success',
        message: 'Profile updated successfully',
        data: { user: user.toJSON() }
      });
    } catch (error) {
      next(error);
    }
  }

  // Change user status (Admin only)
  async changeUserStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { isActive, reason } = req.body;

      // Prevent self-deactivation
      if (req.user._id.toString() === id && !isActive) {
        throw new AppError('You cannot deactivate your own account', 403);
      }

      const user = await User.findById(id);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      const oldStatus = user.isActive;
      user.isActive = isActive;
      await user.save();

      // Log the status change
      await ProcessHistory.create({
        action: isActive ? 'user_activated' : 'user_deactivated',
        performedBy: req.user._id,
        metadata: {
          targetUserId: user._id,
          userEmail: user.email,
          reason,
          oldStatus,
          newStatus: isActive
        }
      });

      logger.info(`User ${isActive ? 'activated' : 'deactivated'} by ${req.user.email}: ${user.email}`);

      res.json({
        status: 'success',
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { user: user.toJSON() }
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete user (Admin only)
  async deleteUser(req, res, next) {
    try {
      const { id } = req.params;

      // Prevent self-deletion
      if (req.user._id.toString() === id) {
        throw new AppError('You cannot delete your own account', 403);
      }

      const user = await User.findById(id);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Check if user has active processes or tasks
      const [activeProcesses, activeTasks] = await Promise.all([
        ProcessInstance.countDocuments({ 
          initiatedBy: id, 
          status: { $in: ['active', 'suspended'] } 
        }),
        StepInstance.countDocuments({ 
          assignedTo: id, 
          status: { $in: ['pending', 'in_progress'] } 
        })
      ]);

      if (activeProcesses > 0 || activeTasks > 0) {
        throw new AppError(
          `Cannot delete user with active processes (${activeProcesses}) or tasks (${activeTasks})`, 
          400
        );
      }

      // Soft delete by deactivating
      user.isActive = false;
      user.email = `deleted_${Date.now()}_${user.email}`;
      user.username = `deleted_${Date.now()}_${user.username}`;
      await user.save();

      logger.info(`User deleted by ${req.user.email}: ${user.email}`);

      res.json({
        status: 'success',
        message: 'User deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Get user's processes
  async getUserProcesses(req, res, next) {
    try {
      const { id } = req.params;
      const { 
        status, 
        page = PAGINATION.DEFAULT_PAGE, 
        limit = PAGINATION.DEFAULT_LIMIT 
      } = req.query;

      // Check permissions
      const canView = req.user.role === 'admin' || 
                     req.user.role === 'manager' ||
                     req.user._id.toString() === id;

      if (!canView) {
        throw new AppError('Insufficient permissions', 403);
      }

      // Build query
      const query = { initiatedBy: id };
      if (status) query.status = status;

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const [processes, total] = await Promise.all([
        ProcessInstance.find(query)
          .populate('processTemplateId', 'name category')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ProcessInstance.countDocuments(query)
      ]);

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      };

      res.json({
        status: 'success',
        data: {
          processes,
          pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get user's tasks
  async getUserTasks(req, res, next) {
    try {
      const { id } = req.params;
      const { 
        status, 
        overdue,
        page = PAGINATION.DEFAULT_PAGE, 
        limit = PAGINATION.DEFAULT_LIMIT 
      } = req.query;

      // Check permissions
      const canView = req.user.role === 'admin' || 
                     req.user.role === 'manager' ||
                     req.user._id.toString() === id;

      if (!canView) {
        throw new AppError('Insufficient permissions', 403);
      }

      // Build query
      const query = { assignedTo: id };
      if (status) query.status = status;
      if (overdue === 'true') {
        query.dueDate = { $lt: new Date() };
        query.status = { $in: ['pending', 'in_progress'] };
      }

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const [tasks, total] = await Promise.all([
        StepInstance.find(query)
          .populate('processInstanceId', 'name status priority')
          .sort({ dueDate: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        StepInstance.countDocuments(query)
      ]);

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      };

      res.json({
        status: 'success',
        data: {
          tasks,
          pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all departments
  async getDepartments(req, res, next) {
    try {
      const departments = await User.distinct('profile.department', {
        'profile.department': { $ne: null, $ne: '' }
      });

      res.json({
        status: 'success',
        data: { departments: departments.sort() }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get user statistics (Admin/Manager only)
  async getUserStats(req, res, next) {
    try {
      const [
        totalUsers,
        activeUsers,
        usersByRole,
        usersByDepartment,
        recentLogins
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        User.aggregate([
          { $group: { _id: '$role', count: { $sum: 1 } } }
        ]),
        User.aggregate([
          { 
            $match: { 
              'profile.department': { $ne: null, $ne: '' } 
            } 
          },
          { 
            $group: { 
              _id: '$profile.department', 
              count: { $sum: 1 } 
            } 
          }
        ]),
        User.countDocuments({
          lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]);

      // Format role stats
      const roleStats = {};
      usersByRole.forEach(item => {
        roleStats[item._id] = item.count;
      });

      // Format department stats
      const departmentStats = {};
      usersByDepartment.forEach(item => {
        departmentStats[item._id] = item.count;
      });

      res.json({
        status: 'success',
        data: {
          totalUsers,
          activeUsers,
          inactiveUsers: totalUsers - activeUsers,
          usersByRole: roleStats,
          usersByDepartment: departmentStats,
          recentLogins
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new UserController();