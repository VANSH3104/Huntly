import { Router, type Request, type Response } from "express";
import { defaultSandboxManager } from "../sandbox/manager.js";
import { CreateSandboxSchema, ExecuteCommandSchema, WriteFileSchema } from "../sandbox/types.js";
import { execSync } from "node:child_process";

export const sandboxRouter = Router();

// GET /api/sandbox/health — health check and installed developer tooling
sandboxRouter.get("/health", (_req: Request, res: Response) => {
  const checkTool = (cmd: string): boolean => {
    try {
      execSync(`which ${cmd}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };

  res.json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsage: process.memoryUsage(),
    tools: {
      bash: checkTool("bash"),
      node: checkTool("node"),
      python3: checkTool("python3"),
      pip: checkTool("pip") || checkTool("pip3"),
      git: checkTool("git"),
      curl: checkTool("curl"),
      pnpm: checkTool("pnpm"),
    },
    timestamp: new Date().toISOString(),
  });
});

// GET /api/sandbox — list active sandboxes
sandboxRouter.get("/", (_req: Request, res: Response) => {
  try {
    const list = defaultSandboxManager.listSandboxes();
    res.json(list);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list sandboxes";
    res.status(500).json({ error: message });
  }
});

// POST /api/sandbox — create a new sandbox
sandboxRouter.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = CreateSandboxSchema.parse(req.body);
    const info = await defaultSandboxManager.createSandbox(parsed);
    res.status(201).json(info);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create sandbox";
    res.status(400).json({ error: message });
  }
});

// GET /api/sandbox/:id — get sandbox info
sandboxRouter.get("/:id", (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const info = defaultSandboxManager.getSandbox(id);
    res.json(info);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sandbox not found";
    res.status(404).json({ error: message });
  }
});

// DELETE /api/sandbox/:id — terminate sandbox
sandboxRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const result = await defaultSandboxManager.terminateSandbox(id);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to terminate sandbox";
    res.status(500).json({ error: message });
  }
});

// POST /api/sandbox/:id/commands — execute command
sandboxRouter.post("/:id/commands", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const parsed = ExecuteCommandSchema.parse(req.body);
    const result = await defaultSandboxManager.executeCommand(id, parsed);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to execute command";
    res.status(400).json({ error: message });
  }
});

// GET /api/sandbox/:id/files — read file
sandboxRouter.get("/:id/files", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ error: "Query parameter 'path' is required" });
      return;
    }
    const result = await defaultSandboxManager.readFile(id, filePath);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to read file";
    res.status(400).json({ error: message });
  }
});

// POST /api/sandbox/:id/files — write file
sandboxRouter.post("/:id/files", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const parsed = WriteFileSchema.parse(req.body);
    const result = await defaultSandboxManager.writeFile(id, parsed);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to write file";
    res.status(400).json({ error: message });
  }
});

// GET /api/sandbox/:id/files/list — list files
sandboxRouter.get("/:id/files/list", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const targetPath = (req.query.path as string) || ".";
    const files = await defaultSandboxManager.listFiles(id, targetPath);
    res.json({ files });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list files";
    res.status(400).json({ error: message });
  }
});

// ─── Real-Time Sandbox Browser Endpoints ─────────────────────────
import { defaultSandboxBrowser } from "../sandbox/browser-service.js";

sandboxRouter.get("/browser/status", async (_req: Request, res: Response) => {
  try {
    const state = await defaultSandboxBrowser.getState();
    res.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to get browser status";
    res.status(500).json({ error: message });
  }
});

sandboxRouter.post("/browser/navigate", async (req: Request, res: Response) => {
  try {
    const { url, viewport } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing 'url' parameter" });
      return;
    }
    const state = await defaultSandboxBrowser.navigate(url, viewport);
    res.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to navigate";
    res.status(500).json({ error: message });
  }
});

sandboxRouter.post("/browser/click", async (req: Request, res: Response) => {
  try {
    const { x, y, selector } = req.body;
    const state = await defaultSandboxBrowser.click(x, y, selector);
    res.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to click";
    res.status(500).json({ error: message });
  }
});

sandboxRouter.post("/browser/type", async (req: Request, res: Response) => {
  try {
    const { text, selector } = req.body;
    if (typeof text !== "string") {
      res.status(400).json({ error: "Missing 'text' parameter" });
      return;
    }
    const state = await defaultSandboxBrowser.type(text, selector);
    res.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to type";
    res.status(500).json({ error: message });
  }
});

sandboxRouter.post("/browser/scroll", async (req: Request, res: Response) => {
  try {
    const deltaY = typeof req.body.deltaY === "number" ? req.body.deltaY : 300;
    const state = await defaultSandboxBrowser.scroll(deltaY);
    res.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to scroll";
    res.status(500).json({ error: message });
  }
});

sandboxRouter.post("/browser/back", async (_req: Request, res: Response) => {
  try {
    const state = await defaultSandboxBrowser.goBack();
    res.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to go back";
    res.status(500).json({ error: message });
  }
});

sandboxRouter.post("/browser/forward", async (_req: Request, res: Response) => {
  try {
    const state = await defaultSandboxBrowser.goForward();
    res.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to go forward";
    res.status(500).json({ error: message });
  }
});

sandboxRouter.post("/browser/reload", async (_req: Request, res: Response) => {
  try {
    const state = await defaultSandboxBrowser.reload();
    res.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reload";
    res.status(500).json({ error: message });
  }
});

sandboxRouter.post("/browser/close", async (_req: Request, res: Response) => {
  try {
    await defaultSandboxBrowser.close();
    res.json({ success: true, closed: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to close browser";
    res.status(500).json({ error: message });
  }
});

