import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isInternal: {
    type: Boolean,
    default: false
  }
});

const stepInstanceSchema = new mongoose.Schema({
  processInstanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProcessInstance',
    required: true
  },
  stepId: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['user_task', 'service_task', 'decision', 'parallel', 'exclusive', 'start', 'end'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'skipped', 'failed', 'cancelled'],
    default: 'pending'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedRole: {
    type: String,
    trim: true
  },
  assignedDepartment: {
    type: String,
    trim: true
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  dueDate: {
    type: Date
  },
  formData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  comments: [commentSchema],
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  escalated: {
    type: Boolean,
    default: false
  },
  escalationLevel: {
    type: Number,
    default: 0,
    min: 0
  },
  escalationHistory: [{
    level: {
      type: Number,
      required: true
    },
    escalatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    escalatedAt: {
      type: Date,
      default: Date.now
    },
    reason: {
      type: String,
      trim: true
    }
  }],
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  variables: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
stepInstanceSchema.index({ processInstanceId: 1, stepId: 1 });
stepInstanceSchema.index({ assignedTo: 1, status: 1 });
stepInstanceSchema.index({ status: 1, dueDate: 1 });
stepInstanceSchema.index({ assignedRole: 1, status: 1 });
stepInstanceSchema.index({ assignedDepartment: 1, status: 1 });

// Virtual for duration
stepInstanceSchema.virtual('duration').get(function() {
  if (this.startDate && this.endDate) {
    return this.endDate.getTime() - this.startDate.getTime();
  }
  return null;
});

// Virtual for overdue status
stepInstanceSchema.virtual('isOverdue').get(function() {
  return this.dueDate && new Date() > this.dueDate && !['completed', 'skipped', 'cancelled'].includes(this.status);
});

// Method to check if step can be completed
stepInstanceSchema.methods.canComplete = function(userId) {
  if (this.status !== 'in_progress') return false;
  if (this.assignedTo && !this.assignedTo.equals(userId)) return false;
  return true;
};

// Method to add comment
stepInstanceSchema.methods.addComment = function(userId, comment, isInternal = false) {
  this.comments.push({
    userId,
    comment,
    isInternal,
    timestamp: new Date()
  });
  return this.save();
};

export default mongoose.model('StepInstance', stepInstanceSchema);