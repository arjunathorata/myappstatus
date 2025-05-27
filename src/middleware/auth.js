import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/environment.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';
import { TOKEN_TYPES } from '../utils/constants.js';

// Token blacklist (in production, use Redis)
const tokenBlacklist = new Set();

// Enhanced authentication middleware
export const authenticate = async (req, res, next) => {
  try {
    let token;
    
    // Get token from header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    }
    
    // Also check for token in cookies (optional)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      logger.warn('Authentication attempted without token', {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('User-Agent')
      });
      return next(new AppError('Authentication token required', 401));
    }

    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      logger.warn('Blacklisted token used', {
        ip: req.ip,
        path: req.path
      });
      return next(new AppError('Token has been revoked', 401));
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (jwtError) {
      logger.warn('Token verification failed', {
        error: jwtError.message,
        ip: req.ip,
        path: req.path,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'N/A'
      });

      if (jwtError.name === 'TokenExpiredError') {
        return next(new AppError('Token has expired', 401));
      } else if (jwtError.name === 'JsonWebTokenError') {
        return next(new AppError('Invalid token format', 401));
      } else if (jwtError.name === 'NotBeforeError') {
        return next(new AppError('Token not active yet', 401));
      } else {
        return next(new AppError('Token verification failed', 401));
      }
    }

    // Validate token structure
    if (!decoded.userId) {
      logger.warn('Token missing userId', {
        decoded,
        ip: req.ip,
        path: req.path
      });
      return next(new AppError('Invalid token structure', 401));
    }

    // Check token type if specified
    if (decoded.type && decoded.type !== TOKEN_TYPES.ACCESS) {
      logger.warn('Invalid token type used', {
        tokenType: decoded.type,
        expectedType: TOKEN_TYPES.ACCESS,
        ip: req.ip,
        path: req.path
      });
      return next(new AppError('Invalid token type', 401));
    }

    // Get user and verify they still exist and are active
    const user = await User.findById(decoded.userId).select('+refreshToken');
    
    if (!user) {
      logger.warn('Token for non-existent user', {
        userId: decoded.userId,
        ip: req.ip,
        path: req.path
      });
      return next(new AppError('User no longer exists', 401));
    }
    
    if (!user.isActive) {
      logger.warn('Token for inactive user', {
        userId: user._id,
        ip: req.ip,
        path: req.path
      });
      return next(new AppError('User account is deactivated', 401));
    }

    // Check if password was changed after token was issued
    if (user.passwordChangedAt && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
      logger.warn('Token issued before password change', {
        userId: user._id,
        tokenIat: new Date(decoded.iat * 1000),
        passwordChangedAt: user.passwordChangedAt,
        ip: req.ip
      });
      return next(new AppError('Password was changed recently. Please login again.', 401));
    }

    // Store user and token in request
    req.user = user;
    req.token = token;
    req.tokenPayload = decoded;
    
    // Update last activity (optional, for session management)
    if (user.activeSessions) {
      user.updateSessionActivity(decoded.sessionId);
      // Don't await this to avoid slowing down requests
      user.save().catch(err => logger.error('Failed to update session activity:', err));
    }

    logger.debug('Authentication successful', {
      userId: user._id,
      username: user.username,
      role: user.role,
      path: req.path
    });
    
    next();
  } catch (error) {
    logger.errorWithContext(error, { 
      middleware: 'authenticate',
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    next(new AppError('Authentication failed', 401));
  }
};

// Role-based authorization middleware
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        logger.warn('Authorization attempted without authentication', {
          ip: req.ip,
          path: req.path
        });
        return next(new AppError('Authentication required', 401));
      }

      if (!allowedRoles.includes(req.user.role)) {
        logger.warn('Unauthorized access attempt', {
          userId: req.user._id,
          userRole: req.user.role,
          requiredRoles: allowedRoles,
          endpoint: req.originalUrl,
          method: req.method,
          ip: req.ip
        });
        return next(new AppError('Insufficient permissions', 403));
      }

      logger.debug('Authorization successful', {
        userId: req.user._id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path
      });

      next();
    } catch (error) {
      logger.errorWithContext(error, {
        middleware: 'authorize',
        userId: req.user?._id,
        requiredRoles: allowedRoles
      });
      next(new AppError('Authorization failed', 500));
    }
  };
};

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
  try {
    await authenticate(req, res, (error) => {
      // Don't propagate authentication errors in optional auth
      if (error && (error.statusCode === 401 || error.statusCode === 403)) {
        req.user = null;
        logger.debug('Optional authentication failed, continuing without user', {
          path: req.path,
          error: error.message
        });
        return next();
      }
      next(error);
    });
  } catch (error) {
    req.user = null;
    logger.debug('Optional authentication error, continuing without user', {
      path: req.path,
      error: error.message
    });
    next();
  }
};

// Revoke token (add to blacklist)
export const revokeToken = (token) => {
  if (token) {
    tokenBlacklist.add(token);
    logger.info('Token revoked', {
      tokenPreview: token.substring(0, 20) + '...'
    });
  }
};

// Clear token blacklist (for cleanup)
export const clearTokenBlacklist = () => {
  const size = tokenBlacklist.size;
  tokenBlacklist.clear();
  logger.info('Token blacklist cleared', { previousSize: size });
};

// Get blacklist size (for monitoring)
export const getBlacklistSize = () => {
  return tokenBlacklist.size;
};

// Resource ownership middleware
export const requireOwnership = (resourceField = 'userId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', 401));
      }

      // Admin can access any resource
      if (req.user.role === 'admin') {
        return next();
      }

      // Check if user owns the resource
      const resourceUserId = req.params[resourceField] || req.body[resourceField] || req.query[resourceField];
      
      if (resourceUserId && resourceUserId.toString() !== req.user._id.toString()) {
        logger.warn('Resource ownership violation', {
          userId: req.user._id,
          requestedResource: resourceUserId,
          path: req.path
        });
        return next(new AppError('Access denied to this resource', 403));
      }

      next();
    } catch (error) {
      logger.errorWithContext(error, {
        middleware: 'requireOwnership',
        userId: req.user?._id,
        resourceField
      });
      next(new AppError('Resource ownership check failed', 500));
    }
  };
};

export default {
  authenticate,
  authorize,
  optionalAuth,
  revokeToken,
  clearTokenBlacklist,
  getBlacklistSize,
  requireOwnership
};