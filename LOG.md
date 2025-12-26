## Format

This is the implementation log of the project.
- Appends to the bottom of the file
- Changes to the log that modifies or overrides the previous entry must my appended not overwritten and referenced the entry that is it related to.

The log format is as follows:

1 <Date> <Task title>
    <Summary>
        Summary of the changes made
    </Summary>
    <ListOfChanges>
        - List of high level changes to the core module, files, api, etc Each item is marked as BREAKING, FEATURE, FIX, or MISC
        - Any changes that is related to previous entries must be referenced
    </ListOfChanges>
    <Note>
      - List of:
         - Inportant important flags to raise to other developers
         - Patterns established
         - Key piece of code that is established and would be useful to know so usability.
    </Note>

---

## 2025-12-26 Webhook Notifications Implementation

<Summary>
Implemented webhook notifications for run lifecycle events. Clients can now provide an optional webhook URL when starting, resuming, or forking runs to receive HTTP callbacks for run.started, run.completed, run.failed, and run.error events. The implementation uses a fire-and-forget pattern to ensure webhook failures never block run execution.
</Summary>

<ListOfChanges>
- FEATURE: Created `/src/core/webhook.ts` - Webhook dispatcher module with type-safe event definitions and dispatchWebhook() function
- FEATURE: Added webhookUrl optional field to StartParams, ResumeParams, ForkParams, and ActiveRun interfaces in `/src/types.ts`
- FEATURE: Added webhookUrl validation to startRunSchema, resumeRunSchema, and forkRunSchema in `/src/api/runs/schema.ts`
- FEATURE: Integrated webhook dispatching in `/src/core/run-manager.ts` for all run lifecycle events (started, completed, failed, error)
- MISC: Exported webhook module from `/src/core/index.ts`
</ListOfChanges>

<Note>
- Webhook Pattern: Fire-and-forget async dispatch with 10-second timeout using AbortController
- Native Bun API: Uses Bun's native fetch() for HTTP requests, no external libraries
- Error Isolation: Webhook failures are logged but never affect run execution or status
- Event Types: run.started (before execution), run.completed (SDK success), run.failed (SDK controlled errors), run.error (unhandled exceptions)
- Validation: Zod validates webhook URLs at API layer before run starts
- Optional Feature: When webhookUrl is omitted, no webhooks are sent (useful for polling clients)
- No Retry Logic: V1 keeps it simple - clients implement their own retry/idempotency if needed
- See `/docs/ARCHITECTURE.md` "Webhook Notifications" section for complete specification and payload structures
</Note>

---


