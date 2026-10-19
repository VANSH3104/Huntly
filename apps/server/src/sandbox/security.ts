import path from "node:path";
import fs from "node:fs";

/**
 * Resolves and validates a path relative to the sandbox workspace root.
 * Throws an error if the path attempts to escape the sandbox directory.
 */
export function resolveSafePath(workspaceRoot: string, relativePath: string): string {
  const normalizedRoot = path.resolve(workspaceRoot);
  const targetPath = path.resolve(normalizedRoot, relativePath);

  // Strict boundary check: target path must reside inside workspaceRoot
  if (!targetPath.startsWith(normalizedRoot + path.sep) && targetPath !== normalizedRoot) {
    throw new Error(`Security violation: Access denied outside workspace sandbox boundary (${relativePath})`);
  }

  // Check for symlink traversal if target exists
  if (fs.existsSync(targetPath)) {
    try {
      const realPath = fs.realpathSync(targetPath);
      if (!realPath.startsWith(normalizedRoot + path.sep) && realPath !== normalizedRoot) {
        throw new Error(`Security violation: Symlink escapes workspace sandbox boundary`);
      }
    } catch {
      // Ignore if realpath cannot be resolved
    }
  }

  return targetPath;
}

/**
 * Sanitizes environment variables passed to sandboxed processes.
 * Strips any sensitive host tokens, keys, and credentials.
 */
export function getSanitizedEnv(customEnv?: Record<string, string>): Record<string, string> {
  const safeBaseEnv: Record<string, string> = {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin",
    HOME: process.env.HOME || "/tmp",
    USER: "agentforge-sandbox",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NODE_ENV: "development",
    PYTHONUNBUFFERED: "1",
  };

  // Blacklist of prefixes and keys that must never leak to sandbox processes
  const blocklist = [
    "DATABASE_URL",
    "GEMINI_API_KEY",
    "LLM_API_KEY",
    "SECRET",
    "PASSWORD",
    "TOKEN",
    "AWS_",
    "CLERK_",
    "OPENAI_",
    "ANTHROPIC_",
  ];

  if (customEnv) {
    for (const [key, value] of Object.entries(customEnv)) {
      const isBlocked = blocklist.some((blocked) => key.toUpperCase().includes(blocked));
      if (!isBlocked && typeof value === "string") {
        safeBaseEnv[key] = value;
      }
    }
  }

  return safeBaseEnv;
}
