import mongoose from 'mongoose';

const stepSchema = new mongoose.Schema({
  stepId: {
    type: String,
    required: true
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
  assigneeType: {
    type: String,
    enum: ['user', 'role', 'department', 'auto'],
    default: 'user'
  },
  assignees: [{
    type: String,
    trim: true
  }],
  formSchema: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  autoComplete: {
    type: Boolean,
    default: false
  },
  timeLimit: {
    type: Number, // in hours
    min: 0
  },
  escalation: {
    enabled: {
      type: Boolean,
      default: false
    },
    timeLimit: {
      type: Number, // in hours
      min: 0
    },
    escalateTo: [{
      type: String,
      trim: true
    }]
  },
  nextSteps: [{
    condition: {
      type: String,
      trim: true
    },
    stepId: {
      type: String,
      required: true
    }
  }],
  position: {
    x: {
      type: Number,
      default: 0
    },
    y: {
      type: Number,
      default: 0
    }
  }
});

const processTemplateSchema = new mongoose.Schema({
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
  version: {
    type: String,
    required: true,
    default: '1.0.0'
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  steps: [stepSchema],
  startStep: {
    type: String,
    required: true
  },
  endSteps: [{
    type: String,
    required: true
  }],
  variables: [{
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['string', 'number', 'boolean', 'date', 'object'],
      default: 'string'
    },
    defaultValue: mongoose.Schema.Types.Mixed,
    required: {
      type: Boolean,
      default: false
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  publishedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
processTemplateSchema.index({ name: 1, version: 1 }, { unique: true });
processTemplateSchema.index({ category: 1, isActive: 1 });
processTemplateSchema.index({ createdBy: 1 });
processTemplateSchema.index({ tags: 1 });

// Virtual for instance count
processTemplateSchema.virtual('instanceCount', {
  ref: 'ProcessInstance',
  localField: '_id',
  foreignField: 'processTemplateId',
  count: true
});

// Validate that startStep exists in steps
processTemplateSchema.pre('save', function(next) {
  const startStepExists = this.steps.some(step => step.stepId === this.startStep);
  if (!startStepExists) {
    return next(new Error('Start step must exist in the steps array'));
  }
  
  // Validate that all endSteps exist in steps
  const stepIds = this.steps.map(step => step.stepId);
  const invalidEndSteps = this.endSteps.filter(endStep => !stepIds.includes(endStep));
  if (invalidEndSteps.length > 0) {
    return next(new Error(`End steps not found in steps array: ${invalidEndSteps.join(', ')}`));
  }
  
  next();
});

export default mongoose.model('ProcessTemplate', processTemplateSchema);