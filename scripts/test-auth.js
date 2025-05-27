import jwt from 'jsonwebtoken';
import config from '../src/config/environment.js';

// Test token generation
const testPayload = {
  userId: '507f1f77bcf86cd799439011', // Example ObjectId
  username: 'testuser',
  role: 'user',
  type: 'access',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
};

try {
  const token = jwt.sign(testPayload, config.jwt.secret);
  console.log('Generated test token:');
  console.log('Bearer ' + token);
  
  // Verify the token
  const decoded = jwt.verify(token, config.jwt.secret);
  console.log('\nDecoded token:');
  console.log(decoded);
} catch (error) {
  console.error('Token test failed:', error.message);
}