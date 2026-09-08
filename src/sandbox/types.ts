export interface WorktreeResult {
  worktreePath: string;
  branchName: string;
  testFilesProtected: string[];
}

export interface WorktreeOptions {
  repoRoot?: string;
  baseBranch?: string;
}

export interface CommandOptions {
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}
