import path from "path";
import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import express from "express";
import cors from "cors";
import { getDatabase } from "@agentforge/database";
import { runMigrations } from "@agentforge/database";

// Routes
import { jobsRouter } from "./routes/jobs.js";
import { companiesRouter } from "./routes/companies.js";
import { sourcesRouter } from "./routes/sources.js";
import { resumesRouter } from "./routes/resumes.js";
import { applicationsRouter } from "./routes/applications.js";
import { crawlRouter } from "./routes/crawl.js";
import { analyticsRouter } from "./routes/analytics.js";
import { settingsRouter } from "./routes/settings.js";
import { notificationsRouter } from "./routes/notifications.js";
import { aiRouter } from "./routes/ai.js";
import { intelRouter } from "./routes/intel.js";
import { sandboxRouter } from "./routes/sandbox.js";
import { autoApplyRouter } from "./routes/auto-apply.js";

// Workers
import { WorkerOrchestrator } from "./workers/orchestrator.js";

const PORT = parseInt(process.env["SERVER_PORT"] ?? "7842", 10);
const HOST = process.env["SERVER_HOST"] ?? "127.0.0.1";

async function bootstrap(): Promise<void> {
  // Initialize database
  await runMigrations();
  console.log("✓ Database ready");

  const app = express();

  app.use(cors({
    origin: ["http://localhost:1420", "http://localhost:5173", "tauri://localhost"],
    credentials: true,
  }));
  app.use(express.json({ limit: "10mb" }));

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API routes
  app.use("/api/jobs", jobsRouter);
  app.use("/api/companies", companiesRouter);
  app.use("/api/sources", sourcesRouter);
  app.use("/api/resumes", resumesRouter);
  app.use("/api/applications", applicationsRouter);
  app.use("/api/crawl", crawlRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/intel", intelRouter);
  app.use("/api/sandbox", sandboxRouter);
  app.use("/api/auto-apply", autoApplyRouter);

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Server Error]", err);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  });

  // Start background worker orchestrator
  const orchestrator = new WorkerOrchestrator();
  orchestrator.start();

  app.listen(PORT, HOST, () => {
    console.log(`✓ AgentForge server listening on http://${HOST}:${PORT}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    orchestrator.stop();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
