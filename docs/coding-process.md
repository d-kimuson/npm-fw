# Coding Process

## Recommended Coding Process

This project is designed with the philosophy of achieving both rapid feedback and code quality maintenance (passing checks = nearly guaranteed runtime correctness) by leveraging:

- Strict typing with ADT
- Constraints for maintaining code quality configured in Lint as much as possible
- Dependency injection and effective testing

For development, implement with TDD development style.

For checks, run `pnpm gatecheck check` to execute all checks against the diff at once, then proceed with implementation in a loop of problem detection and fixing with gatecheck.

## Definition of Done

On task completion, verify ALL of the following pass in addition to task-specific ACs.

```bash
pnpm gatecheck check
```

## Notable Commands

| Command          | Purpose                          |
| ---------------- | -------------------------------- |
| `pnpm dev`       | Start dev server (node)          |
| `pnpm cli`       | Run CLI (node)                   |
| `pnpm typecheck` | TypeScript type checking (tsgo)  |
| `pnpm lint`      | Run all linters (oxlint + oxfmt) |
| `pnpm fix`       | Auto-fix all lint issues         |
| `pnpm test`      | Run test suite (vitest)          |
| `pnpm prepare`   | Install lefthook git hooks       |
