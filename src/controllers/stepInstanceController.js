import StepInstance from '../models/StepInstance.js';
import ProcessInstance from '../models/ProcessInstance.js';
import ProcessTemplate from '../models/ProcessTemplate.js';
import ProcessHistory from '../models/ProcessHistory.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import workflowEngine from '../services/workflowEngine.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';
import { PAGINATION, STEP_STATUS } from '../utils/constants.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure upload directory exists
const uploadDir = 'uploads/steps/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new AppError('Invalid file type', 400));
    }
  }
});

class StepInstanceController {
  // Get step instances with pagination and filtering
  async getStepInstances(req, res, next) {
    try {
      const {
        page = PAGINATION.DEFAULT_PAGE,
        limit = PAGINATION.DEFAULT_LIMIT,
        status,
        assignedTo,
        assignedRole,
        assignedDepartment,
        processInstanceId,
        overdue,
        escalated,
        type,
        sortBy = 'dueDate',
        sortOrder = 'asc'
      } = req.query;

      // Build query
      const query = {};
      
      if (status) query.status = status;
      if (assignedTo) query.assignedTo = assignedTo;
      if (assignedRole) query.assignedRole = assignedRole;
      if (assignedDepartment) query.assignedDepartment = assignedDepartment;
      if (processInstanceId) query.processInstanceId = processInstanceId;
      if (type) query.type = type;
      
      if (overdue === 'true') {
        query.dueDate = { $lt: new Date() };
        query.status = { $in: ['pending', 'in_progress'] };
      }
      
      if (escalated === 'true') {
        query.escalated = true;
      }

      // Filter based on user role and permissions
      if (req.user.role === 'user') {
        query.$or = [
          { assignedTo: req.user._id },
          { assignedRole: req.user.role },
          { assignedDepartment: req.user.profile.department }
        ];
      } else if (req.user.role === 'manager') {
        // Managers can see tasks in their department
        const departmentUsers = await User.find({
          'profile.department': req.user.profile.department
        }).select('_id');
        
        const userIds = departmentUsers.map(u => u._id);
        query.$or = [
          { assignedTo: { $in: userIds } },
          { assignedDepartment: req.user.profile.department }
        ];
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const [steps, total] = await Promise.all([
        StepInstance.find(query)
          .populate('processInstanceId', 'name status priority')
          .populate('assignedTo', 'username profile.firstName profile.lastName')
          .sort(sort)
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
          steps,
          pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get step instance by ID
  async getStepInstanceById(req, res, next) {
    try {
      const { id } = req.params;

      const step = await StepInstance.findById(id)
        .populate('processInstanceId')
        .populate('assignedTo', 'username profile.firstName profile.lastName')
        .populate('completedBy', 'username profile.firstName profile.lastName')
        .populate('comments.userId', 'username profile.firstName profile.lastName');

      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      // Check access permissions
      const canView = req.user.role === 'admin' || 
                     req.user.role === 'manager' ||
                     (step.assignedTo && step.assignedTo._id.equals(req.user._id)) ||
                     step.processInstanceId.initiatedBy.equals(req.user._id);

      if (!canView) {
        throw new AppError('Access denied to this step instance', 403);
      }

      res.json({
        status: 'success',
        data: { step }
      });
    } catch (error) {
      next(error);
    }
  }

  // Complete step instance
  async completeStep(req, res, next) {
    try {
      const { id } = req.params;
      const { formData, comment, decision, variables } = req.body;

      const step = await StepInstance.findById(id)
        .populate('processInstanceId');

      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      // Check if user can complete this step
      if (!step.canComplete(req.user._id)) {
        throw new AppError('You are not authorized to complete this step', 403);
      }

      // Use workflow engine to complete the step
      await workflowEngine.completeStep(id, req.user._id, formData, decision);

      // Add comment if provided
      if (comment) {
        await step.addComment(req.user._id, comment);
      }

      logger.info(`Step completed by ${req.user.email}: ${step.name} (${step._id})`);

      res.json({
        status: 'success',
        message: 'Step completed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Assign step to user
  async assignStep(req, res, next) {
    try {
      const { id } = req.params;
      const { assignedTo, assignedRole, assignedDepartment, comment, dueDate } = req.body;

      const step = await StepInstance.findById(id);
      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      if (step.status !== 'pending') {
        throw new AppError('Only pending steps can be assigned', 400);
      }

      // Validate assignee
      if (assignedTo) {
        const user = await User.findById(assignedTo);
        if (!user || !user.isActive) {
          throw new AppError('Invalid or inactive user', 400);
        }
      }

      const oldAssignee = step.assignedTo;
      
      // Update assignment
      step.assignedTo = assignedTo || null;
      step.assignedRole = assignedRole || null;
      step.assignedDepartment = assignedDepartment || null;
      
      if (dueDate) {
        step.dueDate = new Date(dueDate);
      }

      await step.save();

      // Log assignment
      await ProcessHistory.create({
        processInstanceId: step.processInstanceId,
        stepInstanceId: step._id,
        action: 'step_assigned',
        performedBy: req.user._id,
        metadata: {
          oldAssignee,
          newAssignee: assignedTo,
          assignedRole,
          assignedDepartment
        },
        comments: comment
      });

      // Send notification to new assignee
      if (assignedTo) {
        await Notification.create({
          userId: assignedTo,
          type: 'task_assigned',
          title: 'New Task Assigned',
          message: `You have been assigned a new task: ${step.name}`,
          relatedProcess: step.processInstanceId,
          relatedStep: step._id,
          priority: 'medium'
        });
      }

      logger.info(`Step assigned by ${req.user.email}: ${step.name} to ${assignedTo}`);

      res.json({
        status: 'success',
        message: 'Step assigned successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Reassign step to different user
  async reassignStep(req, res, next) {
    try {
      const { id } = req.params;
      const { assignedTo, reason } = req.body;

      const step = await StepInstance.findById(id);
      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      if (!['pending', 'in_progress'].includes(step.status)) {
        throw new AppError('Only pending or in-progress steps can be reassigned', 400);
      }

      // Validate new assignee
      const newAssignee = await User.findById(assignedTo);
      if (!newAssignee || !newAssignee.isActive) {
        throw new AppError('Invalid or inactive user', 400);
      }

      const oldAssignee = step.assignedTo;
      
      // Update assignment
      step.assignedTo = assignedTo;
      step.assignedRole = null;
      step.assignedDepartment = null;
      
      // Reset to pending if it was in progress
      if (step.status === 'in_progress') {
        step.status = 'pending';
        step.startDate = null;
      }

      await step.save();

      // Log reassignment
      await ProcessHistory.create({
        processInstanceId: step.processInstanceId,
        stepInstanceId: step._id,
        action: 'step_reassigned',
        performedBy: req.user._id,
        metadata: {
          oldAssignee,
          newAssignee: assignedTo,
          reason
        },
        comments: reason
      });

      // Send notifications
      const notifications = [];
      
      // Notify new assignee
      notifications.push({
        userId: assignedTo,
        type: 'task_assigned',
        title: 'Task Reassigned to You',
        message: `Task "${step.name}" has been reassigned to you. ${reason ? `Reason: ${reason}` : ''}`,
        relatedProcess: step.processInstanceId,
        relatedStep: step._id,
        priority: 'medium'
      });

      // Notify old assignee if exists
      if (oldAssignee) {
        notifications.push({
          userId: oldAssignee,
          type: 'task_reassigned',
          title: 'Task Reassigned',
          message: `Task "${step.name}" has been reassigned to another user. ${reason ? `Reason: ${reason}` : ''}`,
          relatedProcess: step.processInstanceId,
          relatedStep: step._id,
          priority: 'medium'
        });
      }

      await Notification.insertMany(notifications);

      logger.info(`Step reassigned by ${req.user.email}: ${step.name} from ${oldAssignee} to ${assignedTo}`);

      res.json({
        status: 'success',
        message: 'Step reassigned successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Escalate step instance
  async escalateStep(req, res, next) {
    try {
      const { id } = req.params;
      const { escalateTo, reason } = req.body;

      const step = await StepInstance.findById(id);
      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      if (!['pending', 'in_progress'].includes(step.status)) {
        throw new AppError('Only pending or in-progress steps can be escalated', 400);
      }

      // Validate escalation target
      const escalationTarget = await User.findById(escalateTo);
      if (!escalationTarget || !escalationTarget.isActive) {
        throw new AppError('Invalid escalation target', 400);
      }

      // Update step
      step.escalated = true;
      step.escalationLevel += 1;
      step.escalationHistory.push({
        level: step.escalationLevel,
        escalatedTo: escalateTo,
        escalatedAt: new Date(),
        reason
      });

      await step.save();

      // Log escalation
      await ProcessHistory.create({
        processInstanceId: step.processInstanceId,
        stepInstanceId: step._id,
        action: 'step_escalated',
        performedBy: req.user._id,
        metadata: {
          escalatedTo,
          escalationLevel: step.escalationLevel,
          reason
        },
        comments: reason
      });

      // Send notification to escalation target
      await Notification.create({
        userId: escalateTo,
        type: 'task_escalated',
        title: 'Task Escalated to You',
        message: `Task "${step.name}" has been escalated to you. ${reason ? `Reason: ${reason}` : ''}`,
        relatedProcess: step.processInstanceId,
        relatedStep: step._id,
        priority: 'high'
      });

      logger.info(`Step escalated by ${req.user.email}: ${step.name} to ${escalateTo}`);

      res.json({
        status: 'success',
        message: 'Step escalated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Start working on step instance
  async startStep(req, res, next) {
    try {
      const { id } = req.params;

      const step = await StepInstance.findById(id);
      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      // Check if user can start this step
      if (step.assignedTo && !step.assignedTo.equals(req.user._id)) {
        throw new AppError('You are not assigned to this step', 403);
      }

      if (step.status !== 'pending') {
        throw new AppError('Only pending steps can be started', 400);
      }

      // Update step status
      step.status = 'in_progress';
      step.startDate = new Date();
      
      // Assign to current user if not already assigned
      if (!step.assignedTo) {
        step.assignedTo = req.user._id;
      }

      await step.save();

      // Log step start
      await ProcessHistory.create({
        processInstanceId: step.processInstanceId,
        stepInstanceId: step._id,
        action: 'step_started',
        performedBy: req.user._id,
        fromStatus: 'pending',
        toStatus: 'in_progress'
      });

      logger.info(`Step started by ${req.user.email}: ${step.name}`);

      res.json({
        status: 'success',
        message: 'Step started successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Skip step instance
  async skipStep(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const step = await StepInstance.findById(id);
      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      if (!['pending', 'in_progress'].includes(step.status)) {
        throw new AppError('Only pending or in-progress steps can be skipped', 400);
      }

      // Update step status
      step.status = 'skipped';
      step.endDate = new Date();

      await step.save();

      // Log skip
      await ProcessHistory.create({
        processInstanceId: step.processInstanceId,
        stepInstanceId: step._id,
        action: 'step_skipped',
        performedBy: req.user._id,
        fromStatus: step.status,
        toStatus: 'skipped',
        comments: reason,
        metadata: { reason }
      });

      // Continue workflow
      await workflowEngine.processStepCompletion(step, req.user._id);

      logger.info(`Step skipped by ${req.user.email}: ${step.name}`);

      res.json({
        status: 'success',
        message: 'Step skipped successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Add comment to step instance
  async addComment(req, res, next) {
    try {
      const { id } = req.params;
      const { comment, isInternal } = req.body;

      const step = await StepInstance.findById(id);
      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      await step.addComment(req.user._id, comment, isInternal);

      // Log comment addition
      await ProcessHistory.create({
        processInstanceId: step.processInstanceId,
        stepInstanceId: step._id,
        action: 'comment_added',
        performedBy: req.user._id,
        metadata: { isInternal }
      });

      // Send notification if not internal comment
      if (!isInternal && step.assignedTo && !step.assignedTo.equals(req.user._id)) {
        await Notification.create({
          userId: step.assignedTo,
          type: 'comment_added',
          title: 'New Comment on Task',
          message: `A new comment has been added to task "${step.name}"`,
          relatedProcess: step.processInstanceId,
          relatedStep: step._id,
          priority: 'low'
        });
      }

      res.status(201).json({
        status: 'success',
        message: 'Comment added successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Get step instance comments
  async getComments(req, res, next) {
    try {
      const { id } = req.params;
      const { includeInternal } = req.query;

      const step = await StepInstance.findById(id)
        .populate('comments.userId', 'username profile.firstName profile.lastName');

      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      let comments = step.comments;

      // Filter internal comments for non-admin/manager users
      if (includeInternal !== 'true' || req.user.role === 'user') {
        comments = comments.filter(comment => !comment.isInternal);
      }

      res.json({
        status: 'success',
        data: { comments }
      });
    } catch (error) {
      next(error);
    }
  }

  // Add attachment to step instance
  async addAttachment(req, res, next) {
    const uploadSingle = upload.single('file');
    
    uploadSingle(req, res, async (err) => {
      if (err) {
        return next(err);
      }

      try {
        const { id } = req.params;
        const { description } = req.body;

        if (!req.file) {
          throw new AppError('No file uploaded', 400);
        }

        const step = await StepInstance.findById(id);
        if (!step) {
          throw new AppError('Step instance not found', 404);
        }

        const attachment = {
          filename: req.file.filename,
          originalName: req.file.originalname,
          path: req.file.path,
          size: req.file.size,
          mimeType: req.file.mimetype,
          uploadedBy: req.user._id,
          uploadedAt: new Date(),
          description: description || ''
        };

        step.attachments.push(attachment);
        await step.save();

        // Log attachment
        await ProcessHistory.create({
          processInstanceId: step.processInstanceId,
          stepInstanceId: step._id,
          action: 'attachment_added',
          performedBy: req.user._id,
          metadata: {
            filename: req.file.originalname,
            size: req.file.size
          }
        });

        res.status(201).json({
          status: 'success',
          message: 'Attachment added successfully',
          data: { attachment }
        });
      } catch (error) {
        next(error);
      }
    });
  }

  // Get step instance attachments
  async getAttachments(req, res, next) {
    try {
      const { id } = req.params;

      const step = await StepInstance.findById(id)
        .populate('attachments.uploadedBy', 'username profile.firstName profile.lastName');

      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      res.json({
        status: 'success',
        data: { attachments: step.attachments }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get current user's assigned tasks
  async getMyTasks(req, res, next) {
    try {
      const { 
        status, 
        overdue,
        page = PAGINATION.DEFAULT_PAGE, 
        limit = PAGINATION.DEFAULT_LIMIT 
      } = req.query;

      const query = { assignedTo: req.user._id };
      
      if (status) {
        query.status = status;
      } else {
        query.status = { $in: ['pending', 'in_progress'] };
      }

      if (overdue === 'true') {
        query.dueDate = { $lt: new Date() };
      }

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

  // Get available tasks for current user (by role/department)
  async getAvailableTasks(req, res, next) {
    try {
      const { 
        page = PAGINATION.DEFAULT_PAGE, 
        limit = PAGINATION.DEFAULT_LIMIT 
      } = req.query;

      const query = {
        status: 'pending',
        assignedTo: null,
        $or: [
          { assignedRole: req.user.role },
          { assignedDepartment: req.user.profile.department }
        ]
      };

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

  // Claim an available task
  async claimTask(req, res, next) {
    try {
      const { id } = req.params;

      const step = await StepInstance.findById(id);
      if (!step) {
        throw new AppError('Step instance not found', 404);
      }

      if (step.status !== 'pending') {
        throw new AppError('Only pending steps can be claimed', 400);
      }

      if (step.assignedTo) {
        throw new AppError('Step is already assigned', 400);
      }

      // Check if user can claim this task
      const canClaim = step.assignedRole === req.user.role || 
                      step.assignedDepartment === req.user.profile.department;

      if (!canClaim) {
        throw new AppError('You are not eligible to claim this task', 403);
      }

      // Assign to current user
      step.assignedTo = req.user._id;
      step.assignedRole = null;
      step.assignedDepartment = null;
      await step.save();

      // Log claim
      await ProcessHistory.create({
        processInstanceId: step.processInstanceId,
        stepInstanceId: step._id,
        action: 'step_assigned',
        performedBy: req.user._id,
        metadata: {
          claimed: true,
          newAssignee: req.user._id
        },
        comments: 'Task claimed by user'
      });

      logger.info(`Task claimed by ${req.user.email}: ${step.name}`);

      res.json({
        status: 'success',
        message: 'Task claimed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new StepInstanceController();