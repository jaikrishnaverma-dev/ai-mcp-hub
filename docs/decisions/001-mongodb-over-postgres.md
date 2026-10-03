# ADR-001: MongoDB over PostgreSQL

**Date:** 2026-10-04
**Status:** Accepted
**Context:** Needed to choose between PostgreSQL (default in plan.md) and MongoDB for the primary database.

## Decision

Use **MongoDB** with Mongoose and replica set (for transactions).

## Rationale

1. Developer (Jai) is more comfortable with MongoDB from MERN stack experience
2. Flexible schema fits the evolving data model — the `Item` type will grow
3. `$graphLookup` provides native dependency chain traversal (better than recursive CTEs for our graph-like data)
4. JSONB-like flexibility comes free with MongoDB's document model
5. Schema validation shifts to app layer (Mongoose + Zod) — acceptable tradeoff

## Consequences

- Must run replica set even locally (required for transactions) — handled via Docker Compose
- Referential integrity is app-layer responsibility — enforced via Mongoose middleware + transactions
- No foreign key constraints — must be careful about orphaned documents
- Use `$graphLookup` instead of recursive SQL for dependency chains
