import ProcessTemplate from '../models/ProcessTemplate.js';
import ProcessInstance from '../models/ProcessInstance.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';
import { PAGINATION } from '../utils/constants.js';

class ProcessTemplateController {
  // Get all process templates with pagination and filtering
  async getProcessTemplates(req, res, next) {
    try {
      const {
        page = PAGINATION.DEFAULT_PAGE,
        limit = PAGINATION.DEFAULT_LIMIT,
        search,
        category,
        isPublished,
        createdBy,
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
      
      if (category) query.category = category;
      if (isPublished !== undefined) query.isPublished = isPublished;
      if (createdBy) query.createdBy = createdBy;
      if (tags) {
        query.tags = { $in: tags.split(',').map(tag => tag.trim()) };
      }

      // Non-admin users can only see published templates or their own
      if (req.user.role === 'user') {
        query.$or = [
          { isPublished: true },
          { createdBy: req.user._id }
        ];
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const [templates, total] = await Promise.all([
        ProcessTemplate.find(query)
          .populate('createdBy', 'username profile.firstName profile.lastName')
          .populate('publishedBy', 'username profile.firstName profile.lastName')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        ProcessTemplate.countDocuments(query)
      ]);

      // Get instance counts for each template
      const templateIds = templates.map(template => template._id);
      const instanceCounts = await ProcessInstance.aggregate([
        { $match: { processTemplateId: { $in: templateIds } } },
        { $group: { _id: '$processTemplateId', count: { $sum: 1 } } }
      ]);

      const instanceCountMap = {};
      instanceCounts.forEach(item => {
        instanceCountMap[item._id.toString()] = item.count;
      });

      // Add instance counts to templates
      templates.forEach(template => {
        template.instanceCount = instanceCountMap[template._id.toString()] || 0;
      });

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      };

      res.json({
        status: 'success',
        data: {
          templates,
          pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get process template by ID
  async getProcessTemplateById(req, res, next) {
    try {
      const { id } = req.params;

      const template = await ProcessTemplate.findById(id)
        .populate('createdBy', 'username profile.firstName profile.lastName')
        .populate('publishedBy', 'username profile.firstName profile.lastName');

      if (!template) {
        throw new AppError('Process template not found', 404);
      }

      // Check access permissions
      if (req.user.role === 'user' && !template.isPublished && 
          !template.createdBy._id.equals(req.user._id)) {
        throw new AppError('Access denied to this template', 403);
      }

      // Get instance count
      const instanceCount = await ProcessInstance.countDocuments({ 
        processTemplateId: id 
      });

      const result = template.toObject();
      result.instanceCount = instanceCount;

      res.json({
        status: 'success',
        data: { template: result }
      });
    } catch (error) {
      next(error);
    }
  }

  // Create new process template
  async createProcessTemplate(req, res, next) {
    try {
      const templateData = {
        ...req.body,
        createdBy: req.user._id
      };

      // Validate step references
      this.validateStepReferences(templateData.steps, templateData.startStep, templateData.endSteps);

      const template = new ProcessTemplate(templateData);
      await template.save();

      await template.populate('createdBy', 'username profile.firstName profile.lastName');

      logger.info(`Process template created by ${req.user.email}: ${template.name}`);

      res.status(201).json({
        status: 'success',
        message: 'Process template created successfully',
        data: { template }
      });
    } catch (error) {
      next(error);
    }
  }

  // Update process template
  async updateProcessTemplate(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const template = await ProcessTemplate.findById(id);
      if (!template) {
        throw new AppError('Process template not found', 404);
      }

      // Check permissions
      const canEdit = req.user.role === 'admin' || 
                     template.createdBy.equals(req.user._id);

      if (!canEdit) {
        throw new AppError('Insufficient permissions to update this template', 403);
      }

      // Cannot edit published templates (create new version instead)
      if (template.isPublished) {
        throw new AppError('Cannot edit published template. Create a new version instead.', 400);
      }

      // Validate step references if steps are being updated
      if (updateData.steps || updateData.startStep || updateData.endSteps) {
        const steps = updateData.steps || template.steps;
        const startStep = updateData.startStep || template.startStep;
        const endSteps = updateData.endSteps || template.endSteps;
        
        this.validateStepReferences(steps, startStep, endSteps);
      }

      Object.assign(template, updateData);
      await template.save();

      await template.populate('createdBy', 'username profile.firstName profile.lastName');

      logger.info(`Process template updated by ${req.user.email}: ${template.name}`);

      res.json({
        status: 'success',
        message: 'Process template updated successfully',
        data: { template }
      });
    } catch (error) {
      next(error);
    }
  }

  // Publish process template
  async publishTemplate(req, res, next) {
    try {
      const { id } = req.params;
      const { version } = req.body;

      const template = await ProcessTemplate.findById(id);
      if (!template) {
        throw new AppError('Process template not found', 404);
      }

      // Check permissions
      const canPublish = req.user.role === 'admin' || 
                        (req.user.role === 'manager' && template.createdBy.equals(req.user._id));

      if (!canPublish) {
        throw new AppError('Insufficient permissions to publish this template', 403);
      }

      if (template.isPublished) {
        throw new AppError('Template is already published', 400);
      }

      // Validate template before publishing
      this.validateTemplateForPublishing(template);

      // Update version if provided
      if (version) {
        // Check if version already exists
        const existingVersion = await ProcessTemplate.findOne({
          name: template.name,
          version,
          _id: { $ne: id }
        });

        if (existingVersion) {
          throw new AppError('Version already exists', 400);
        }

        template.version = version;
      }

      template.isPublished = true;
      template.publishedBy = req.user._id;
      template.publishedAt = new Date();

      await template.save();

      logger.info(`Process template published by ${req.user.email}: ${template.name} v${template.version}`);

      res.json({
        status: 'success',
        message: 'Process template published successfully',
        data: { template }
      });
    } catch (error) {
      next(error);
    }
  }

  // Create new version of template
  async createNewVersion(req, res, next) {
    try {
      const { id } = req.params;
      const { version, changes } = req.body;

      const originalTemplate = await ProcessTemplate.findById(id);
      if (!originalTemplate) {
        throw new AppError('Process template not found', 404);
      }

      // Check permissions
      const canCreateVersion = req.user.role === 'admin' || 
                              originalTemplate.createdBy.equals(req.user._id);

      if (!canCreateVersion) {
        throw new AppError('Insufficient permissions', 403);
      }

      // Check if version already exists
      const existingVersion = await ProcessTemplate.findOne({
        name: originalTemplate.name,
        version
      });

      if (existingVersion) {
        throw new AppError('Version already exists', 400);
      }

      // Create new template version
      const newTemplate = new ProcessTemplate({
        ...originalTemplate.toObject(),
        _id: undefined,
        version,
        isPublished: false,
        publishedBy: undefined,
        publishedAt: undefined,
        createdBy: req.user._id,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await newTemplate.save();

      logger.info(`New template version created by ${req.user.email}: ${newTemplate.name} v${version}`);

      res.status(201).json({
        status: 'success',
        message: 'New template version created successfully',
        data: { template: newTemplate }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get template versions
  async getTemplateVersions(req, res, next) {
    try {
      const { id } = req.params;

      const template = await ProcessTemplate.findById(id);
      if (!template) {
        throw new AppError('Process template not found', 404);
      }

      const versions = await ProcessTemplate.find({ 
        name: template.name 
      })
      .populate('createdBy', 'username profile.firstName profile.lastName')
      .populate('publishedBy', 'username profile.firstName profile.lastName')
      .sort({ version: -1 })
      .lean();

      res.json({
        status: 'success',
        data: { versions }
      });
    } catch (error) {
      next(error);
    }
  }

  // Validate template
  async validateTemplate(req, res, next) {
    try {
      const { id } = req.params;

      const template = await ProcessTemplate.findById(id);
      if (!template) {
        throw new AppError('Process template not found', 404);
      }

      const validationResult = this.validateTemplateForPublishing(template);

      res.json({
        status: 'success',
        message: 'Template validation completed',
        data: { 
          isValid: validationResult.isValid,
          errors: validationResult.errors,
          warnings: validationResult.warnings
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get template instances
  async getTemplateInstances(req, res, next) {
    try {
      const { id } = req.params;
      const { 
        status, 
        page = PAGINATION.DEFAULT_PAGE, 
        limit = PAGINATION.DEFAULT_LIMIT 
      } = req.query;

      const template = await ProcessTemplate.findById(id);
      if (!template) {
        throw new AppError('Process template not found', 404);
      }

      const query = { processTemplateId: id };
      if (status) query.status = status;

      const skip = (page - 1) * limit;
      const [instances, total] = await Promise.all([
        ProcessInstance.find(query)
          .populate('initiatedBy', 'username profile.firstName profile.lastName')
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
          instances,
          pagination
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete process template
  async deleteProcessTemplate(req, res, next) {
    try {
      const { id } = req.params;

      const template = await ProcessTemplate.findById(id);
      if (!template) {
        throw new AppError('Process template not found', 404);
      }

      // Check permissions
      const canDelete = req.user.role === 'admin' || 
                       template.createdBy.equals(req.user._id);

      if (!canDelete) {
        throw new AppError('Insufficient permissions to delete this template', 403);
      }

      // Check for active instances
      const activeInstances = await ProcessInstance.countDocuments({
        processTemplateId: id,
        status: { $in: ['active', 'suspended'] }
      });

      if (activeInstances > 0) {
        throw new AppError(
          `Cannot delete template with ${activeInstances} active process instances`, 
          400
        );
      }

      await ProcessTemplate.findByIdAndDelete(id);

      logger.info(`Process template deleted by ${req.user.email}: ${template.name}`);

      res.json({
        status: 'success',
        message: 'Process template deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Get categories
  async getCategories(req, res, next) {
    try {
      const categories = await ProcessTemplate.distinct('category', {
        isActive: true
      });

      res.json({
        status: 'success',
        data: { categories: categories.sort() }
      });
    } catch (error) {
      next(error);
    }
  }

  // Duplicate template
  async duplicateTemplate(req, res, next) {
    try {
      const { id } = req.params;
      const { name } = req.body;

      const originalTemplate = await ProcessTemplate.findById(id);
      if (!originalTemplate) {
        throw new AppError('Process template not found', 404);
      }

      const newName = name || `${originalTemplate.name} (Copy)`;

      // Check if name already exists
      const existingTemplate = await ProcessTemplate.findOne({ name: newName });
      if (existingTemplate) {
        throw new AppError('Template with this name already exists', 400);
      }

      const duplicatedTemplate = new ProcessTemplate({
        ...originalTemplate.toObject(),
        _id: undefined,
        name: newName,
        version: '1.0.0',
        isPublished: false,
        publishedBy: undefined,
        publishedAt: undefined,
        createdBy: req.user._id,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await duplicatedTemplate.save();

      logger.info(`Template duplicated by ${req.user.email}: ${newName}`);

      res.status(201).json({
        status: 'success',
        message: 'Template duplicated successfully',
        data: { template: duplicatedTemplate }
      });
    } catch (error) {
      next(error);
    }
  }

  // Helper method to validate step references
  validateStepReferences(steps, startStep, endSteps) {
    const stepIds = steps.map(step => step.stepId);
    
    // Check if start step exists
    if (!stepIds.includes(startStep)) {
      throw new AppError('Start step must exist in the steps array', 400);
    }
    
    // Check if all end steps exist
    const invalidEndSteps = endSteps.filter(endStep => !stepIds.includes(endStep));
    if (invalidEndSteps.length > 0) {
      throw new AppError(`End steps not found in steps array: ${invalidEndSteps.join(', ')}`, 400);
    }
    
    // Check next step references
    for (const step of steps) {
      if (step.nextSteps && step.nextSteps.length > 0) {
        const invalidNextSteps = step.nextSteps
          .map(ns => ns.stepId)
          .filter(stepId => !stepIds.includes(stepId));
        
        if (invalidNextSteps.length > 0) {
          throw new AppError(
            `Step "${step.stepId}" references invalid next steps: ${invalidNextSteps.join(', ')}`, 
            400
          );
        }
      }
    }
  }

  // Helper method to validate template for publishing
  validateTemplateForPublishing(template) {
    const errors = [];
    const warnings = [];
    
    // Check for required fields
    if (!template.name || template.name.trim().length === 0) {
      errors.push('Template name is required');
    }
    
    if (!template.category || template.category.trim().length === 0) {
      errors.push('Template category is required');
    }
    
    if (!template.steps || template.steps.length === 0) {
      errors.push('Template must have at least one step');
    }
    
    // Check step configuration
    if (template.steps) {
      const stepIds = template.steps.map(step => step.stepId);
      
      // Check for duplicate step IDs
      const duplicateStepIds = stepIds.filter((stepId, index) => 
        stepIds.indexOf(stepId) !== index
      );
      
      if (duplicateStepIds.length > 0) {
        errors.push(`Duplicate step IDs found: ${duplicateStepIds.join(', ')}`);
      }
      
      // Check user task assignments
      template.steps.forEach(step => {
        if (step.type === 'user_task') {
          if (!step.assigneeType || 
              (step.assigneeType === 'user' && (!step.assignees || step.assignees.length === 0))) {
            warnings.push(`Step "${step.name}" has no assignees configured`);
          }
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

export default new ProcessTemplateController();