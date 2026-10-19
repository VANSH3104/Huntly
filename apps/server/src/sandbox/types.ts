import { z } from "zod";

export const CreateSandboxSchema = z.object({
  id: z.string().optional(),
  timeoutSeconds: z.number().int().min(10).max(3600).default(600), // Default 10 min
  persistent: z.boolean().default(false),
  metadata: z.record(z.string(), z.string()).optional(),
});
export type CreateSandboxInput = z.input<typeof CreateSandboxSchema>;

export const ExecuteCommandSchema = z.object({
  command: z.string().min(1, "Command must not be empty"),
  cwd: z.string().optional(),
  timeoutSeconds: z.number().int().min(1).max(600).default(60), // Default 60s
  env: z.record(z.string(), z.string()).optional(),
  background: z.boolean().default(false),
});
export type ExecuteCommandInput = z.input<typeof ExecuteCommandSchema>;

export const WriteFileSchema = z.object({
  path: z.string().min(1, "File path is required"),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
});
export type WriteFileInput = z.input<typeof WriteFileSchema>;

export interface CommandResult {
  commandId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  status: "completed" | "failed" | "timed_out" | "running";
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  updatedAt: string;
}

export interface SandboxInfo {
  id: string;
  workspacePath: string;
  createdAt: string;
  lastActiveAt: string;
  persistent: boolean;
  status: "ready" | "busy" | "terminated";
  activeProcesses: number;
  metadata?: Record<string, string>;
}
