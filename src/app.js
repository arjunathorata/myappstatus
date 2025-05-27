import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';

// Import configurations and utilities
import config from './config/environment.js';
import logger from './utils/logger.js';
import database from './utils/database.js';

// Import middleware
import { generalLimiter } from './middleware/rateLimiter.js';
import { applySecurity } from './middleware/security.js';
import { applyLogging } from './middleware/logging.js';
import errorHandler from './middleware/errorHandler.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import processTemplateRoutes from './routes/processTemplateRoutes.js';
import processInstanceRoutes from './routes/processInstanceRoutes.js';
import stepInstanceRoutes from './routes/stepInstanceRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import reportRoutes from './routes/reportRoutes.js';

// Import services
let schedulerService = null;
let swaggerUi = null;
let swaggerJsdoc = null;

// Conditional imports for optional features
if (config.app.environment !== 'test') {
  schedulerService = (await import('./services/schedulerService.js')).default;
}

if (config.features.enableSwagger) {
  try {
    swaggerUi = (await import('swagger-ui-express')).default;
    swaggerJsdoc = (await import('swagger-jsdoc')).default;
  } catch (error) {
    logger.warn('Swagger dependencies not available:', error.message);
  }
}

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Basic middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply security middleware
if (config.app.environment === 'production') {
  applySecurity(app);
} else {
  // Basic security for development
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors(config.cors));
  app.use(mongoSanitize());
  app.use(hpp());
}

// Rate limiting
app.use(generalLimiter);

// Logging middleware
if (config.app.environment !== 'test') {
  applyLogging(app);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.app.environment,
    version: config.app.version
  });
});

// API documentation (only in development)
if (config.features.enableSwagger && swaggerUi && swaggerJsdoc && config.app.environment !== 'production') {
  try {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'MyAppStatus API',
          version: config.app.version,
          description: 'Business Process Management System API',
        },
        servers: [
          {
            url: `http://localhost:${config.app.port}/api`,
            description: 'Development server',
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
        security: [
          {
            bearerAuth: [],
          },
        ],
      },
      apis: ['./src/routes/*.js'],
    };

    const specs = swaggerJsdoc(swaggerOptions);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
    logger.info('Swagger documentation available at /api-docs');
  } catch (error) {
    logger.warn('Failed to setup Swagger documentation:', error.message);
  }
}

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/process-templates', processTemplateRoutes);
app.use('/api/process-instances', processInstanceRoutes);
app.use('/api/step-instances', stepInstanceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to MyAppStatus API',
    version: config.app.version,
    environment: config.app.environment,
    documentation: config.features.enableSwagger && config.app.environment !== 'production' ? '/api-docs' : 'Not available',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      users: '/api/users',
      processTemplates: '/api/process-templates',
      processInstances: '/api/process-instances',
      stepInstances: '/api/step-instances',
      notifications: '/api/notifications',
      reports: '/api/reports'
    }
  });
});

// 404 handler
app.all('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close HTTP server
    if (server) {
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          // Stop scheduler
          if (schedulerService) {
            schedulerService.stopAll();
            logger.info('Scheduler stopped');
          }
          
          // Close database connection
          await database.disconnect();
          logger.info('Database disconnected');
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
      
      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    } else {
      process.exit(0);
    }
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Start server
let server;

const startServer = async () => {
  try {
    // Connect to database
    await database.connect();
    logger.info('Database connected successfully');

    // Start scheduler (only in production and development)
    if (schedulerService && config.app.environment !== 'test') {
      schedulerService.initialize();
      logger.info('Scheduler service initialized');
    }

    // Start HTTP server
    server = app.listen(config.app.port, config.app.host, () => {
      logger.info(`🚀 MyAppStatus server started successfully!`, {
        environment: config.app.environment,
        port: config.app.port,
        host: config.app.host,
        version: config.app.version,
        documentation: config.features.enableSwagger && config.app.environment !== 'production' ? 
          `http://${config.app.host}:${config.app.port}/api-docs` : 'Disabled',
        pid: process.pid
      });
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.app.port} is already in use`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Export app for testing
export default app;

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}