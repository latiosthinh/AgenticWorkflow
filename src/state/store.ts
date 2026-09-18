import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { StateStore, TicketState, DedupRecord } from './types.js';
import { laneContext } from '../queue/lane-manager.js';

export class OffLaneMutationError extends Error {
  constructor(workItemId: number, activeLane?: number) {
    super(
      `Off-lane mutation rejected: mutation for workItemId ${workItemId} must be executed inside its dedicated lane (active lane: ${activeLane ?? 'none'}).`
    );
    this.name = 'OffLaneMutationError';
  }
}

function verifyLane(workItemId: number): void {
  const current = laneContext.getStore();
  if (!current || current.workItemId !== workItemId) {
    throw new OffLaneMutationError(workItemId, current?.workItemId);
  }
}

export function parseTicketDocument<T = TicketState>(raw: string): { frontmatter: T; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid ticket document format: missing frontmatter fences');
  }
  const frontmatter = JSON.parse(match[1]) as T;
  const body = (match[2] || '').trim();
  return { frontmatter, body };
}

export function serializeTicketDocument<T = TicketState>(frontmatter: T, body: string): string {
  const json = JSON.stringify(frontmatter, null, 2);
  const trimmed = body.trim();
  return trimmed ? `---\n${json}\n---\n\n${trimmed}\n` : `---\n${json}\n---\n`;
}

function writeCrashAtomicSync(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  const tempName = `.${path.basename(targetPath)}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
  const tempPath = path.join(dir, tempName);

  fs.writeFileSync(tempPath, content, 'utf8');

  let targetRenamed = false;
  let backupPath = '';
  try {
    try {
      fs.renameSync(tempPath, targetPath);
    } catch (renameErr: any) {
      if (process.platform === 'win32' && (renameErr.code === 'EPERM' || renameErr.code === 'EEXIST')) {
        backupPath = `${targetPath}.bak.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
        if (fs.existsSync(targetPath)) {
          fs.renameSync(targetPath, backupPath);
          targetRenamed = true;
        }
        try {
          fs.renameSync(tempPath, targetPath);
          if (targetRenamed && fs.existsSync(backupPath)) {
            try {
              fs.unlinkSync(backupPath);
            } catch {}
          }
        } catch (retryErr) {
          if (targetRenamed && fs.existsSync(backupPath)) {
            try {
              fs.renameSync(backupPath, targetPath);
            } catch {}
          }
          throw retryErr;
        }
      } else {
        throw renameErr;
      }
    }
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
    throw err;
  }
}

export class FileStateStore implements StateStore {
  public readonly ticketsDir: string;
  public readonly dedupDir: string;
  public readonly archiveDir: string;

  constructor(public readonly baseDir: string = './data/state') {
    this.ticketsDir = path.join(this.baseDir, 'tickets');
    this.dedupDir = path.join(this.baseDir, 'dedup');
    this.archiveDir = path.join(this.baseDir, 'archive');

    fs.mkdirSync(this.ticketsDir, { recursive: true });
    fs.mkdirSync(this.dedupDir, { recursive: true });
    fs.mkdirSync(this.archiveDir, { recursive: true });
  }

  public resolveTicketPath(workItemId: number): string {
    if (!Number.isInteger(workItemId) || workItemId <= 0) {
      throw new Error(`Invalid workItemId: expected positive integer, got ${workItemId}`);
    }
    const resolvedPath = path.resolve(this.ticketsDir, `${workItemId}.md`);
    const allowedDir = path.resolve(this.ticketsDir);
    if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) {
      throw new Error(`Path traversal detected for workItemId ${workItemId}`);
    }
    return resolvedPath;
  }

  private recoverOrphanTempFile(ticketPath: string, workItemId: number): boolean {
    if (fs.existsSync(ticketPath)) {
      return true;
    }
    const prefix = `.${workItemId}.md.tmp.`;
    const dir = path.dirname(ticketPath);
    if (!fs.existsSync(dir)) {
      return false;
    }
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return false;
    }
    const candidates = entries
      .filter((name) => name.startsWith(prefix))
      .map((name) => {
        const fullPath = path.join(dir, name);
        try {
          const stat = fs.statSync(fullPath);
          return { name, fullPath, mtimeMs: stat.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((item): item is { name: string; fullPath: string; mtimeMs: number } => item !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (const candidate of candidates) {
      try {
        const raw = fs.readFileSync(candidate.fullPath, 'utf8');
        parseTicketDocument<TicketState>(raw);
        if (process.platform === 'win32' && fs.existsSync(ticketPath)) {
          fs.unlinkSync(ticketPath);
        }
        fs.renameSync(candidate.fullPath, ticketPath);
        return true;
      } catch {
        // Skip corrupt candidate
      }
    }
    return false;
  }

  public async getTicketState(workItemId: number): Promise<TicketState | null> {
    const ticketPath = this.resolveTicketPath(workItemId);
    if (!fs.existsSync(ticketPath)) {
      this.recoverOrphanTempFile(ticketPath, workItemId);
    }
    if (!fs.existsSync(ticketPath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(ticketPath, 'utf8');
      const { frontmatter } = parseTicketDocument<TicketState>(raw);
      return frontmatter;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  public async getTicketNotes(workItemId: number): Promise<string> {
    const ticketPath = this.resolveTicketPath(workItemId);
    if (!fs.existsSync(ticketPath)) {
      this.recoverOrphanTempFile(ticketPath, workItemId);
    }
    if (!fs.existsSync(ticketPath)) {
      return '';
    }
    try {
      const raw = fs.readFileSync(ticketPath, 'utf8');
      const { body } = parseTicketDocument<TicketState>(raw);
      return body;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return '';
      }
      throw err;
    }
  }

  public async updateTicketState(
    workItemId: number,
    mutator: (state: TicketState) => void | Promise<void>,
    notesAppend?: string
  ): Promise<TicketState> {
    verifyLane(workItemId);

    const ticketPath = this.resolveTicketPath(workItemId);
    if (!fs.existsSync(ticketPath)) {
      this.recoverOrphanTempFile(ticketPath, workItemId);
    }

    let state: TicketState;
    let body = '';

    if (fs.existsSync(ticketPath)) {
      const raw = fs.readFileSync(ticketPath, 'utf8');
      const parsed = parseTicketDocument<TicketState>(raw);
      state = parsed.frontmatter;
      body = parsed.body;
    } else {
      const now = new Date().toISOString();
      state = {
        workItemId,
        revId: 1,
        createdAt: now,
        updatedAt: now,
        auditLogs: [],
        planCheckpoints: [],
        l3Evidence: [],
        qaRuns: [],
        deploymentRecords: [],
        telemetryEvaluations: [],
        skillsPrs: [],
        smokeRuns: [],
      };
    }

    await mutator(state);
    state.updatedAt = new Date().toISOString();

    if (notesAppend) {
      const trimmedNotes = notesAppend.trim();
      if (trimmedNotes) {
        body = body.trim() ? `${body.trim()}\n\n${trimmedNotes}` : trimmedNotes;
      }
    }

    const documentContent = serializeTicketDocument(state, body);
    writeCrashAtomicSync(ticketPath, documentContent);

    return state;
  }

  public async listTickets(options?: { includeArchived?: boolean }): Promise<TicketState[]> {
    const dirs = [this.ticketsDir];
    if (options?.includeArchived && fs.existsSync(this.archiveDir)) {
      dirs.push(this.archiveDir);
    }
    const tickets: TicketState[] = [];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        continue;
      }
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (!entry.endsWith('.md') || entry.startsWith('.')) {
          continue;
        }
        const fullPath = path.join(dir, entry);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const { frontmatter } = parseTicketDocument<TicketState>(raw);
          tickets.push(frontmatter);
        } catch {
          // Skip corrupt or non-ticket documents
        }
      }
    }

    return tickets;
  }

  public async archiveTicket(workItemId: number): Promise<void> {
    const ticketPath = this.resolveTicketPath(workItemId);
    if (!fs.existsSync(ticketPath)) {
      return;
    }

    const archivePath = path.resolve(this.archiveDir, `${workItemId}.md`);
    if (process.platform === 'win32' && fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
    fs.renameSync(ticketPath, archivePath);
  }

  public recordDedupEvent(
    workItemId: number,
    revId: number,
    payloadHash: string
  ): { isDuplicate: boolean; event: DedupRecord } {
    if (!Number.isInteger(workItemId) || workItemId <= 0) {
      throw new Error(`Invalid workItemId: expected positive integer, got ${workItemId}`);
    }
    if (!Number.isInteger(revId) || revId < 0) {
      throw new Error(`Invalid revId: expected non-negative integer, got ${revId}`);
    }

    const markerPath = path.join(this.dedupDir, `${workItemId}-${revId}.json`);
    const record: DedupRecord = {
      workItemId,
      revId,
      status: 'pending',
      payloadHash,
      receivedAt: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(markerPath, JSON.stringify(record, null, 2), { flag: 'wx' });
      return { isDuplicate: false, event: record };
    } catch (err: any) {
      if (err?.code === 'EEXIST') {
        try {
          const existing = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as DedupRecord;
          return { isDuplicate: true, event: existing };
        } catch {
          return { isDuplicate: true, event: record };
        }
      }
      throw err;
    }
  }

  public updateDedupStatus(
    workItemId: number,
    revId: number,
    status: DedupRecord['status'],
    errorMessage?: string
  ): void {
    if (!Number.isInteger(workItemId) || workItemId <= 0) {
      throw new Error(`Invalid workItemId: expected positive integer, got ${workItemId}`);
    }
    if (!Number.isInteger(revId) || revId < 0) {
      throw new Error(`Invalid revId: expected non-negative integer, got ${revId}`);
    }

    const markerPath = path.join(this.dedupDir, `${workItemId}-${revId}.json`);
    if (fs.existsSync(markerPath)) {
      try {
        const record = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as DedupRecord;
        if ((record.status === 'skipped' || record.status === 'failed') && status === 'completed') {
          return;
        }
        record.status = status;
        if (errorMessage !== undefined) {
          record.errorMessage = errorMessage;
        }
        writeCrashAtomicSync(markerPath, JSON.stringify(record, null, 2));
      } catch {
        // Ignore transient read/write collision
      }
    }
  }

  public getDedupEvent(workItemId: number, revId: number): DedupRecord | null {
    if (!Number.isInteger(workItemId) || workItemId <= 0 || !Number.isInteger(revId) || revId < 0) {
      return null;
    }
    const markerPath = path.join(this.dedupDir, `${workItemId}-${revId}.json`);
    if (!fs.existsSync(markerPath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(markerPath, 'utf8')) as DedupRecord;
    } catch {
      return null;
    }
  }

  public purgeOldDedupEvents(retentionDays = 7): { changes: number } {
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let changes = 0;

    if (fs.existsSync(this.dedupDir)) {
      const files = fs.readdirSync(this.dedupDir);
      for (const file of files) {
        const isDedupJson = file.endsWith('.json') && !file.startsWith('.');
        const isOrphanTmp = file.includes('.json.tmp.');
        if (!isDedupJson && !isOrphanTmp) {
          continue;
        }
        const fullPath = path.join(this.dedupDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs < cutoffMs) {
            fs.unlinkSync(fullPath);
            changes++;
          }
        } catch {}
      }
    }

    return { changes };
  }
}
