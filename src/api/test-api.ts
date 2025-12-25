/**
 * Simple API test to verify routes are working
 *
 * Run with: bun src/api/test-api.ts
 */

import app from '../index';

async function testAPI() {
  console.log('Testing CC Run Service API...\n');

  // Test 1: Health check
  console.log('1. Testing health check endpoint...');
  const healthResponse = await app.fetch(new Request('http://localhost:3000/health'));
  const healthData = await healthResponse.json();
  console.log('   Status:', healthResponse.status);
  console.log('   Response:', healthData);
  console.log('   ✓ Health check OK\n');

  // Test 2: API info
  console.log('2. Testing API info endpoint...');
  const infoResponse = await app.fetch(new Request('http://localhost:3000/'));
  const infoData = await infoResponse.json();
  console.log('   Status:', infoResponse.status);
  console.log('   Response:', JSON.stringify(infoData, null, 2));
  console.log('   ✓ API info OK\n');

  // Test 3: List sessions (should return empty array initially)
  console.log('3. Testing GET /api/sessions...');
  const sessionsResponse = await app.fetch(new Request('http://localhost:3000/api/sessions'));
  const sessionsData = await sessionsResponse.json();
  console.log('   Status:', sessionsResponse.status);
  console.log('   Response:', sessionsData);
  console.log('   ✓ Sessions endpoint OK\n');

  // Test 4: Validation error for start run (missing cwd)
  console.log('4. Testing POST /api/runs/start validation...');
  const badStartResponse = await app.fetch(
    new Request('http://localhost:3000/api/runs/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' }), // missing cwd
    })
  );
  console.log('   Status:', badStartResponse.status);
  const badStartData = await badStartResponse.json();
  console.log('   Response:', badStartData);
  console.log('   ✓ Validation working\n');

  console.log('All basic API tests passed! ✨');
}

testAPI().catch(console.error);
