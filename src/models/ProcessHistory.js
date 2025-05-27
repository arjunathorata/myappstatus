import mongoose from 'mongoose';

const processHistorySchema = new mongoose.Schema({
  processInstanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProcessInstance',
    required: true
  },
  stepInstanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StepInstance'
  },
  action: {
    type: String,
    required: true,
    enum: [
      'process_created',
      'process_started',
      'process_completed',
      'process_cancelled',
      'process_suspended',
      'process_resumed',
      'step_created',
      'step_started',
      'step_completed',
      'step_assigned',
      'step_reassigned',
      'step_escalated',
      'step_skipped',
      'step_failed',
      'comment_added',
      'attachment_added',
      'variable_updated'
    ]
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fromStatus: {
    type: String,
    trim: true
  },
  toStatus: {
    type: String,
    trim: true
  },
  comments: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Indexes
processHistorySchema.index({ processInstanceId: 1, timestamp: -1 });
processHistorySchema.index({ stepInstanceId: 1, timestamp: -1 });
processHistorySchema.index({ performedBy: 1, timestamp: -1 });
processHistorySchema.index({ action: 1, timestamp: -1 });

export default mongoose.model('ProcessHistory', processHistorySchema);