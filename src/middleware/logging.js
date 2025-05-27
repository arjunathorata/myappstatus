import morgan from 'morgan';
import logger from '../utils/logger.js';

// Development logging format
const devFormat = ':method :url :status :res[content-length] - :response-time ms';

// Production logging format
const prodFormat = ':remote-addr - [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';

// Skip logging for specific routes
const skipRoutes = (req, res) => {
  return req.url === '/health' || req.url === '/favicon.ico';
};

// Development logger
export const devLogger = morgan(devFormat, {
  stream: {
    write: (message) => {
      logger.info(message.trim());
    }
  },
  skip: skipRoutes
});

// Production logger
export const prodLogger = morgan(prodFormat, {
  stream: {
    write: (message) => {
      logger.info(message.trim());
    }
  },
  skip: skipRoutes
});

// Apply logging middleware
export const applyLogging = (app) => {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    app.use(prodLogger);
  } else {
    app.use(devLogger);
  }
  
  logger.info('Logging middleware applied');
};

export default {
  devLogger,
  prodLogger,
  applyLogging
};