import express from 'express';
import processInstanceController from '../controllers/processInstanceController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, validateObjectId, validateQuery } from '../middleware/validation.js';
import {
  createProcessInstanceSchema,
  updateProcessInstanceSchema,
  getProcessInstancesQuerySchema,
  updateVariablesSchema,
  addCommentSchema
} from '../validators/processInstanceValidators.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ProcessInstance:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         processTemplateId:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [draft, active, completed, cancelled, suspended]
 *         priority:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         initiatedBy:
 *           type: string
 *         currentSteps:
 *           type: array
 *           items:
 *             type: string
 *         variables:
 *           type: object
 *         startDate:
 *           type: string
 *           format: date-time
 *         endDate:
 *           type: string
 *           format: date-time
 *         dueDate:
 *           type: string
 *           format: date-time
 *         completionPercentage:
 *           type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/process-instances:
 *   get:
 *     summary: Get all process instances with pagination and filtering
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, completed, cancelled, suspended]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *       - in: query
 *         name: initiatedBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: processTemplateId
 *         schema:
 *           type: string
 *       - in: query
 *         name: overdue
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, createdAt, startDate, dueDate, priority]
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Process instances retrieved successfully
 */
router.get('/', 
  authenticate, 
  validateQuery(getProcessInstancesQuerySchema), 
  processInstanceController.getProcessInstances
);

/**
 * @swagger
 * /api/process-instances/{id}:
 *   get:
 *     summary: Get process instance by ID
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Process instance retrieved successfully
 *       404:
 *         description: Process instance not found
 */
router.get('/:id', 
  authenticate, 
  validateObjectId('id'), 
  processInstanceController.getProcessInstanceById
);

/**
 * @swagger
 * /api/process-instances:
 *   post:
 *     summary: Create and start a new process instance
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - processTemplateId
 *               - name
 *             properties:
 *               processTemplateId:
 *                 type: string
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 default: medium
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               variables:
 *                 type: object
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               autoStart:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Process instance created successfully
 *       400:
 *         description: Validation error or template not found
 */
router.post('/', 
  authenticate, 
  validate(createProcessInstanceSchema), 
  processInstanceController.createProcessInstance
);

/**
 * @swagger
 * /api/process-instances/{id}:
 *   put:
 *     summary: Update process instance
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Process instance updated successfully
 *       404:
 *         description: Process instance not found
 */
router.put('/:id', 
  authenticate, 
  validateObjectId('id'), 
  validate(updateProcessInstanceSchema), 
  processInstanceController.updateProcessInstance
);

/**
 * @swagger
 * /api/process-instances/{id}/start:
 *   post:
 *     summary: Start process instance
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Process instance started successfully
 *       400:
 *         description: Process cannot be started
 *       404:
 *         description: Process instance not found
 */
router.post('/:id/start', 
  authenticate, 
  validateObjectId('id'), 
  processInstanceController.startProcess
);

/**
 * @swagger
 * /api/process-instances/{id}/suspend:
 *   post:
 *     summary: Suspend process instance
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for suspension
 *     responses:
 *       200:
 *         description: Process instance suspended successfully
 *       400:
 *         description: Process cannot be suspended
 *       404:
 *         description: Process instance not found
 */
router.post('/:id/suspend', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  processInstanceController.suspendProcess
);

/**
 * @swagger
 * /api/process-instances/{id}/resume:
 *   post:
 *     summary: Resume suspended process instance
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Process instance resumed successfully
 *       400:
 *         description: Process cannot be resumed
 *       404:
 *         description: Process instance not found
 */
router.post('/:id/resume', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  processInstanceController.resumeProcess
);

/**
 * @swagger
 * /api/process-instances/{id}/cancel:
 *   post:
 *     summary: Cancel process instance
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for cancellation
 *     responses:
 *       200:
 *         description: Process instance cancelled successfully
 *       400:
 *         description: Process cannot be cancelled
 *       404:
 *         description: Process instance not found
 */
router.post('/:id/cancel', 
  authenticate, 
  validateObjectId('id'), 
  processInstanceController.cancelProcess
);

/**
 * @swagger
 * /api/process-instances/{id}/history:
 *   get:
 *     summary: Get process instance history
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Process history retrieved successfully
 *       404:
 *         description: Process instance not found
 */
router.get('/:id/history', 
  authenticate, 
  validateObjectId('id'), 
  processInstanceController.getProcessHistory
);

/**
 * @swagger
 * /api/process-instances/{id}/current-steps:
 *   get:
 *     summary: Get current active steps of process instance
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Current steps retrieved successfully
 *       404:
 *         description: Process instance not found
 */
router.get('/:id/current-steps', 
  authenticate, 
  validateObjectId('id'), 
  processInstanceController.getCurrentSteps
);

/**
 * @swagger
 * /api/process-instances/{id}/variables:
 *   post:
 *     summary: Update process variables
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variables
 *             properties:
 *               variables:
 *                 type: object
 *               merge:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to merge with existing variables or replace
 *     responses:
 *       200:
 *         description: Variables updated successfully
 *       404:
 *         description: Process instance not found
 */
router.post('/:id/variables', 
  authenticate, 
  validateObjectId('id'), 
  validate(updateVariablesSchema), 
  processInstanceController.updateVariables
);

/**
 * @swagger
 * /api/process-instances/{id}/attachments:
 *   post:
 *     summary: Add attachment to process instance
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Attachment added successfully
 *       400:
 *         description: Invalid file or validation error
 *       404:
 *         description: Process instance not found
 */
router.post('/:id/attachments', 
  authenticate, 
  validateObjectId('id'), 
  processInstanceController.addAttachment
);

/**
 * @swagger
 * /api/process-instances/{id}/attachments:
 *   get:
 *     summary: Get process instance attachments
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Attachments retrieved successfully
 *       404:
 *         description: Process instance not found
 */
router.get('/:id/attachments', 
  authenticate, 
  validateObjectId('id'), 
  processInstanceController.getAttachments
);

/**
 * @swagger
 * /api/process-instances/{id}:
 *   delete:
 *     summary: Delete process instance
 *     tags: [Process Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Process instance deleted successfully
 *       400:
 *         description: Cannot delete active process
 *       404:
 *         description: Process instance not found
 */
router.delete('/:id', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  processInstanceController.deleteProcessInstance
);

export default router;