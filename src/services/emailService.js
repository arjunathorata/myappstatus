import nodemailer from 'nodemailer';
import config from '../config/environment.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/helpers.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  // Initialize email transporter
  initializeTransporter() {
    try {
      if (!config.email.auth.user || !config.email.auth.pass) {
        logger.warn('Email configuration incomplete, email service disabled');
        return;
      }

      this.transporter = nodemailer.createTransporter({
        service: config.email.service,
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
          user: config.email.auth.user,
          pass: config.email.auth.pass
        },
        tls: {
          rejectUnauthorized: false // For development only
        }
      });

      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('Email service initialization failed:', error);
        } else {
          logger.info('Email service initialized successfully');
        }
      });
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
    }
  }

  // Send basic email
  async sendEmail({ to, subject, text, html, attachments = [] }) {
    try {
      if (!this.transporter) {
        logger.warn('Email transporter not initialized');
        return;
      }

      const mailOptions = {
        from: `"MyAppStatus System" <${config.email.auth.user}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        text,
        html,
        attachments
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully to ${to}:`, result.messageId);
      return result;
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw new AppError('Failed to send email', 500);
    }
  }

  // Send templated email
  async sendTemplatedEmail(emailData, templateData) {
    try {
      const { template } = emailData;
      const html = this.generateEmailTemplate(template, templateData);
      
      await this.sendEmail({
        ...emailData,
        html
      });
    } catch (error) {
      logger.error('Failed to send templated email:', error);
      throw error;
    }
  }

  // Generate email template
  generateEmailTemplate(templateName, data) {
    const templates = {
      'task-assignment': this.getTaskAssignmentTemplate(data),
      'task-reminder': this.getTaskReminderTemplate(data),
      'process-completion': this.getProcessCompletionTemplate(data),
      'task-escalation': this.getTaskEscalationTemplate(data),
      'system-notification': this.getSystemNotificationTemplate(data),
      'daily-digest': this.getDailyDigestTemplate(data),
      'welcome': this.getWelcomeTemplate(data),
      'password-reset': this.getPasswordResetTemplate(data)
    };

    return templates[templateName] || this.getGenericTemplate(data);
  }

  // Task assignment email template
  getTaskAssignmentTemplate(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Task Assignment</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
          .header { background-color: #007bff; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; }
          .button { background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
          .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Task Assigned</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>You have been assigned a new task:</p>
            <h3>${data.notificationTitle}</h3>
            <p>${data.notificationMessage}</p>
            <p><strong>Priority:</strong> ${data.priority}</p>
            <a href="${data.actionUrl}" class="button">View Task</a>
            <p>Please complete this task at your earliest convenience.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from MyAppStatus System.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Task reminder email template
  getTaskReminderTemplate(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Task Reminder</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; }
          .button { background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
          .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Task Overdue</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <div class="warning">
              <strong>⚠️ Your task is overdue!</strong>
            </div>
            <h3>${data.notificationTitle}</h3>
            <p>${data.notificationMessage}</p>
            <p><strong>Priority:</strong> ${data.priority}</p>
            <a href="${data.actionUrl}" class="button">Complete Task Now</a>
            <p>Please complete this task immediately to avoid further escalation.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from MyAppStatus System.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Daily digest email template
  getDailyDigestTemplate(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Daily Task Digest</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
          .header { background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; }
          .stats { display: flex; justify-content: space-around; margin: 20px 0; }
          .stat { text-align: center; padding: 15px; background-color: #f8f9fa; border-radius: 5px; }
          .task-item { border-bottom: 1px solid #eee; padding: 10px 0; }
          .button { background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
          .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Daily Task Digest</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>Here's your daily task summary:</p>
            
            <div class="stats">
              <div class="stat">
                <h3>${data.pendingTasks}</h3>
                <p>Pending Tasks</p>
              </div>
              <div class="stat">
                <h3>${data.overdueTasks}</h3>
                <p>Overdue Tasks</p>
              </div>
            </div>

            ${data.tasks && data.tasks.length > 0 ? `
              <h3>Your Top Tasks:</h3>
              ${data.tasks.map(task => `
                <div class="task-item">
                  <strong>${task.name}</strong><br>
                  <small>Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}</small>
                </div>
              `).join('')}
            ` : ''}

            <a href="${data.systemUrl}/dashboard" class="button">Go to Dashboard</a>
          </div>
          <div class="footer">
            <p>This is an automated message from MyAppStatus System.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Welcome email template
  getWelcomeTemplate(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to MyAppStatus</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
          .header { background-color: #007bff; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; }
          .button { background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
          .info-box { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to MyAppStatus</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>Welcome to MyAppStatus System! Your account has been created successfully.</p>
            
            <div class="info-box">
              <h3>Account Details:</h3>
              <p><strong>Username:</strong> ${data.username}</p>
              <p><strong>Email:</strong> ${data.email}</p>
              <p><strong>Role:</strong> ${data.role}</p>
              ${data.tempPassword ? `<p><strong>Temporary Password:</strong> ${data.tempPassword}</p>` : ''}
            </div>

            ${data.tempPassword ? `
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p><strong>Important:</strong> Please change your password after your first login for security reasons.</p>
              </div>
            ` : ''}

            <a href="${data.systemUrl}/login" class="button">Login to MyAppStatus</a>
            
            <p>If you have any questions, please contact our support team.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from MyAppStatus System.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Password reset email template
  getPasswordResetTemplate(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Password Reset</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; }
          .button { background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
          .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>You have requested to reset your password for your MyAppStatus account.</p>
            
            <a href="${data.resetUrl}" class="button">Reset Password</a>
            
            <p>Or copy and paste this link in your browser:</p>
            <p><a href="${data.resetUrl}">${data.resetUrl}</a></p>

            <div class="warning">
              <p><strong>Security Notice:</strong></p>
              <ul>
                <li>This link will expire in 10 minutes</li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>Your password will remain unchanged until you create a new one</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>This is an automated message from MyAppStatus System.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Generic email template
  getGenericTemplate(data) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${data.notificationTitle}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
          .header { background-color: #6c757d; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; }
          .button { background-color: #6c757d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
          .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${data.notificationTitle}</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>${data.notificationMessage}</p>
            <p><strong>Type:</strong> ${data.notificationType}</p>
            <p><strong>Priority:</strong> ${data.priority}</p>
            ${data.actionUrl ? `<a href="${data.actionUrl}" class="button">View Details</a>` : ''}
          </div>
          <div class="footer">
            <p>This is an automated message from MyAppStatus System.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Process completion email template
  getProcessCompletionTemplate(data) {
    return this.getGenericTemplate(data);
  }

  // Task escalation email template
  getTaskEscalationTemplate(data) {
    return this.getTaskReminderTemplate(data);
  }

  // System notification email template
  getSystemNotificationTemplate(data) {
    return this.getGenericTemplate(data);
  }
}

export default new EmailService();