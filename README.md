# BPM System - Business Process Management

A comprehensive Business Process Management system built with Express.js and MongoDB, designed to create, manage, and execute business processes with user workflow capabilities, status tracking, and complete API coverage.

## Features

- 🔐 **Authentication & Authorization** - JWT-based auth with role-based access control
- 📊 **Process Management** - Create, update, and manage business process templates
- ⚡ **Workflow Engine** - Execute processes with user tasks, service tasks, and decision gateways
- 👥 **User Management** - Comprehensive user and role management system
- 📝 **Task Management** - Assign, track, and complete tasks with escalation support
- 🔔 **Notifications** - Real-time notifications for process and task events
- 📈 **Analytics & Monitoring** - Dashboard with process and user statistics
- 🗂️ **File Management** - Attachment support for processes and tasks
- 📚 **API Documentation** - Complete Swagger/OpenAPI documentation

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Joi
- **Documentation**: Swagger/OpenAPI 3.0
- **Testing**: Jest + Supertest
- **Logging**: Winston
- **Background Jobs**: Bull Queue with Redis
- **Security**: Helmet, CORS, Rate Limiting

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- Redis (v6 or higher)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bpm-system