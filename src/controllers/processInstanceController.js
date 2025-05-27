import ProcessInstance from '../models/ProcessInstance.js';
import ProcessTemplate from '../models/ProcessTemplate.js';
import StepInstance from '../models/StepInstance.js';
import ProcessHistory from '../models/ProcessHistory.js';
import Notification from '../models/Notification.js';
import workflowEngine from '../services/workflowEngine.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';
import { PAGINATION, PROCESS_STATUS } from '../utils/constants.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure upload directory exists
const uploadDir = 'uploads/processes/';
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

class ProcessInstanceController {
  // Get all process instances with pagination and filtering
  async getProcessInstances(req, res, next) {
    try {
      const {
        page = PAGINATION.DEFAULT_PAGE,
        limit = PAGINATION.DEFAULT_LIMIT,
        search,
        status,
        priority,
        initiatedBy,
        processTemplateId,
        overdue,
        tags,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = {};
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (initiatedBy) query.initiatedBy = initiatedBy;
      if (processTemplateId) query.processTemplateId = processTemplateId;
      
      if (overdue === 'true') {
        query.dueDate = { $lt: new Date() };
        query.status = { $in: ['active', 'suspended'] };
      }
      
      if (tags) {
        query.tags = { $in: tags.split(',').map(tag => tag.trim()) };
      }

      // Filter based on user role and permissions
      if (req.user.role === 'user') {
        query.$or = [
          { initiatedBy: req.user._id },
          { 'currentSteps': { $exists: true } } // User can see processes where they might have tasks
        ];
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const [instances, total] = await Promise.all([
        ProcessInstance.find(query)
          .populate('processTemplateId', 'name category version')
          .populate('initiatedBy', 'username profile.firstName profile.lastName')
          .sort(sort)
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
          instances,
          pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get process instance by ID
  async getProcessInstanceById(req, res, next) {
    try {
      const { id } = req.params;

      const instance = await ProcessInstance.findById(id)
        .populate('processTemplateId')
        .populate('initiatedBy', 'username profile.firstName profile.lastName');

      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      // Check access permissions
      const canView = req.user.role === 'admin' || 
                     req.user.role === 'manager' ||
                     instance.initiatedBy._id.equals(req.user._id);

      if (!canView) {
        // Check if user has any tasks in this process
        const userTasks = await StepInstance.countDocuments({
          processInstanceId: id,
          assignedTo: req.user._id
        });

        if (userTasks === 0) {
          throw new AppError('Access denied to this process instance', 403);
        }
      }

      // Get current active steps
      const activeSteps = await StepInstance.find({
        processInstanceId: id,
        status: { $in: ['pending', 'in_progress'] }
      }).populate('assignedTo', 'username profile.firstName profile.lastName');

      const result = instance.toObject();
      result.activeSteps = activeSteps;

      res.json({
        status: 'success',
        data: { instance: result }
      });
    } catch (error) {
      next(error);
    }
  }

  // Create and optionally start new process instance
  async createProcessInstance(req, res, next) {
    try {
      const { processTemplateId, autoStart, ...instanceData } = req.body;

      // Check if template exists and is published
      const template = await ProcessTemplate.findById(processTemplateId);
      if (!template) {
        throw new AppError('Process template not found', 404);
      }

      if (!template.isPublished && req.user.role === 'user') {
        throw new AppError('Cannot create instance from unpublished template', 403);
      }

      // Create process instance
      const instance = new ProcessInstance({
        ...instanceData,
        processTemplateId,
        initiatedBy: req.user._id
      });

      await instance.save();

      // Log creation
      await ProcessHistory.create({
        processInstanceId: instance._id,
        action: 'process_created',
        performedBy: req.user._id,
        toStatus: 'draft',
        metadata: {
          templateName: template.name,
          templateVersion: template.version
        }
      });

      // Auto-start if requested
      if (autoStart) {
        await workflowEngine.startProcess(instance._id, req.user._id);
        await instance.reload();
      }

      await instance.populate('processTemplateId', 'name category version');
      await instance.populate('initiatedBy', 'username profile.firstName profile.lastName');

      logger.info(`Process instance created by ${req.user.email}: ${instance.name}`);

      res.status(201).json({
        status: 'success',
        message: 'Process instance created successfully',
        data: { instance }
      });
    } catch (error) {
      next(error);
    }
  }

  // Update process instance
  async updateProcessInstance(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const instance = await ProcessInstance.findById(id);
      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      // Check permissions
      const canEdit = req.user.role === 'admin' || 
                     req.user.role === 'manager' ||
                     instance.initiatedBy.equals(req.user._id);

      if (!canEdit) {
        throw new AppError('Insufficient permissions to update this process instance', 403);
      }

      // Cannot edit completed or cancelled processes
      if (['completed', 'cancelled'].includes(instance.status)) {
        throw new AppError('Cannot update completed or cancelled process', 400);
      }

      Object.assign(instance, updateData);
      await instance.save();

      // Log update
      await ProcessHistory.create({
        processInstanceId: instance._id,
        action: 'process_updated',
        performedBy: req.user._id,
        metadata: { updatedFields: Object.keys(updateData) }
      });

      logger.info(`Process instance updated by ${req.user.email}: ${instance.name}`);

      res.json({
        status: 'success',
        message: 'Process instance updated successfully',
        data: { instance }
      });
    } catch (error) {
      next(error);
    }
  }

  // Start process instance
  async startProcess(req, res, next) {
    try {
      const { id } = req.params;

      const instance = await ProcessInstance.findById(id);
      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      // Check permissions
      const canStart = req.user.role === 'admin' || 
                      req.user.role === 'manager' ||
                      instance.initiatedBy.equals(req.user._id);

      if (!canStart) {
        throw new AppError('Insufficient permissions to start this process', 403);
      }

      if (instance.status !== 'draft') {
        throw new AppError('Process can only be started from draft status', 400);
      }

      await workflowEngine.startProcess(id, req.user._id);

      res.json({
        status: 'success',
        message: 'Process started successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Suspend process instance
  async suspendProcess(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const instance = await ProcessInstance.findById(id);
      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      if (instance.status !== 'active') {
        throw new AppError('Only active processes can be suspended', 400);
      }

      instance.status = 'suspended';
      await instance.save();

      // Log suspension
      await ProcessHistory.create({
        processInstanceId: instance._id,
        action: 'process_suspended',
        performedBy: req.user._id,
        fromStatus: 'active',
        toStatus: 'suspended',
        comments: reason,
        metadata: { reason }
      });

      logger.info(`Process suspended by ${req.user.email}: ${instance.name}`);

      res.json({
        status: 'success',
        message: 'Process suspended successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Resume process instance
  async resumeProcess(req, res, next) {
    try {
      const { id } = req.params;

      const instance = await ProcessInstance.findById(id);
      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      if (instance.status !== 'suspended') {
        throw new AppError('Only suspended processes can be resumed', 400);
      }

      instance.status = 'active';
      await instance.save();

      // Log resumption
      await ProcessHistory.create({
        processInstanceId: instance._id,
        action: 'process_resumed',
        performedBy: req.user._id,
        fromStatus: 'suspended',
        toStatus: 'active'
      });

      logger.info(`Process resumed by ${req.user.email}: ${instance.name}`);

      res.json({
        status: 'success',
        message: 'Process resumed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Cancel process instance
  async cancelProcess(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const instance = await ProcessInstance.findById(id);
      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      // Check permissions
      const canCancel = req.user.role === 'admin' || 
                       req.user.role === 'manager' ||
                       instance.initiatedBy.equals(req.user._id);

      if (!canCancel) {
        throw new AppError('Insufficient permissions to cancel this process', 403);
      }

      if (['completed', 'cancelled'].includes(instance.status)) {
        throw new AppError('Process is already completed or cancelled', 400);
      }

      const oldStatus = instance.status;
      instance.status = 'cancelled';
      instance.endDate = new Date();
      await instance.save();

      // Cancel all pending/in-progress steps
      await StepInstance.updateMany(
        {
          processInstanceId: id,
          status: { $in: ['pending', 'in_progress'] }
        },
        {
          status: 'cancelled',
          endDate: new Date()
        }
      );

      // Log cancellation
      await ProcessHistory.create({
        processInstanceId: instance._id,
        action: 'process_cancelled',
        performedBy: req.user._id,
        fromStatus: oldStatus,
        toStatus: 'cancelled',
        comments: reason,
        metadata: { reason }
      });

      // Notify relevant users
      await this.notifyProcessCancellation(instance, req.user._id, reason);

      logger.info(`Process cancelled by ${req.user.email}: ${instance.name}`);

      res.json({
        status: 'success',
        message: 'Process cancelled successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Get process history
  async getProcessHistory(req, res, next) {
    try {
      const { id } = req.params;
      const { 
        page = PAGINATION.DEFAULT_PAGE, 
        limit = 50 
      } = req.query;

      const instance = await ProcessInstance.findById(id);
      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      // Check access permissions
      const canView = req.user.role === 'admin' || 
                     req.user.role === 'manager' ||
                     instance.initiatedBy.equals(req.user._id);

      if (!canView) {
        throw new AppError('Access denied', 403);
      }

      const skip = (page - 1) * limit;
      const [history, total] = await Promise.all([
        ProcessHistory.find({ processInstanceId: id })
          .populate('performedBy', 'username profile.firstName profile.lastName')
          .populate('stepInstanceId', 'name stepId')
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ProcessHistory.countDocuments({ processInstanceId: id })
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
          history,
          pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get current steps
  async getCurrentSteps(req, res, next) {
    try {
      const { id } = req.params;

      const instance = await ProcessInstance.findById(id);
      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      const currentSteps = await StepInstance.find({
        processInstanceId: id,
        status: { $in: ['pending', 'in_progress'] }
      }).populate('assignedTo', 'username profile.firstName profile.lastName');

      res.json({
        status: 'success',
        data: { currentSteps }
      });
    } catch (error) {
      next(error);
    }
  }

  // Update process variables
  async updateVariables(req, res, next) {
    try {
      const { id } = req.params;
      const { variables, merge = true } = req.body;

      const instance = await ProcessInstance.findById(id);
      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      // Check permissions
      const canUpdate = req.user.role === 'admin' || 
                       req.user.role === 'manager' ||
                       instance.initiatedBy.equals(req.user._id);

      if (!canUpdate) {
        throw new AppError('Insufficient permissions to update variables', 403);
      }

      if (merge) {
        instance.variables = { ...instance.variables, ...variables };
      } else {
        instance.variables = variables;
      }

      await instance.save();

      // Log variable update
      await ProcessHistory.create({
        processInstanceId: instance._id,
        action: 'variable_updated',
        performedBy: req.user._id,
        metadata: { 
          updatedVariables: Object.keys(variables),
          merge 
        }
      });

      res.json({
        status: 'success',
        message: 'Variables updated successfully',
        data: { variables: instance.variables }
      });
    } catch (error) {
      next(error);
    }
  }

  // Add attachment to process
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

        const instance = await ProcessInstance.findById(id);
        if (!instance) {
          throw new AppError('Process instance not found', 404);
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

        instance.attachments.push(attachment);
        await instance.save();

        // Log attachment
        await ProcessHistory.create({
          processInstanceId: instance._id,
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

  // Get attachments
  async getAttachments(req, res, next) {
    try {
      const { id } = req.params;

      const instance = await ProcessInstance.findById(id)
        .populate('attachments.uploadedBy', 'username profile.firstName profile.lastName');

      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      res.json({
        status: 'success',
        data: { attachments: instance.attachments }
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete process instance
  async deleteProcessInstance(req, res, next) {
    try {
      const { id } = req.params;

      const instance = await ProcessInstance.findById(id);
      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      // Check permissions
      const canDelete = req.user.role === 'admin' || 
                       (req.user.role === 'manager' && 
                        ['draft', 'cancelled', 'completed'].includes(instance.status));

      if (!canDelete) {
        throw new AppError('Insufficient permissions to delete this process instance', 403);
      }

      if (instance.status === 'active') {
        throw new AppError('Cannot delete active process instance', 400);
      }

      // Delete related step instances and history
      await Promise.all([
        StepInstance.deleteMany({ processInstanceId: id }),
        ProcessHistory.deleteMany({ processInstanceId: id })
      ]);

      await ProcessInstance.findByIdAndDelete(id);

      logger.info(`Process instance deleted by ${req.user.email}: ${instance.name}`);

      res.json({
        status: 'success',
        message: 'Process instance deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Helper method to notify process cancellation
  async notifyProcessCancellation(instance, userId, reason) {
    try {
      // Get all users involved in the process
      const involvedUsers = await StepInstance.distinct('assignedTo', {
        processInstanceId: instance._id,
        assignedTo: { $ne: null }
      });

      // Add process initiator if not already included
      if (!involvedUsers.includes(instance.initiatedBy.toString())) {
        involvedUsers.push(instance.initiatedBy);
      }

      // Create notifications for all involved users
      const notifications = involvedUsers.map(userIdStr => ({
        userId: userIdStr,
        type: 'process_cancelled',
        title: 'Process Cancelled',
        message: `Process "${instance.name}" has been cancelled. ${reason ? `Reason: ${reason}` : ''}`,
        relatedProcess: instance._id,
        priority: 'medium'
      }));

      await Notification.insertMany(notifications);
    } catch (error) {
      logger.error('Error sending process cancellation notifications:', error);
    }
  }
}

export default new ProcessInstanceController();