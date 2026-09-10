# Phase 8: LEARN — Skills Feedback Loop - Validation Strategy

**Phase:** 08 - LEARN — Skills Feedback Loop
**Date:** 2026-09-09
**Status:** Approved

## Validation Strategy & Test Requirements

### Automated Verification Coverage
- **Unit Tests**:
  - Prompt construction verifying untrusted context isolation in `<learning_source_context>` tags.
  - Parsing and structural validation of generated `SKILL.md` (frontmatter, sections, markdown headers).
  - Normalization of skill names (`${domain}-${topic}`).
  - SQLite persistence in `skills_prs` table.
- **Integration Tests**:
  - Full learning pipeline runner:
    1. Harvests lifecycle data from SQLite (`reworkCycles`, `l3Evidence`, `qaRuns`, `telemetryEvaluations`).
    2. Synthesizes `SKILL.md` with prompt-injection defense.
    3. Provisions ephemeral worktree on `skills/learn-ticket-${id}` branch and writes `skills/${name}/SKILL.md`.
    4. Creates Azure Repos Pull Request with `AB#<id>` title and registers `ArtifactLink`.
    5. Posts sanitized discussion comment with loop shield `<!-- [automated-agent] -->`.
    6. Verifies direct commit to `main` is NOT executed.

### Exit Criteria
- `npm test` passes cleanly with all new Phase 8 test suites.
- TypeScript compiles cleanly (`npx tsc --noEmit`).
