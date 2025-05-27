#!/usr/bin/env node

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create necessary directories
const directories = [
  'logs',
  'uploads',
  'uploads/temp',
  'uploads/processes',
  'uploads/steps',
  'uploads/users'
];

console.log('🚀 Starting MyAppStatus setup...');

directories.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.log('⚠️  .env file not found. Please copy .env.example to .env and configure your settings.');
  process.exit(1);
}

console.log('✅ Setup completed successfully!');
console.log('🏃 Starting application...\n');

// Start the application
import('../src/app.js');