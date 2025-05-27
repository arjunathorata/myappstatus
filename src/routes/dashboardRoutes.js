import express from 'express';
import dashboardController from '../controllers/dashboardController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validation.js';
import { getDashboardQuerySchema } from '../validators/dashboardValidators.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     DashboardOverview:
 *       type: object
 *       properties:
 *         totalProcesses:
 *           type: integer
 *         activeProcesses:
 *           type: integer
 *         completedProcesses:
 *           type: integer
 *         totalTasks:
 *           type: integer
 *         pendingTasks:
 *           type: integer
 *         overdueTasks:
 *           type: integer
 *         recentActivity:
 *           type: array
 *           items:
 *             type: object
 */

/**
 * @swagger
 * /api/dashboard/overview:
 *   get:
 *     summary: Get dashboard overview statistics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard overview retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/DashboardOverview'
 */
router.get('/overview', 
  authenticate, 
  dashboardController.getOverview
);

/**
 * @swagger
 * /api/dashboard/my-tasks:
 *   get:
 *     summary: Get current user's tasks
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, completed]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: overdue
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: User tasks retrieved successfully
 */
router.get('/my-tasks', 
  authenticate, 
  validateQuery(getDashboardQuerySchema), 
  dashboardController.getMyTasks
);

/**
 * @swagger
 * /api/dashboard/my-processes:
 *   get:
 *     summary: Get current user's processes
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, completed, cancelled, suspended]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: User processes retrieved successfully
 */
router.get('/my-processes', 
  authenticate, 
  dashboardController.getMyProcesses
);

/**
 * @swagger
 * /api/dashboard/statistics:
 *   get:
 *     summary: Get detailed system statistics (Admin/Manager only)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *       403:
 *         description: Insufficient permissions
 */
router.get('/statistics', 
  authenticate, 
  authorize('admin', 'manager'), 
  dashboardController.getStatistics
);

/**
 * @swagger
 * /api/dashboard/recent-activity:
 *   get:
 *     summary: Get recent system activity
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: Recent activity retrieved successfully
 */
router.get('/recent-activity', 
  authenticate, 
  dashboardController.getRecentActivity
);

/**
 * @swagger
 * /api/dashboard/performance:
 *   get:
 *     summary: Get performance metrics (Admin/Manager only)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *           default: month
 *     responses:
 *       200:
 *         description: Performance metrics retrieved successfully
 */
router.get('/performance', 
  authenticate, 
  authorize('admin', 'manager'), 
  dashboardController.getPerformanceMetrics
);

/**
 * @swagger
 * /api/dashboard/workload:
 *   get:
 *     summary: Get workload distribution (Manager/Admin only)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workload distribution retrieved successfully
 */
router.get('/workload', 
  authenticate, 
  authorize('admin', 'manager'), 
  dashboardController.getWorkloadDistribution
);

export default router;