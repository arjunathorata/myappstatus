const express = require('express');
const stepInstanceController = require('../controllers/stepInstanceController');
const { authenticate, authorize } = require('../middleware/auth');
const { validate, validateObjectId, validateQuery } = require('../middleware/validation');
const {
  getStepInstancesQuerySchema,
  completeStepSchema,
  assignStepSchema,
  addCommentSchema,
  escalateStepSchema
} = require('../validators/stepInstanceValidators');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     StepInstance:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         processInstanceId:
 *           type: string
 *         stepId:
 *           type: string
 *         name:
 *           type: string
 *         type:
 *           type: string
 *           enum: [user_task, service_task, decision, parallel, exclusive, start, end]
 *         status:
 *           type: string
 *           enum: [pending, in_progress, completed, skipped, failed, cancelled]
 *         assignedTo:
 *           type: string
 *         assignedRole:
 *           type: string
 *         assignedDepartment:
 *           type: string
 *         startDate:
 *           type: string
 *           format: date-time
 *         endDate:
 *           type: string
 *           format: date-time
 *         dueDate:
 *           type: string
 *           format: date-time
 *         formData:
 *           type: object
 *         escalated:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/step-instances:
 *   get:
 *     summary: Get step instances with pagination and filtering
 *     tags: [Step Instances]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, completed, skipped, failed, cancelled]
 *       - in: query
 *         name: assignedTo
 *         schema:
 *           type: string
 *       - in: query
 *         name: assignedRole
 *         schema:
 *           type: string
 *       - in: query
 *         name: assignedDepartment
 *         schema:
 *           type: string
 *       - in: query
 *         name: processInstanceId
 *         schema:
 *           type: string
 *       - in: query
 *         name: overdue
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: escalated
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [user_task, service_task, decision, parallel, exclusive]
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [dueDate, createdAt, startDate, priority]
 *           default: dueDate
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *     responses:
 *       200:
 *         description: Step instances retrieved successfully
 */
router.get('/', 
  authenticate, 
  validateQuery(getStepInstancesQuerySchema), 
  stepInstanceController.getStepInstances
);

/**
 * @swagger
 * /api/step-instances/{id}:
 *   get:
 *     summary: Get step instance by ID
 *     tags: [Step Instances]
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
 *         description: Step instance retrieved successfully
 *       404:
 *         description: Step instance not found
 */
router.get('/:id', 
  authenticate, 
  validateObjectId('id'), 
  stepInstanceController.getStepInstanceById
);

/**
 * @swagger
 * /api/step-instances/{id}/complete:
 *   post:
 *     summary: Complete step instance
 *     tags: [Step Instances]
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
 *               formData:
 *                 type: object
 *                 description: Form data for the step
 *               comment:
 *                 type: string
 *                 description: Optional completion comment
 *               decision:
 *                 type: string
 *                 description: Decision for decision type steps
 *     responses:
 *       200:
 *         description: Step completed successfully
 *       400:
 *         description: Step cannot be completed or validation error
 *       403:
 *         description: Not authorized to complete this step
 *       404:
 *         description: Step instance not found
 */
router.post('/:id/complete', 
  authenticate, 
  validateObjectId('id'), 
  validate(completeStepSchema), 
  stepInstanceController.completeStep
);

/**
 * @swagger
 * /api/step-instances/{id}/assign:
 *   post:
 *     summary: Assign step to user
 *     tags: [Step Instances]
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
 *               assignedTo:
 *                 type: string
 *                 description: User ID to assign to
 *               assignedRole:
 *                 type: string
 *                 description: Role to assign to
 *               assignedDepartment:
 *                 type: string
 *                 description: Department to assign to
 *               comment:
 *                 type: string
 *                 description: Assignment comment
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 description: New due date
 *     responses:
 *       200:
 *         description: Step assigned successfully
 *       400:
 *         description: Invalid assignment or step cannot be assigned
 *       404:
 *         description: Step instance or user not found
 */
router.post('/:id/assign', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  validate(assignStepSchema), 
  stepInstanceController.assignStep
);

/**
 * @swagger
 * /api/step-instances/{id}/reassign:
 *   post:
 *     summary: Reassign step to different user
 *     tags: [Step Instances]
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
 *               assignedTo:
 *                 type: string
 *               reason:
 *                 type: string
 *                 description: Reason for reassignment
 *     responses:
 *       200:
 *         description: Step reassigned successfully
 *       400:
 *         description: Invalid reassignment
 *       404:
 *         description: Step instance not found
 */
router.post('/:id/reassign', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  stepInstanceController.reassignStep
);

/**
 * @swagger
 * /api/step-instances/{id}/escalate:
 *   post:
 *     summary: Escalate step instance
 *     tags: [Step Instances]
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
 *               escalateTo:
 *                 type: string
 *                 description: User ID to escalate to
 *               reason:
 *                 type: string
 *                 description: Reason for escalation
 *     responses:
 *       200:
 *         description: Step escalated successfully
 *       400:
 *         description: Step cannot be escalated
 *       404:
 *         description: Step instance not found
 */
router.post('/:id/escalate', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  validate(escalateStepSchema), 
  stepInstanceController.escalateStep
);

/**
 * @swagger
 * /api/step-instances/{id}/start:
 *   post:
 *     summary: Start working on step instance
 *     tags: [Step Instances]
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
 *         description: Step started successfully
 *       400:
 *         description: Step cannot be started
 *       403:
 *         description: Not authorized to start this step
 *       404:
 *         description: Step instance not found
 */
router.post('/:id/start', 
  authenticate, 
  validateObjectId('id'), 
  stepInstanceController.startStep
);

/**
 * @swagger
 * /api/step-instances/{id}/skip:
 *   post:
 *     summary: Skip step instance
 *     tags: [Step Instances]
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
 *                 description: Reason for skipping
 *     responses:
 *       200:
 *         description: Step skipped successfully
 *       400:
 *         description: Step cannot be skipped
 *       404:
 *         description: Step instance not found
 */
router.post('/:id/skip', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  stepInstanceController.skipStep
);

/**
 * @swagger
 * /api/step-instances/{id}/comments:
 *   post:
 *     summary: Add comment to step instance
 *     tags: [Step Instances]
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
 *               - comment
 *             properties:
 *               comment:
 *                 type: string
 *                 maxLength: 1000
 *               isInternal:
 *                 type: boolean
 *                 default: false
 *                 description: Whether comment is internal only
 *     responses:
 *       201:
 *         description: Comment added successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Step instance not found
 */
router.post('/:id/comments', 
  authenticate, 
  validateObjectId('id'), 
  validate(addCommentSchema), 
  stepInstanceController.addComment
);

/**
 * @swagger
 * /api/step-instances/{id}/comments:
 *   get:
 *     summary: Get step instance comments
 *     tags: [Step Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeInternal
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include internal comments (admin/manager only)
 *     responses:
 *       200:
 *         description: Comments retrieved successfully
 *       404:
 *         description: Step instance not found
 */
router.get('/:id/comments', 
  authenticate, 
  validateObjectId('id'), 
  stepInstanceController.getComments
);

/**
 * @swagger
 * /api/step-instances/{id}/attachments:
 *   post:
 *     summary: Add attachment to step instance
 *     tags: [Step Instances]
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
 *         description: Step instance not found
 */
router.post('/:id/attachments', 
  authenticate, 
  validateObjectId('id'), 
  stepInstanceController.addAttachment
);

/**
 * @swagger
 * /api/step-instances/{id}/attachments:
 *   get:
 *     summary: Get step instance attachments
 *     tags: [Step Instances]
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
 *         description: Step instance not found
 */
router.get('/:id/attachments', 
  authenticate, 
  validateObjectId('id'), 
  stepInstanceController.getAttachments
);

/**
 * @swagger
 * /api/step-instances/my-tasks:
 *   get:
 *     summary: Get current user's assigned tasks
 *     tags: [Step Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, completed]
 *       - in: query
 *         name: overdue
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: User tasks retrieved successfully
 */
router.get('/my-tasks', 
  authenticate, 
  stepInstanceController.getMyTasks
);

/**
 * @swagger
 * /api/step-instances/available:
 *   get:
 *     summary: Get available tasks for current user (by role/department)
 *     tags: [Step Instances]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Available tasks retrieved successfully
 */
router.get('/available', 
  authenticate, 
  stepInstanceController.getAvailableTasks
);

/**
 * @swagger
 * /api/step-instances/{id}/claim:
 *   post:
 *     summary: Claim an available task
 *     tags: [Step Instances]
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
 *         description: Task claimed successfully
 *       400:
 *         description: Task cannot be claimed
 *       404:
 *         description: Step instance not found
 */
router.post('/:id/claim', 
  authenticate, 
  validateObjectId('id'), 
  stepInstanceController.claimTask
);

module.exports = router;