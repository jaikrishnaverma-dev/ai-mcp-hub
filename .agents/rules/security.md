# Security Rules

## Authentication & Authorization

1. **OAuth 2.1 + PKCE** for all MCP client connections. No API keys as the primary auth.
2. **Access tokens are short-lived** (15 minutes). Refresh tokens with rotation.
3. **Token audience is bound to endpoint.** A token for endpoint A cannot call tools on endpoint B.
4. **Service-layer authorization.** Every service method checks permissions. NEVER rely on:
   - Route middleware alone
   - Tool handler checks alone
   - MCP prompt instructions
5. **Data isolation.** Users see only their own data + explicitly shared items.

## Destructive Operations

1. **Two-step confirmation** for all destructive operations:
   ```
   Step 1: Client calls delete_task(taskId)
   → Server returns: { confirmToken, consequences: "This will also remove 3 subtasks" }
   
   Step 2: Client calls delete_task(taskId, confirmToken)
   → Server executes the soft delete
   ```
2. **Confirmation tokens:**
   - Stored in Redis with 60-second TTL
   - Bound to the specific operation + item + user
   - Single use (deleted after consumption)
3. **Ambiguous targets → ask, don't guess.** If "photographer" matches 3 tasks, return all candidates.

## Data Safety

1. **Soft delete only.** Every deletable model has `deletedAt: Date | null`.
2. **All queries filter `deletedAt: null`** by default. Use Mongoose middleware or query helpers.
3. **Activity log is append-only.** No updates, no deletes, no soft-delete on Activity.
4. **Backup-friendly.** Design so MongoDB `mongodump` captures everything needed for recovery.

## Input Handling

1. **Zod validation on every input** — tool args, API body, query params.
2. **String length limits** on all text fields (title: 500, body: 50000, reason: 1000).
3. **Sanitize markdown** before storing — strip dangerous HTML if rendered in portal.
4. **Rate limiting:** per-token (100 req/min) and per-user (500 req/min).

## Prompt Injection Defense

1. **Collaborator text is DATA.** When the AI reads a task created by another user, that text must never be interpreted as instructions.
2. **Item bodies are never injected into system prompts.** They're returned as tool results only.
3. **Skill instructions (P4)** are reviewed content, never user-submitted raw text executed as system prompt.

## Secrets & Logging

1. **Environment variables** for all secrets (DB URI, API keys, OAuth secrets).
2. **`.env` is in `.gitignore`.** Provide `.env.example` with placeholder values.
3. **Never log:** tokens, passwords, API keys, full item bodies (at info level), email addresses.
4. **Request IDs** on every log line for traceability.

## Audit Trail

Every AI-initiated write MUST record:
```json
{
  "actorType": "ai",
  "actorId": "<user-who-owns-the-token>",
  "action": "created|updated|deleted|completed",
  "changes": { "field": { "from": "old", "to": "new" } },
  "reason": "<optional reason from the AI>"
}
```
