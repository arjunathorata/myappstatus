import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import config from '../config/environment.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';

class AuthController {
  // Generate JWT tokens
  generateTokens(userId) {
    const accessToken = jwt.sign(
      { userId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      config.jwt.secret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    return { accessToken, refreshToken };
  }

  // Register new user
  async register(req, res, next) {
    try {
      const { username, email, password, profile, role } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }]
      });

      if (existingUser) {
        if (existingUser.email === email) {
          throw new AppError('Email already registered', 400);
        }
        throw new AppError('Username already taken', 400);
      }

      // Create new user
      const user = new User({
        username,
        email,
        password,
        profile,
        role: role || 'user'
      });

      await user.save();

      // Generate tokens
      const { accessToken, refreshToken } = this.generateTokens(user._id);

      // Save refresh token
      user.refreshToken = refreshToken;
      await user.save();

      logger.info(`New user registered: ${email}`);

      res.status(201).json({
        status: 'success',
        message: 'User registered successfully',
        data: {
          user: user.toJSON(),
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Login user
  async login(req, res, next) {
    try {
      const { email, password, rememberMe } = req.body;

      // Find user by email
      const user = await User.findOne({ email }).select('+password');

      if (!user || !(await user.comparePassword(password))) {
        throw new AppError('Invalid email or password', 401);
      }

      if (!user.isActive) {
        throw new AppError('Account is deactivated', 401);
      }

      // Generate tokens
      const { accessToken, refreshToken } = this.generateTokens(user._id);

      // Save refresh token and update last login
      user.refreshToken = refreshToken;
      user.lastLogin = new Date();
      await user.save();

      logger.info(`User logged in: ${email}`);

      res.json({
        status: 'success',
        message: 'Login successful',
        data: {
          user: user.toJSON(),
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Refresh access token
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new AppError('Refresh token is required', 400);
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.secret);

      if (decoded.type !== 'refresh') {
        throw new AppError('Invalid refresh token', 401);
      }

      // Find user and verify refresh token
      const user = await User.findById(decoded.userId);

      if (!user || user.refreshToken !== refreshToken) {
        throw new AppError('Invalid refresh token', 401);
      }

      if (!user.isActive) {
        throw new AppError('Account is deactivated', 401);
      }

      // Generate new tokens
      const tokens = this.generateTokens(user._id);

      // Update refresh token
      user.refreshToken = tokens.refreshToken;
      await user.save();

      res.json({
        status: 'success',
        message: 'Token refreshed successfully',
        data: tokens
      });
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return next(new AppError('Invalid refresh token', 401));
      }
      next(error);
    }
  }

  // Logout user
  async logout(req, res, next) {
    try {
      const user = await User.findById(req.user._id);
      
      if (user) {
        user.refreshToken = null;
        await user.save();
      }

      logger.info(`User logged out: ${req.user.email}`);

      res.json({
        status: 'success',
        message: 'Logout successful'
      });
    } catch (error) {
      next(error);
    }
  }

  // Get current user
  async getCurrentUser(req, res, next) {
    try {
      const user = await User.findById(req.user._id)
        .select('-refreshToken');

      res.json({
        status: 'success',
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  }

  // Change password
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user._id;

      const user = await User.findById(userId).select('+password');

      if (!user || !(await user.comparePassword(currentPassword))) {
        throw new AppError('Current password is incorrect', 400);
      }

      user.password = newPassword;
      user.refreshToken = null; // Invalidate all sessions
      await user.save();

      logger.info(`Password changed for user: ${user.email}`);

      res.json({
        status: 'success',
        message: 'Password changed successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // Forgot password (placeholder - implement with email service)
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });

      if (!user) {
        // Don't reveal whether email exists or not
        return res.json({
          status: 'success',
          message: 'If the email exists, a reset link has been sent'
        });
      }

      // Generate reset token (implement email sending logic)
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Store reset token with expiration (implement in User model)
      // user.passwordResetToken = resetToken;
      // user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
      // await user.save();

      logger.info(`Password reset requested for: ${email}`);

      res.json({
        status: 'success',
        message: 'If the email exists, a reset link has been sent'
      });
    } catch (error) {
      next(error);
    }
  }

  // Reset password (placeholder)
  async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body;

      // Implement token verification and password reset logic
      
      res.json({
        status: 'success',
        message: 'Password reset successful'
      });
    } catch (error) {
      next(error);
    }
  }

  // Verify token
  async verifyToken(req, res, next) {
    try {
      // If we reach here, the token is valid (middleware already verified it)
      const user = await User.findById(req.user._id)
        .select('-refreshToken');

      res.json({
        status: 'success',
        message: 'Token is valid',
        data: {
          user,
          valid: true
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Check authentication status (with optional auth)
  async checkAuth(req, res, next) {
    try {
      if (req.user) {
        const user = await User.findById(req.user._id)
          .select('-refreshToken');

        res.json({
          status: 'success',
          data: {
            authenticated: true,
            user
          }
        });
      } else {
        res.json({
          status: 'success',
          data: {
            authenticated: false,
            user: null
          }
        });
      }
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();