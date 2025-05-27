import mongoose from 'mongoose';
import logger from './logger.js';
import config from '../config/environment.js';

class Database {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000;
  }

  async connect() {
    try {
      const options = {
        maxPoolSize: config.database.maxPoolSize || 10,
        serverSelectionTimeoutMS: config.database.serverSelectionTimeoutMS || 5000,
        socketTimeoutMS: config.database.socketTimeoutMS || 45000,
        bufferMaxEntries: 0,
        bufferCommands: false,
        autoIndex: config.app.environment !== 'production'
      };

      // Add authentication if provided
      if (config.database.username && config.database.password) {
        options.auth = {
          username: config.database.username,
          password: config.database.password
        };
        options.authSource = config.database.authSource || 'admin';
      }

      logger.info('Connecting to MongoDB...', {
        uri: config.database.uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') // Hide credentials in logs
      });

      this.connection = await mongoose.connect(config.database.uri, options);
      this.isConnected = true;
      this.connectionAttempts = 0;

      this.setupEventListeners();

      logger.info('Successfully connected to MongoDB', {
        host: this.connection.connection.host,
        port: this.connection.connection.port,
        database: this.connection.connection.name
      });

      return this.connection;
    } catch (error) {
      this.isConnected = false;
      this.connectionAttempts++;
      
      logger.error('Failed to connect to MongoDB', {
        error: error.message,
        attempt: this.connectionAttempts,
        maxRetries: this.maxRetries
      });

      if (this.connectionAttempts < this.maxRetries) {
        logger.info(`Retrying connection in ${this.retryDelay / 1000} seconds...`);
        await this.delay(this.retryDelay);
        return this.connect();
      } else {
        logger.error('Max connection attempts reached.');
        throw error;
      }
    }
  }

  setupEventListeners() {
    const db = mongoose.connection;

    db.on('connected', () => {
      this.isConnected = true;
      logger.info('MongoDB connected');
    });

    db.on('error', (error) => {
      this.isConnected = false;
      logger.error('MongoDB connection error', { error: error.message });
    });

    db.on('disconnected', () => {
      this.isConnected = false;
      logger.warn('MongoDB disconnected');
    });

    db.on('reconnected', () => {
      this.isConnected = true;
      logger.info('MongoDB reconnected');
    });

    process.on('SIGINT', this.gracefulShutdown.bind(this));
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
  }

  async gracefulShutdown() {
    try {
      logger.info('Closing MongoDB connection...');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed successfully');
    } catch (error) {
      logger.error('Error during MongoDB shutdown', { error: error.message });
    }
  }

  async disconnect() {
    try {
      if (this.isConnected) {
        await mongoose.connection.close();
        this.isConnected = false;
        logger.info('Disconnected from MongoDB');
      }
    } catch (error) {
      logger.error('Error disconnecting from MongoDB', { error: error.message });
      throw error;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  }
}

export default new Database();