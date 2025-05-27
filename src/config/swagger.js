import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BPM System API',
      version: '1.0.0',
      description: 'Business Process Management System REST API',
      contact: {
        name: 'API Support',
        email: 'support@bpm-system.com'
      }
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js', './src/models/*.js']
};

const specs = swaggerJsdoc(options);
export default specs;