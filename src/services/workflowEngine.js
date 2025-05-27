import ProcessInstance from '../models/ProcessInstance.js';
import ProcessTemplate from '../models/ProcessTemplate.js';
import StepInstance from '../models/StepInstance.js';
import ProcessHistory from '../models/ProcessHistory.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';

class WorkflowEngine {
  // Start a process instance
  async startProcess(processInstanceId, userId) {
    try {
      const instance = await ProcessInstance.findById(processInstanceId)
        .populate('processTemplateId');

      if (!instance) {
        throw new AppError('Process instance not found', 404);
      }

      if (instance.status !== 'draft') {
        throw new AppError('Process can only be started from draft status', 400);
      }

      const template = instance.processTemplateId;

      // Update process instance status
      instance.status = 'active';
      instance.startDate = new Date();
      
      // Find the start step from template
      const startStep = template.steps.find(step => step.stepId === template.startStep);
      if (!startStep) {
        throw new AppError('Start step not found in template', 400);
      }

      // Create the initial step instance
      await this.createStepInstance(instance, startStep, userId);

      // Update current steps
      instance.currentSteps = [startStep.stepId];
      await instance.save();

      // Log process start
      await ProcessHistory.create({
        processInstanceId: instance._id,
        action: 'process_started',
        performedBy: userId,
        fromStatus: 'draft',
        toStatus: 'active'
      });

      logger.info(`Process started: ${instance.name} (${instance._id})`);

      return instance;
    } catch (error) {
      logger.error('Error starting process:', error);
      throw error;
    }
  }

  // Complete a step and move to next steps
  async completeStep(stepInstanceId, userId, formData = {}, decision = null) {
    try {
      const stepInstance = await StepInstance.findById(stepInstanceId)
        .populate('processInstanceId');

      if (!stepInstance) {
        throw new AppError('Step instance not found', 404);
      }

      const processInstance = stepInstance.processInstanceId;
      const template = await ProcessTemplate.findById(processInstance.processTemplateId);

      if (!template) {
        throw new AppError('Process template not found', 404);
      }

      // Check if step can be completed
      if (!stepInstance.canComplete(userId)) {
        throw new AppError('You are not authorized to complete this step', 403);
      }

      // Update step instance
      stepInstance.status = 'completed';
      stepInstance.endDate = new Date();
      stepInstance.completedBy = userId;
      stepInstance.formData = { ...stepInstance.formData, ...formData };

      if (decision) {
        stepInstance.variables = { ...stepInstance.variables, decision };
      }

      await stepInstance.save();

      // Log step completion
      await ProcessHistory.create({
        processInstanceId: processInstance._id,
        stepInstanceId: stepInstance._id,
        action: 'step_completed',
        performedBy: userId,
        fromStatus: 'in_progress',
        toStatus: 'completed',
        metadata: { formData, decision }
      });

      // Find template step to get next steps
      const templateStep = template.steps.find(s => s.stepId === stepInstance.stepId);
      if (!templateStep) {
        throw new AppError('Template step not found', 400);
      }

      // Process step completion and move to next steps
      await this.processStepCompletion(stepInstance, userId);

      logger.info(`Step completed: ${stepInstance.name} (${stepInstance._id})`);

      return stepInstance;
    } catch (error) {
      logger.error('Error completing step:', error);
      throw error;
    }
  }

  // Process step completion and determine next steps
  async processStepCompletion(stepInstance, userId) {
    try {
      const processInstance = stepInstance.processInstanceId;
      const template = await ProcessTemplate.findById(processInstance.processTemplateId);
      
      // Find template step
      const templateStep = template.steps.find(s => s.stepId === stepInstance.stepId);
      
      // Remove current step from process instance
      processInstance.currentSteps = processInstance.currentSteps.filter(
        stepId => stepId !== stepInstance.stepId
      );

      // Determine next steps
      const nextStepIds = this.determineNextSteps(templateStep, stepInstance, stepInstance.variables?.decision);

      // Create next step instances
      for (const nextStepId of nextStepIds) {
        const nextTemplateStep = template.steps.find(s => s.stepId === nextStepId);
        if (nextTemplateStep) {
          await this.createStepInstance(processInstance, nextTemplateStep, userId);
          processInstance.currentSteps.push(nextStepId);
        }
      }

      // Check if process is complete
      if (nextStepIds.length === 0 || nextStepIds.every(id => template.endSteps.includes(id))) {
        await this.completeProcess(processInstance, userId);
      } else {
        // Update completion percentage
        await processInstance.updateCompletionPercentage();
        await processInstance.save();
      }

    } catch (error) {
      logger.error('Error processing step completion:', error);
      throw error;
    }
  }

  // Determine next steps based on current step and conditions
  determineNextSteps(templateStep, stepInstance, decision) {
    const nextSteps = [];

    if (!templateStep.nextSteps || templateStep.nextSteps.length === 0) {
      return nextSteps;
    }

    for (const nextStep of templateStep.nextSteps) {
      if (!nextStep.condition || this.evaluateCondition(nextStep.condition, stepInstance, decision)) {
        nextSteps.push(nextStep.stepId);
      }
    }

    // If no conditions match and it's a decision step, use the decision
    if (nextSteps.length === 0 && templateStep.type === 'decision' && decision) {
      const decisionStep = templateStep.nextSteps.find(ns => ns.condition === decision);
      if (decisionStep) {
        nextSteps.push(decisionStep.stepId);
      }
    }

    // If still no next steps, take the first one (default path)
    if (nextSteps.length === 0 && templateStep.nextSteps.length > 0) {
      nextSteps.push(templateStep.nextSteps[0].stepId);
    }

    return nextSteps;
  }

  // Evaluate condition (simple implementation)
  evaluateCondition(condition, stepInstance, decision) {
    try {
      // Simple condition evaluation
      if (condition === 'true' || condition === '') {
        return true;
      }

      if (decision && condition === decision) {
        return true;
      }

      // Add more complex condition evaluation logic here
      return false;
    } catch (error) {
      logger.error('Error evaluating condition:', error);
      return false;
    }
  }

  // Create a step instance
  async createStepInstance(processInstance, templateStep, userId) {
    try {
      const stepInstance = new StepInstance({
        processInstanceId: processInstance._id,
        stepId: templateStep.stepId,
        name: templateStep.name,
        description: templateStep.description,
        type: templateStep.type,
        assigneeType: templateStep.assigneeType,
        formData: {}
      });

      // Set assignment based on type
      if (templateStep.assigneeType === 'user' && templateStep.assignees?.length > 0) {
        // Assign to first available assignee (can be enhanced with load balancing)
        stepInstance.assignedTo = templateStep.assignees[0];
      } else if (templateStep.assigneeType === 'role') {
        stepInstance.assignedRole = templateStep.assignees?.[0];
      } else if (templateStep.assigneeType === 'department') {
        stepInstance.assignedDepartment = templateStep.assignees?.[0];
      }

      // Set due date if time limit is specified
      if (templateStep.timeLimit) {
        const dueDate = new Date();
        dueDate.setHours(dueDate.getHours() + templateStep.timeLimit);
        stepInstance.dueDate = dueDate;
      }

      // Auto-complete service tasks
      if (templateStep.type === 'service_task' || templateStep.autoComplete) {
        stepInstance.status = 'completed';
        stepInstance.startDate = new Date();
        stepInstance.endDate = new Date();
        stepInstance.completedBy = userId;
      }

      await stepInstance.save();

      // Log step creation
      await ProcessHistory.create({
        processInstanceId: processInstance._id,
        stepInstanceId: stepInstance._id,
        action: 'step_created',
        performedBy: userId,
        toStatus: stepInstance.status,
        metadata: {
          stepType: templateStep.type,
          assigneeType: templateStep.assigneeType
        }
      });

      // Send notification for user tasks
      if (templateStep.type === 'user_task' && stepInstance.assignedTo) {
        await this.sendTaskNotification(stepInstance);
      }

      return stepInstance;
    } catch (error) {
      logger.error('Error creating step instance:', error);
      throw error;
    }
  }

  // Complete process instance
  async completeProcess(processInstance, userId) {
    try {
      processInstance.status = 'completed';
      processInstance.endDate = new Date();
      processInstance.completionPercentage = 100;
      processInstance.currentSteps = [];

      await processInstance.save();

      // Log process completion
      await ProcessHistory.create({
        processInstanceId: processInstance._id,
        action: 'process_completed',
        performedBy: userId,
        fromStatus: 'active',
        toStatus: 'completed'
      });

      // Send completion notification
      await Notification.create({
        userId: processInstance.initiatedBy,
        type: 'process_completed',
        title: 'Process Completed',
        message: `Process "${processInstance.name}" has been completed successfully.`,
        relatedProcess: processInstance._id,
        priority: 'medium'
      });

      logger.info(`Process completed: ${processInstance.name} (${processInstance._id})`);
    } catch (error) {
      logger.error('Error completing process:', error);
      throw error;
    }
  }

  // Send task notification
  async sendTaskNotification(stepInstance) {
    try {
      await Notification.create({
        userId: stepInstance.assignedTo,
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: `You have been assigned a new task: ${stepInstance.name}`,
        relatedProcess: stepInstance.processInstanceId,
        relatedStep: stepInstance._id,
        priority: 'medium'
      });
    } catch (error) {
      logger.error('Error sending task notification:', error);
    }
  }

  // Escalate overdue tasks
  async escalateOverdueTasks() {
    try {
      const overdueTasks = await StepInstance.find({
        status: { $in: ['pending', 'in_progress'] },
        dueDate: { $lt: new Date() },
        escalated: false
      }).populate('processInstanceId');

      for (const task of overdueTasks) {
        // Find escalation target (manager or admin)
        const escalationTargets = await User.find({
          role: { $in: ['manager', 'admin'] },
          isActive: true
        }).limit(1);

        if (escalationTargets.length > 0) {
          const escalationTarget = escalationTargets[0];

          // Update task
          task.escalated = true;
          task.escalationLevel = 1;
          task.escalationHistory.push({
            level: 1,
            escalatedTo: escalationTarget._id,
            escalatedAt: new Date(),
            reason: 'Task overdue - automatic escalation'
          });

          await task.save();

          // Log escalation
          await ProcessHistory.create({
            processInstanceId: task.processInstanceId._id,
            stepInstanceId: task._id,
            action: 'step_escalated',
            performedBy: null, // System escalation
            metadata: {
              escalatedTo: escalationTarget._id,
              escalationLevel: 1,
              reason: 'Automatic escalation due to overdue task'
            }
          });

          // Send notification
          await Notification.create({
            userId: escalationTarget._id,
            type: 'task_escalated',
            title: 'Overdue Task Escalated',
            message: `Task "${task.name}" is overdue and has been escalated to you.`,
            relatedProcess: task.processInstanceId._id,
            relatedStep: task._id,
            priority: 'high'
          });

          logger.info(`Task escalated: ${task.name} (${task._id})`);
        }
      }

      logger.info(`Escalated ${overdueTasks.length} overdue tasks`);
    } catch (error) {
      logger.error('Error escalating overdue tasks:', error);
    }
  }
}

export default new WorkflowEngine();