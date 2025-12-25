import { db } from './db';
import { runTable, runMessageTable } from './db/schema';

// Test inserting a run
console.log("Testing database connection and schema...\n");

const testRun = {
  id: "test-run-1",
  cwd: "/test/path",
  sessionId: "session-123",
  parentSessionId: null,
  mode: "fresh",
  status: "running",
  prompt: "Test prompt",
  resultType: null,
  resultJson: null,
  durationMs: null,
  createdAt: new Date().toISOString(),
};

console.log("Inserting test run...");
await db.insert(runTable).values(testRun);

console.log("Querying runs...");
const runs = await db.select().from(runTable);
console.log("Runs:", runs);

// Test inserting a message
const testMessage = {
  runId: "test-run-1",
  index: 0,
  messageType: "user_message",
  messageJson: JSON.stringify({ content: "Hello" }),
  createdAt: new Date().toISOString(),
};

console.log("\nInserting test message...");
await db.insert(runMessageTable).values(testMessage);

console.log("Querying messages...");
const messages = await db.select().from(runMessageTable);
console.log("Messages:", messages);

console.log("\n✓ Database setup verified successfully!");
