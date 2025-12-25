/**
 * Simple test to verify core execution works.
 *
 * Run with: bun src/core/test.ts
 */

import { start, getRunMessages, getRun } from './run-manager';
import type { StartParams } from '../types';

async function testBasicExecution() {
  console.log('Testing basic execution...\n');

  const params: StartParams = {
    cwd: process.cwd(),
    prompt: 'What is 2+2? Be concise.',
    options: {
      model: 'claude-sonnet-4-20250514',
      maxTurns: 1,
    },
  };

  console.log('Starting run with params:', params);
  console.log('');

  const result = await start(params);

  console.log('Run completed!');
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('');

  // Fetch the run from DB
  const runRecord = await getRun(result.runId);
  console.log('Run record from DB:', JSON.stringify(runRecord, null, 2));
  console.log('');

  // Fetch messages
  const messages = await getRunMessages(result.runId);
  console.log(`Retrieved ${messages.length} messages from DB`);
  console.log('Message types:', messages.map(m => m.type).join(', '));
}

testBasicExecution().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
