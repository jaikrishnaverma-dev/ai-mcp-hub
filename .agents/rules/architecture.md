# Architecture Rules

## Data Model Invariants

1. **Item is polymorphic.** Use Mongoose discriminators for `goal`, `story`, `task`, `subtask`, `note`, `event`. Never create separate collections for each type.

2. **Hierarchy is strict.** Goal → Story → Task → Subtask. Enforce `parentId` type constraints:
   - Goal: no parent (top-level)
   - Story: parent must be Goal
   - Task: parent must be Story
   - Subtask: parent must be Task

3. **Cross-story Links are allowed.** Links can connect items across different stories and goals. Links are separate from hierarchy.

4. **Cycle prevention is mandatory.** Before creating any `depends_on` or `blocks` link, run `$graphLookup` to detect cycles. Reject with clear error.

5. **Soft delete cascades.** When soft-deleting a parent, soft-delete all children. When restoring, restore children too.

6. **Activity is append-only.** Never update or delete Activity documents. They are the audit trail.

## Service Layer Rules

1. **All business logic lives in `service.ts`.** Tool handlers and route handlers are thin wrappers.
2. **Services receive a `context` object** with `userId`, `actorType` (user/ai/system), and `endpointScopes`.
3. **Permission checks happen in the service**, not in middleware or handlers.
4. **Every service write method** must create an Activity record in the same transaction.
5. **Services return typed response objects**, not Mongoose documents.

## MCP Endpoint Rules

1. **One MCP transport instance, multiple logical endpoints.** Route by `endpointSlug` in the URL.
2. **Endpoint resolver loads** `toolAllowlist`, `instructions`, and `scopes` before any tool call.
3. **Instructions are returned** via the MCP `initialize` response or `resources/read`.
4. **Tool descriptions must be clear and concise.** The AI picks tools based on descriptions.
5. **Confirmation tokens** for destructive ops expire in 60 seconds. Store in Redis, not MongoDB.

## MongoDB Patterns

1. **Always use replica set** (even in dev) for transaction support.
2. **Indexes are defined in the model file**, not applied manually.
3. **Use `$graphLookup`** for dependency chains, not recursive JS queries.
4. **Lean queries** (`.lean()`) for read-only operations to skip Mongoose overhead.
5. **Pagination** via `skip/limit` for small datasets; cursor-based for large datasets (P3+).
