import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { v4 as uuidv4 } from "uuid";
import {
  type CommandResult,
  type CreateSandboxInput,
  type ExecuteCommandInput,
  type FileEntry,
  type SandboxInfo,
  type WriteFileInput,
} from "./types.js";
import { resolveSafePath, getSanitizedEnv } from "./security.js";

interface ActiveProcess {
  process: ChildProcess;
  startedAt: number;
}

interface SandboxState {
  info: SandboxInfo;
  activeProcesses: Map<string, ActiveProcess>;
  timeoutTimer?: NodeJS.Timeout;
}

export class SandboxManager {
  private baseDir: string;
  private sandboxes: Map<string, SandboxState> = new Map();
  private maxOutputBytes: number = 1024 * 1024; // 1 MB cap per output stream

  constructor(baseDir?: string) {
    const defaultDir =
      process.env["SANDBOX_WORKSPACES_DIR"] ||
      path.join(os.tmpdir(), "agentforge-sandboxes");
    this.baseDir = path.resolve(baseDir || defaultDir);
    if (!fsSync.existsSync(this.baseDir)) {
      fsSync.mkdirSync(this.baseDir, { recursive: true, mode: 0o755 });
    }

    // Schedule cleanup of idle sandboxes every 5 minutes
    setInterval(() => this.reapExpiredSandboxes(), 5 * 60 * 1000).unref();
  }

  public async createSandbox(input: Partial<CreateSandboxInput> = {}): Promise<SandboxInfo> {
    const id = input.id || `sb_${uuidv4().slice(0, 12)}`;
    const workspacePath = path.join(this.baseDir, id);

    if (this.sandboxes.has(id)) {
      const existing = this.sandboxes.get(id)!;
      existing.info.lastActiveAt = new Date().toISOString();
      return existing.info;
    }

    // Initialize workspace directory
    await fs.mkdir(workspacePath, { recursive: true, mode: 0o755 });

    const info: SandboxInfo = {
      id,
      workspacePath,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      persistent: Boolean(input.persistent),
      status: "ready",
      activeProcesses: 0,
      metadata: input.metadata,
    };

    const state: SandboxState = {
      info,
      activeProcesses: new Map(),
    };

    if (input.timeoutSeconds && !input.persistent) {
      state.timeoutTimer = setTimeout(() => {
        this.terminateSandbox(id).catch((err) =>
          console.error(`Error auto-terminating sandbox ${id}:`, err)
        );
      }, input.timeoutSeconds * 1000);
    }

    this.sandboxes.set(id, state);
    return info;
  }

  public listSandboxes(): SandboxInfo[] {
    return Array.from(this.sandboxes.values()).map((s) => ({
      ...s.info,
      activeProcesses: s.activeProcesses.size,
    }));
  }

  public getSandbox(id: string): SandboxInfo {
    const state = this.sandboxes.get(id);
    if (!state) {
      throw new Error(`Sandbox '${id}' not found`);
    }
    state.info.lastActiveAt = new Date().toISOString();
    return state.info;
  }

  public async executeCommand(
    sandboxId: string,
    input: ExecuteCommandInput
  ): Promise<CommandResult> {
    const state = this.sandboxes.get(sandboxId);
    if (!state) {
      throw new Error(`Sandbox '${sandboxId}' not found`);
    }

    const commandId = `cmd_${uuidv4().slice(0, 10)}`;
    state.info.lastActiveAt = new Date().toISOString();
    state.info.status = "busy";

    const cwd = input.cwd
      ? resolveSafePath(state.info.workspacePath, input.cwd)
      : state.info.workspacePath;

    if (!fsSync.existsSync(cwd)) {
      await fs.mkdir(cwd, { recursive: true, mode: 0o755 });
    }

    const env = getSanitizedEnv(input.env);
    const timeoutMs = (input.timeoutSeconds || 60) * 1000;
    const startTime = Date.now();

    return new Promise<CommandResult>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      // Spawn using bash or sh shell with its own process group
      const child: ChildProcess = spawn("bash", ["-c", input.command], {
        cwd,
        env: env as unknown as NodeJS.ProcessEnv,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      state.activeProcesses.set(commandId, { process: child, startedAt: startTime });
      state.info.activeProcesses = state.activeProcesses.size;

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdout.length < this.maxOutputBytes) {
          stdout += chunk.toString("utf-8");
          if (stdout.length > this.maxOutputBytes) {
            stdout += "\n...[stdout truncated at 1MB limit]";
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderr.length < this.maxOutputBytes) {
          stderr += chunk.toString("utf-8");
          if (stderr.length > this.maxOutputBytes) {
            stderr += "\n...[stderr truncated at 1MB limit]";
          }
        }
      });

      const timer = setTimeout(() => {
        timedOut = true;
        this.killProcessTree(child);
      }, timeoutMs);

      const cleanup = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        state.activeProcesses.delete(commandId);
        state.info.activeProcesses = state.activeProcesses.size;
        if (state.activeProcesses.size === 0) {
          state.info.status = "ready";
        }

        const durationMs = Date.now() - startTime;
        const status = timedOut ? "timed_out" : code === 0 ? "completed" : "failed";

        resolve({
          commandId,
          command: input.command,
          stdout,
          stderr: timedOut ? stderr + `\n[Command timed out after ${input.timeoutSeconds}s]` : stderr,
          exitCode: code,
          durationMs,
          timedOut,
          status,
        });
      };

      child.on("close", (code: number | null) => cleanup(code));
      child.on("error", (err: Error) => {
        stderr += `\nFailed to spawn process: ${err.message}`;
        cleanup(1);
      });
    });
  }

  public async writeFile(
    sandboxId: string,
    input: WriteFileInput
  ): Promise<{ success: boolean; path: string; bytesWritten: number }> {
    const state = this.sandboxes.get(sandboxId);
    if (!state) {
      throw new Error(`Sandbox '${sandboxId}' not found`);
    }

    state.info.lastActiveAt = new Date().toISOString();
    const safePath = resolveSafePath(state.info.workspacePath, input.path);
    const parentDir = path.dirname(safePath);

    await fs.mkdir(parentDir, { recursive: true, mode: 0o755 });

    const buffer =
      input.encoding === "base64"
        ? Buffer.from(input.content, "base64")
        : Buffer.from(input.content, "utf-8");

    await fs.writeFile(safePath, buffer);

    return {
      success: true,
      path: input.path,
      bytesWritten: buffer.length,
    };
  }

  public async readFile(
    sandboxId: string,
    relativePath: string
  ): Promise<{ content: string; sizeBytes: number }> {
    const state = this.sandboxes.get(sandboxId);
    if (!state) {
      throw new Error(`Sandbox '${sandboxId}' not found`);
    }

    state.info.lastActiveAt = new Date().toISOString();
    const safePath = resolveSafePath(state.info.workspacePath, relativePath);

    const stats = await fs.stat(safePath);
    if (stats.isDirectory()) {
      throw new Error(`Path '${relativePath}' is a directory, not a file`);
    }

    if (stats.size > 10 * 1024 * 1024) {
      throw new Error(`File '${relativePath}' exceeds 10MB maximum read limit`);
    }

    const content = await fs.readFile(safePath, "utf-8");
    return { content, sizeBytes: stats.size };
  }

  public async listFiles(sandboxId: string, relativePath: string = "."): Promise<FileEntry[]> {
    const state = this.sandboxes.get(sandboxId);
    if (!state) {
      throw new Error(`Sandbox '${sandboxId}' not found`);
    }

    state.info.lastActiveAt = new Date().toISOString();
    const safePath = resolveSafePath(state.info.workspacePath, relativePath);

    if (!fsSync.existsSync(safePath)) {
      return [];
    }

    const entries = await fs.readdir(safePath, { withFileTypes: true });
    const results: FileEntry[] = [];

    for (const entry of entries) {
      const fullPath = path.join(safePath, entry.name);
      try {
        const stats = await fs.stat(fullPath);
        results.push({
          name: entry.name,
          path: path.relative(state.info.workspacePath, fullPath),
          isDirectory: entry.isDirectory(),
          sizeBytes: stats.size,
          updatedAt: stats.mtime.toISOString(),
        });
      } catch {
        // Skip inaccessible entries
      }
    }

    return results;
  }

  public async terminateSandbox(id: string): Promise<{ success: boolean; id: string }> {
    const state = this.sandboxes.get(id);
    if (!state) {
      return { success: true, id };
    }

    if (state.timeoutTimer) {
      clearTimeout(state.timeoutTimer);
    }

    // Kill all active processes
    for (const { process: p } of state.activeProcesses.values()) {
      this.killProcessTree(p);
    }

    state.info.status = "terminated";

    // Clean up filesystem if not marked persistent
    if (!state.info.persistent) {
      try {
        await fs.rm(state.info.workspacePath, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to remove workspace directory for sandbox ${id}:`, err);
      }
    }

    this.sandboxes.delete(id);
    return { success: true, id };
  }

  private killProcessTree(child: ChildProcess) {
    if (!child.pid) return;
    try {
      // Send SIGTERM to entire process group
      process.kill(-child.pid, "SIGTERM");
      setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          // Process already ended
        }
      }, 2000).unref();
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already ended
      }
    }
  }

  private reapExpiredSandboxes() {
    const now = Date.now();
    const maxIdleMs = 60 * 60 * 1000; // 1 hour max idle

    for (const [id, state] of this.sandboxes.entries()) {
      if (!state.info.persistent) {
        const lastActive = new Date(state.info.lastActiveAt).getTime();
        if (now - lastActive > maxIdleMs && state.activeProcesses.size === 0) {
          console.log(`[AgentForge Sandbox] Reaping idle sandbox: ${id}`);
          this.terminateSandbox(id).catch(console.error);
        }
      }
    }
  }
}

export const defaultSandboxManager = new SandboxManager();
