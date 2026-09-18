import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { GOLDEN_PATH_V2 } from '../src/pipeline/taxonomy.js';

describe('Authoritative ADO State Matrix Synchronization (TAX-02)', () => {
  it('strictly matches GOLDEN_PATH_V2 taxonomy definitions in ROADMAP.md', () => {
    const activeRoadmap = path.resolve(process.cwd(), '.planning/ROADMAP.md');
    const archivedRoadmap = path.resolve(process.cwd(), '.planning/milestones/v2.0-ROADMAP.md');
    const roadmapPath =
      fs.existsSync(activeRoadmap) &&
      fs.readFileSync(activeRoadmap, 'utf8').includes('## Authoritative ADO State Matrix')
        ? activeRoadmap
        : archivedRoadmap;
    const content = fs.readFileSync(roadmapPath, 'utf8');

    const matrixHeader = '## Authoritative ADO State Matrix (Golden Path v2 — 5 columns / 9 steps / L1–L7)';
    const headerIdx = content.indexOf(matrixHeader);
    expect(headerIdx).toBeGreaterThan(-1);

    const nextHeaderIdx = content.indexOf('\n## ', headerIdx + matrixHeader.length);
    const section = nextHeaderIdx === -1 ? content.slice(headerIdx) : content.slice(headerIdx, nextHeaderIdx);
    const tableLines = section
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.startsWith('| 1. REFINEMENT') ||
          l.startsWith('| 2. EXECUTION') ||
          l.startsWith('| 3. ACCEPTANCE') ||
          l.startsWith('| 4. RELEASE') ||
          l.startsWith('| 5. RETRO')
      );

    expect(tableLines).toHaveLength(GOLDEN_PATH_V2.length);

    tableLines.forEach((line, index) => {
      const stepDef = GOLDEN_PATH_V2[index];
      const rawCells = line.split('|').map((c) => c.trim());
      const cells = rawCells.slice(1, rawCells.length - 1);

      // Markdown row cells: [Column, Step, Actor, ADO State, Key Tags, Evidence, Gate/Hand-off]
      expect(cells[0]).toContain(stepDef.column);
      expect(cells[1]).toContain(stepDef.name);
      expect(cells[2]).toContain(stepDef.actor === 'AI' ? '⚡' : '👤');
      expect(cells[3]).toContain(stepDef.adoState);

      stepDef.evidenceLevels.forEach((level) => {
        expect(cells[5]).toContain(level);
      });

      if (stepDef.keyTags) {
        stepDef.keyTags.forEach((tag) => {
          expect(cells[4]).toContain(tag);
        });
      }
    });
  });

  it('guarantees no stale SQLite/Drizzle references remain in CLAUDE.md or active docs', () => {
    const claudePath = path.resolve(process.cwd(), 'CLAUDE.md');
    const claudeContent = fs.readFileSync(claudePath, 'utf8');
    expect(claudeContent).not.toMatch(/better-sqlite3/i);
    expect(claudeContent).not.toMatch(/drizzle-orm/i);
    expect(claudeContent).toContain('StateStore');

    const projectPath = path.resolve(process.cwd(), '.planning/PROJECT.md');
    const projectContent = fs.readFileSync(projectPath, 'utf8');
    expect(projectContent).toContain('5 columns, 9 actor-assigned steps, L1–L7 evidence');
  });
});
