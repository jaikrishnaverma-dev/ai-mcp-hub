# Coding Standards

## TypeScript

- Strict mode always (`"strict": true` in tsconfig)
- No `any` type — use `unknown` and narrow, or define proper types
- Use `type` for data shapes, `interface` for contracts that can be extended
- Prefer `const` over `let`; never use `var`
- Use `enum` sparingly — prefer `as const` objects or union types
- Return types must be explicit on public functions
- Use `satisfies` for type checking object literals

## File Organization

```
module/
├── model.ts      # Mongoose schema + model export
├── service.ts    # All business logic
├── types.ts      # TypeScript interfaces/types
├── schemas.ts    # Zod input/output schemas
├── tools.ts      # MCP tool definitions + handlers
├── routes.ts     # REST API route handlers
└── __tests__/    # Tests for this module
```

## Mongoose Models

```typescript
// Always define schema + interface separately
interface IItem {
  title: string;
  // ...
}

const itemSchema = new Schema<IItem>({
  title: { type: String, required: true },
  // ...
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes in the schema file
itemSchema.index({ ownerId: 1, type: 1, status: 1, deletedAt: 1 });
```

## Zod Schemas

```typescript
// Input schemas: what the tool/API accepts
export const createTaskInput = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  parentId: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low', 'none']).default('medium'),
  dueAt: z.string().datetime().optional(),
  reason: z.string().max(1000).optional(),
});

// Output schemas: what we return (for validation + documentation)
export const itemSummary = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.string(),
  dueAt: z.string().nullable(),
  parentTitle: z.string().nullable(),
});
```

## Error Handling

- Use custom error classes: `NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`
- Service methods throw typed errors; handlers catch and format
- MCP tools return error in the content array with `isError: true`
- Never expose internal error details (stack traces, DB errors) to clients
- Log the full error server-side at `error` level

## Logging (Pino)

- `info` — request lifecycle, tool calls, key operations
- `warn` — recoverable issues, deprecation warnings
- `error` — unrecoverable issues, unexpected failures
- `debug` — query details, timing, intermediate values
- **NEVER log** tokens, passwords, full item bodies, or PII at info level

## Tool Handler Pattern

```typescript
export const createTaskTool: McpTool = {
  name: 'create_task',
  description: 'Create a new task. Optionally assign to a story via parentId.',
  inputSchema: zodToJsonSchema(createTaskInput),
  handler: async (args, context) => {
    // 1. Validate
    const input = createTaskInput.parse(args);
    
    // 2. Call service
    const result = await itemsService.createTask(input, context);
    
    // 3. Format response
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result),
      }],
    };
  },
};
```
