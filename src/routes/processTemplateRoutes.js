
import express from 'express';
import processTemplateController from '../controllers/processTemplateController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, validateObjectId, validateQuery } from '../middleware/validation.js';
import {
  createProcessTemplateSchema,
  updateProcessTemplateSchema,
  getProcessTemplatesQuerySchema,
  publishTemplateSchema,
  validateTemplateSchema
} from '../validators/processTemplateValidators.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ProcessTemplate:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         version:
 *           type: string
 *         category:
 *           type: string
 *         steps:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               stepId:
 *                 type: string
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [user_task, service_task, decision, parallel, exclusive, start, end]
 *               assigneeType:
 *                 type: string
 *                 enum: [user, role, department, auto]
 *         startStep:
 *           type: string
 *         endSteps:
 *           type: array
 *           items:
 *             type: string
 *         isActive:
 *           type: boolean
 *         isPublished:
 *           type: boolean
 *         createdBy:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/process-templates:
 *   get:
 *     summary: Get all process templates with pagination and filtering
 *     tags: [Process Templates]
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
 *         description: Search in name and description
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: isPublished
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: createdBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, createdAt, updatedAt, version]
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Process templates retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', 
  authenticate, 
  validateQuery(getProcessTemplatesQuerySchema), 
  processTemplateController.getProcessTemplates
);

/**
 * @swagger
 * /api/process-templates/{id}:
 *   get:
 *     summary: Get process template by ID
 *     tags: [Process Templates]
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
 *         description: Process template retrieved successfully
 *       404:
 *         description: Process template not found
 */
router.get('/:id', 
  authenticate, 
  validateObjectId('id'), 
  processTemplateController.getProcessTemplateById
);

/**
 * @swagger
 * /api/process-templates:
 *   post:
 *     summary: Create a new process template
 *     tags: [Process Templates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - category
 *               - steps
 *               - startStep
 *               - endSteps
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               category:
 *                 type: string
 *               steps:
 *                 type: array
 *                 items:
 *                   type: object
 *               startStep:
 *                 type: string
 *               endSteps:
 *                 type: array
 *                 items:
 *                   type: string
 *               variables:
 *                 type: array
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Process template created successfully
 *       400:
 *         description: Validation error
 */
router.post('/', 
  authenticate, 
  authorize('admin', 'manager'), 
  validate(createProcessTemplateSchema), 
  processTemplateController.createProcessTemplate
);

/**
 * @swagger
 * /api/process-templates/{id}:
 *   put:
 *     summary: Update process template
 *     tags: [Process Templates]
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
 *               category:
 *                 type: string
 *               steps:
 *                 type: array
 *               startStep:
 *                 type: string
 *               endSteps:
 *                 type: array
 *               variables:
 *                 type: array
 *               tags:
 *                 type: array
 *     responses:
 *       200:
 *         description: Process template updated successfully
 *       404:
 *         description: Process template not found
 */
router.put('/:id', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  validate(updateProcessTemplateSchema), 
  processTemplateController.updateProcessTemplate
);

/**
 * @swagger
 * /api/process-templates/{id}/publish:
 *   post:
 *     summary: Publish process template
 *     tags: [Process Templates]
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
 *               version:
 *                 type: string
 *                 description: New version number
 *     responses:
 *       200:
 *         description: Process template published successfully
 *       400:
 *         description: Template validation failed
 *       404:
 *         description: Process template not found
 */
router.post('/:id/publish', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  validate(publishTemplateSchema), 
  processTemplateController.publishTemplate
);

/**
 * @swagger
 * /api/process-templates/{id}/version:
 *   post:
 *     summary: Create new version of process template
 *     tags: [Process Templates]
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
 *               - version
 *             properties:
 *               version:
 *                 type: string
 *               changes:
 *                 type: string
 *                 description: Description of changes
 *     responses:
 *       201:
 *         description: New version created successfully
 *       400:
 *         description: Version already exists
 *       404:
 *         description: Process template not found
 */
router.post('/:id/version', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  processTemplateController.createNewVersion
);

/**
 * @swagger
 * /api/process-templates/{id}/versions:
 *   get:
 *     summary: Get all versions of process template
 *     tags: [Process Templates]
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
 *         description: Template versions retrieved successfully
 *       404:
 *         description: Process template not found
 */
router.get('/:id/versions', 
  authenticate, 
  validateObjectId('id'), 
  processTemplateController.getTemplateVersions
);

/**
 * @swagger
 * /api/process-templates/{id}/validate:
 *   post:
 *     summary: Validate process template
 *     tags: [Process Templates]
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
 *         description: Template is valid
 *       400:
 *         description: Template validation failed
 *       404:
 *         description: Process template not found
 */
router.post('/:id/validate', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  processTemplateController.validateTemplate
);

/**
 * @swagger
 * /api/process-templates/{id}/instances:
 *   get:
 *     summary: Get instances of process template
 *     tags: [Process Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, completed, cancelled, suspended]
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
 *         description: Process instances retrieved successfully
 *       404:
 *         description: Process template not found
 */
router.get('/:id/instances', 
  authenticate, 
  validateObjectId('id'), 
  processTemplateController.getTemplateInstances
);

/**
 * @swagger
 * /api/process-templates/{id}:
 *   delete:
 *     summary: Delete process template
 *     tags: [Process Templates]
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
 *         description: Process template deleted successfully
 *       400:
 *         description: Cannot delete template with active instances
 *       404:
 *         description: Process template not found
 */
router.delete('/:id', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  processTemplateController.deleteProcessTemplate
);

/**
 * @swagger
 * /api/process-templates/categories:
 *   get:
 *     summary: Get all process template categories
 *     tags: [Process Templates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 */
router.get('/categories', 
  authenticate, 
  processTemplateController.getCategories
);

/**
 * @swagger
 * /api/process-templates/{id}/duplicate:
 *   post:
 *     summary: Duplicate process template
 *     tags: [Process Templates]
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
 *               name:
 *                 type: string
 *                 description: Name for the duplicated template
 *     responses:
 *       201:
 *         description: Template duplicated successfully
 *       404:
 *         description: Process template not found
 */
router.post('/:id/duplicate', 
  authenticate, 
  authorize('admin', 'manager'), 
  validateObjectId('id'), 
  processTemplateController.duplicateTemplate
);

export default router;