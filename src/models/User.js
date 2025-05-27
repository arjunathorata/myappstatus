import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { USER_ROLES, VALIDATION_RULES } from '../utils/constants.js';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [VALIDATION_RULES.USERNAME.MIN_LENGTH, 'Username too short'],
    maxlength: [VALIDATION_RULES.USERNAME.MAX_LENGTH, 'Username too long'],
    match: [VALIDATION_RULES.USERNAME.PATTERN, 'Invalid username format'],
    index: true
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: [VALIDATION_RULES.EMAIL.MAX_LENGTH, 'Email too long'],
    match: [VALIDATION_RULES.EMAIL.PATTERN, 'Invalid email format'],
    index: true
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [VALIDATION_RULES.PASSWORD.MIN_LENGTH, 'Password too short'],
    maxlength: [VALIDATION_RULES.PASSWORD.MAX_LENGTH, 'Password too long'],
    select: false, // Don't include in queries by default
    validate: {
      validator: function(password) {
        // Skip validation on updates if password hasn't changed
        if (!this.isModified('password')) return true;
        return VALIDATION_RULES.PASSWORD.PATTERN.test(password);
      },
      message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }
  },
  
  // Fix: Add password security fields
  passwordChangedAt: {
    type: Date,
    default: Date.now
  },
  
  passwordResetToken: {
    type: String,
    select: false
  },
  
  passwordResetExpires: {
    type: Date,
    select: false
  },
  
  passwordHistory: [{
    hash: String,
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Fix: Account security
  loginAttempts: {
    type: Number,
    default: 0
  },
  
  lockUntil: {
    type: Date
  },
  
  // Fix: Multi-factor authentication
  mfaEnabled: {
    type: Boolean,
    default: false
  },
  
  mfaSecret: {
    type: String,
    select: false
  },
  
  // Fix: Session management
  activeSessions: [{
    sessionId: String,
    ipAddress: String,
    userAgent: String,
    createdAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now }
  }],
  
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.USER,
    index: true
  },
  
  profile: {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: [1, 'First name cannot be empty'],
      maxlength: [50, 'First name too long']
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: [1, 'Last name cannot be empty'],
      maxlength: [50, 'Last name too long']
    },
    department: {
      type: String,
      trim: true,
      maxlength: [100, 'Department name too long'],
      index: true
    },
    position: {
      type: String,
      trim: true,
      maxlength: [100, 'Position title too long']
    },
    phone: {
      type: String,
      trim: true,
      match: [VALIDATION_RULES.PHONE.PATTERN, 'Invalid phone number format']
    },
    avatar: {
      type: String,
      trim: true
    }
  },
  
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  emailVerificationToken: {
    type: String,
    select: false
  },
  
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  
  lastLogin: {
    type: Date,
    index: true
  },
  
  refreshToken: {
    type: String,
    select: false
  },
  
  // Fix: Notification preferences
  notificationPreferences: {
    emailNotifications: { type: Boolean, default: true },
    taskAssigned: { type: Boolean, default: true },
    taskOverdue: { type: Boolean, default: true },
    processCompleted: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    escalations: { type: Boolean, default: true },
    systemNotifications: { type: Boolean, default: true }
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.refreshToken;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      delete ret.mfaSecret;
      delete ret.passwordHistory;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Fix: Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Fix: Pre-save middleware for password hashing
userSchema.pre('save', async function(next) {
  try {
    // Only hash password if it has been modified
    if (!this.isModified('password')) return next();
    
    // Check password history (prevent reuse of last 5 passwords)
    if (this.passwordHistory && this.passwordHistory.length > 0) {
      for (const oldPassword of this.passwordHistory.slice(-5)) {
        const isMatch = await bcrypt.compare(this.password, oldPassword.hash);
        if (isMatch) {
          const error = new Error('Cannot reuse recent passwords');
          error.name = 'ValidationError';
          return next(error);
        }
      }
    }
    
    // Hash password with adaptive cost
    const saltRounds = process.env.NODE_ENV === 'production' ? 12 : 10;
    this.password = await bcrypt.hash(this.password, saltRounds);
    
    // Update password history
    if (!this.passwordHistory) this.passwordHistory = [];
    this.passwordHistory.push({
      hash: this.password,
      createdAt: new Date()
    });
    
    // Keep only last 5 passwords
    if (this.passwordHistory.length > 5) {
      this.passwordHistory = this.passwordHistory.slice(-5);
    }
    
    // Update password changed timestamp
    if (!this.isNew) {
      this.passwordChangedAt = new Date();
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Fix: Enhanced password comparison
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    // Check if account is locked
    if (this.isLocked) {
      throw new Error('Account is temporarily locked');
    }
    
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    
    if (isMatch) {
      // Reset login attempts on successful login
      if (this.loginAttempts > 0) {
        this.loginAttempts = 0;
        this.lockUntil = undefined;
        await this.save();
      }
      return true;
    } else {
      // Increment login attempts
      this.loginAttempts += 1;
      
      // Lock account after 5 failed attempts
      if (this.loginAttempts >= 5) {
        this.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      }
      
      await this.save();
      return false;
    }
  } catch (error) {
    throw error;
  }
};

// Fix: Generate password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  return resetToken;
};

// Fix: Session management methods
userSchema.methods.addSession = function(sessionId, ipAddress, userAgent) {
  if (!this.activeSessions) this.activeSessions = [];
  
  // Remove old sessions (keep only last 5)
  if (this.activeSessions.length >= 5) {
    this.activeSessions = this.activeSessions.slice(-4);
  }
  
  this.activeSessions.push({
    sessionId,
    ipAddress,
    userAgent,
    createdAt: new Date(),
    lastActivity: new Date()
  });
};

userSchema.methods.removeSession = function(sessionId) {
  if (!this.activeSessions) return;
  
  this.activeSessions = this.activeSessions.filter(
    session => session.sessionId !== sessionId
  );
};

userSchema.methods.updateSessionActivity = function(sessionId) {
  if (!this.activeSessions) return;
  
  const session = this.activeSessions.find(s => s.sessionId === sessionId);
  if (session) {
    session.lastActivity = new Date();
  }
};

// Fix: Indexes for performance
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ 'profile.department': 1, isActive: 1 });
userSchema.index({ lastLogin: -1 });
userSchema.index({ passwordResetExpires: 1 }, { sparse: true });

export default mongoose.model('User', userSchema);