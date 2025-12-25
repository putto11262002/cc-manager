/**
 * Integration test demonstrating the full API flow
 *
 * NOTE: This requires ANTHROPIC_API_KEY to be set
 * Run with: ANTHROPIC_API_KEY=your-key bun src/api/integration-test.ts
 */

import { hc } from 'hono/client';
import type { AppType } from '../index';

async function integrationTest() {
  console.log('CC Run Service - Integration Test\n');
  console.log('NOTE: This will make real API calls to Claude\n');

  // Create typed client
  // Note: Type inference requires proper route chaining in the main app
  const client = hc<AppType>('http://localhost:3000') as any;

  // Start the server in the background
  const server = Bun.serve({
    port: 3000,
    fetch: (await import('../index')).default.fetch,
  });

  console.log(`Server started on port ${server.port}\n`);

  try {
    // 1. Start a fresh run
    console.log('1. Starting a fresh run...');
    const startResult = await client.api.runs.start.$post({
      json: {
        cwd: process.cwd(),
        prompt: 'What is 2+2? Just give me the answer, nothing else.',
        options: {
          model: 'claude-sonnet-4-20250514',
          maxTurns: 1,
        },
      },
    });

    const startData = await startResult.json();
    console.log('   Status:', startResult.status);
    console.log('   Run ID:', startData.runId);
    console.log('   Session ID:', startData.sessionId);
    console.log('   Duration:', startData.durationMs, 'ms');
    console.log('   ✓ Fresh run completed\n');

    const sessionId = startData.sessionId;

    // 2. Get run messages
    console.log('2. Getting run messages...');
    const messagesResult = await client.api.runs[':runId'].messages.$get({
      param: { runId: startData.runId },
    });

    const messages = await messagesResult.json();
    console.log('   Message count:', messages.length);
    console.log('   Message types:', messages.map((m: any) => m.type).join(', '));
    console.log('   ✓ Messages retrieved\n');

    // 3. Resume the session
    console.log('3. Resuming the session...');
    const resumeResult = await client.api.runs.resume.$post({
      json: {
        sessionId,
        prompt: 'What is 3+3?',
        options: {
          maxTurns: 1,
        },
      },
    });

    const resumeData = await resumeResult.json();
    console.log('   Status:', resumeResult.status);
    console.log('   Run ID:', resumeData.runId);
    console.log('   Session ID:', resumeData.sessionId);
    console.log('   Duration:', resumeData.durationMs, 'ms');
    console.log('   ✓ Resume completed\n');

    // 4. List all sessions
    console.log('4. Listing all sessions...');
    const sessionsResult = await client.api.sessions.$get();
    const sessions = await sessionsResult.json();
    console.log('   Total sessions:', sessions.length);
    const ourSession = sessions.find((s: any) => s.sessionId === sessionId);
    if (ourSession) {
      console.log('   Our session run count:', ourSession.runCount);
      console.log('   ✓ Session found\n');
    }

    // 5. Get session runs
    console.log('5. Getting session runs...');
    const runsResult = await client.api.sessions[':id'].runs.$get({
      param: { id: sessionId },
    });

    const runs = await runsResult.json();
    console.log('   Run count:', runs.length);
    console.log('   Modes:', runs.map((r: any) => r.mode).join(', '));
    console.log('   ✓ Session runs retrieved\n');

    // 6. Fork the session
    console.log('6. Forking the session...');
    const forkResult = await client.api.runs.fork.$post({
      json: {
        sessionId,
        prompt: 'What is 5+5?',
        options: {
          maxTurns: 1,
        },
      },
    });

    const forkData = await forkResult.json();
    console.log('   Status:', forkResult.status);
    console.log('   New Session ID:', forkData.sessionId);
    console.log('   Parent Session ID:', forkData.parentSessionId);
    console.log('   Duration:', forkData.durationMs, 'ms');
    console.log('   ✓ Fork completed\n');

    // 7. Get forked sessions
    console.log('7. Getting forked sessions...');
    const forksResult = await client.api.sessions[':id'].forks.$get({
      param: { id: sessionId },
    });

    const forks = await forksResult.json();
    console.log('   Fork count:', forks.length);
    console.log('   ✓ Forks retrieved\n');

    console.log('Integration test completed successfully! ✨');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    server.stop();
  }
}

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable not set');
  console.error('Run with: ANTHROPIC_API_KEY=your-key bun src/api/integration-test.ts');
  process.exit(1);
}

integrationTest().catch(console.error);
