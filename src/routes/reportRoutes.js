import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { generalLimiter, reportLimiter } from '../middleware/rateLimiter.js';
import { cacheReports } from '../middleware/cache.js';
import { validate, validateQuery } from '../utils/validation.js';
import { querySchemas } from '../utils/validation.js';
import reportController from '../controllers/reportController.js';
import { catchAsync } from '../utils/helpers.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Apply rate limiting
router.use(generalLimiter);

/**
 * @swagger
 * /api/reports/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/dashboard', 
  cacheReports(300), // 5 minutes cache
  catchAsync(reportController.getDashboardStats)
);

/**
 * @swagger
 * /api/reports/process-performance:
 *   get:
 *     summary: Get process performance report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the report
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the report
 *       - in: query
 *         name: processTemplateId
 *         schema:
 *           type: string
 *         description: Specific process template ID
 *     responses:
 *       200:
 *         description: Process performance report generated successfully
 */
router.get('/process-performance',
  authorize('admin', 'manager'),
  validateQuery(querySchemas.search),
  reportLimiter,
  cacheReports(600), // 10 minutes cache
  catchAsync(reportController.getProcessPerformanceReport)
);

/**
 * @swagger
 * /api/reports/user-workload:
 *   get:
 *     summary: Get user workload report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the report
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the report
 *     responses:
 *       200:
 *         description: User workload report generated successfully
 */
router.get('/user-workload',
  authorize('admin', 'manager'),
  validateQuery(querySchemas.search),
  reportLimiter,
  cacheReports(600),
  catchAsync(reportController.getUserWorkloadReport)
);

/**
 * @swagger
 * /api/reports/sla-compliance:
 *   get:
 *     summary: Get SLA compliance report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the report
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the report
 *     responses:
 *       200:
 *         description: SLA compliance report generated successfully
 */
router.get('/sla-compliance',
  authorize('admin', 'manager'),
  validateQuery(querySchemas.search),
  reportLimiter,
  cacheReports(600),
  catchAsync(reportController.getSLAComplianceReport)
);

/**
 * @swagger
 * /api/reports/process-trends:
 *   get:
 *     summary: Get process trends report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, yearly]
 *         description: Time period for trends
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the report
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the report
 *     responses:
 *       200:
 *         description: Process trends report generated successfully
 */
router.get('/process-trends',
  authorize('admin', 'manager'),
  validateQuery(querySchemas.search),
  reportLimiter,
  cacheReports(1800), // 30 minutes cache
  catchAsync(reportController.getProcessTrendsReport)
);

/**
 * @swagger
 * /api/reports/export/{reportType}:
 *   get:
 *     summary: Export report as CSV or PDF
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [dashboard, process-performance, user-workload, sla-compliance, process-trends]
 *         description: Type of report to export
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *           default: csv
 *         description: Export format
 *     responses:
 *       200:
 *         description: Report exported successfully
 *         content:
 *           application/csv:
 *             schema:
 *               type: string
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/export/:reportType',
  authorize('admin', 'manager'),
  reportLimiter,
  catchAsync(reportController.exportReport)
);

/**
 * @swagger
 * /api/reports/custom:
 *   post:
 *     summary: Generate custom report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reportName:
 *                 type: string
 *                 description: Name of the custom report
 *               filters:
 *                 type: object
 *                 description: Custom filters for the report
 *               groupBy:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Fields to group by
 *               metrics:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Metrics to include
 *               dateRange:
 *                 type: object
 *                 properties:
 *                   from:
 *                     type: string
 *                     format: date
 *                   to:
 *                     type: string
 *                     format: date
 *     responses:
 *       200:
 *         description: Custom report generated successfully
 */
router.post('/custom',
  authorize('admin', 'manager'),
  reportLimiter,
  catchAsync(reportController.generateCustomReport)
);

export default router;