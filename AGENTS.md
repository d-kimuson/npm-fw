# AGENTS.md (npm-fw)

## Architecture

npm-fw is a Hono-based Node.js backend framework. It provides a typed, composable HTTP API server.

```
Client Request
     │
     ▼
 main.ts (entry point)
     │
     ▼
 server.ts (startServer — @hono/node-server)
     │
     ▼
 app.ts (honoApp — typed Hono instance)
     │
     ▼
 routes.ts (route handlers)
     │
     ▼
 JSON Response
```

- **Hono** as the web framework — lightweight, fully typed, composable middleware/route model
- **Functional style** — no classes; plain data + pure functions. Mutable state only in function-scoped closures
- **Type-driven design** — discriminated unions for domain variants, `as const satisfies` for literal narrowing
- **Collocated tests** — unit tests (`*.test.ts`) next to their source files

## Reference

- Coding guideline (design philosophy): docs/coding-guideline.md
- Coding process and conventions: docs/coding-process.md
- Commit message conventions: docs/commit_message.md
- Branch naming conventions: docs/branch_naming.md
- E2E exploratory testing process: docs/e2e-exploratory-testing-process.md
