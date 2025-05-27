import mongoose from 'mongoose';

const processInstanceSchema = new mongoose.Schema({
  processTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProcessTemplate',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'cancelled', 'suspended'],
    default: 'draft'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  currentSteps: [{
    type: String,
    trim: true
  }],
  variables: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  tags: [{
    type: String,
    trim: true
  }],
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
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
processInstanceSchema.index({ processTemplateId: 1, status: 1 });
processInstanceSchema.index({ initiatedBy: 1, status: 1 });
processInstanceSchema.index({ status: 1, priority: 1 });
processInstanceSchema.index({ dueDate: 1, status: 1 });
processInstanceSchema.index({ currentSteps: 1 });

// Virtual for duration
processInstanceSchema.virtual('duration').get(function() {
  if (this.startDate && this.endDate) {
    return this.endDate.getTime() - this.startDate.getTime();
  }
  return null;
});

// Virtual for active step instances
processInstanceSchema.virtual('activeSteps', {
  ref: 'StepInstance',
  localField: '_id',
  foreignField: 'processInstanceId',
  match: { status: { $in: ['pending', 'in_progress'] } }
});

// Update completion percentage based on completed steps
processInstanceSchema.methods.updateCompletionPercentage = async function() {
  const StepInstance = mongoose.model('StepInstance');
  const totalSteps = await StepInstance.countDocuments({ processInstanceId: this._id });
  const completedSteps = await StepInstance.countDocuments({ 
    processInstanceId: this._id, 
    status: 'completed' 
  });
  
  this.completionPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  return this.save();
};

export default mongoose.model('ProcessInstance', processInstanceSchema);