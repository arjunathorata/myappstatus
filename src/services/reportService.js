import ProcessInstance from '../models/ProcessInstance.js';
import StepInstance from '../models/StepInstance.js';
import ProcessTemplate from '../models/ProcessTemplate.js';
import User from '../models/User.js';
import ProcessHistory from '../models/ProcessHistory.js';
import logger from '../utils/logger.js';
import { formatDuration } from '../utils/helpers.js';

class ReportService {
  // Generate process performance report
  async generateProcessPerformanceReport(filters = {}) {
    try {
      const {
        startDate,
        endDate,
        processTemplateId,
        status,
        department
      } = filters;

      const query = {};
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }
      
      if (processTemplateId) query.processTemplateId = processTemplateId;
      if (status) query.status = status;

      const processes = await ProcessInstance.find(query)
        .populate('processTemplateId', 'name category')
        .populate('initiatedBy', 'username profile.firstName profile.lastName profile.department')
        .lean();

      // Filter by department if specified
      const filteredProcesses = department 
        ? processes.filter(p => p.initiatedBy?.profile?.department === department)
        : processes;

      const report = {
        summary: {
          totalProcesses: filteredProcesses.length,
          completedProcesses: filteredProcesses.filter(p => p.status === 'completed').length,
          activeProcesses: filteredProcesses.filter(p => p.status === 'active').length,
          cancelledProcesses: filteredProcesses.filter(p => p.status === 'cancelled').length
        },
        performanceMetrics: await this.calculatePerformanceMetrics(filteredProcesses),
        templateBreakdown: await this.getTemplateBreakdown(filteredProcesses),
        departmentBreakdown: await this.getDepartmentBreakdown(filteredProcesses),
        timeAnalysis: await this.getTimeAnalysis(filteredProcesses),
        generatedAt: new Date(),
        filters
      };

      logger.info(`Process performance report generated with ${filteredProcesses.length} processes`);
      return report;
    } catch (error) {
      logger.error('Failed to generate process performance report:', error);
      throw error;
    }
  }

  // Generate user productivity report
  async generateUserProductivityReport(filters = {}) {
    try {
      const {
        startDate,
        endDate,
        userId,
        department,
        role
      } = filters;

      const dateQuery = {};
      if (startDate || endDate) {
        dateQuery.endDate = {};
        if (startDate) dateQuery