import path from "path";
import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import express from "express";
import cors from "cors";
import { getDatabase } from "@huntly/database";
import { runMigrations } from "@huntly/database";

import fs from "node:fs";

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
import { autoApplyRouter } from "./routes/auto-apply.js";
import { autoApplyQueue } from "./crawler/auto-applier/queue.js";

// Workers
import { WorkerOrchestrator } from "./workers/orchestrator.js";

const PORT = parseInt(process.env["SERVER_PORT"] ?? "7842", 10);
const HOST = process.env["SERVER_HOST"] ?? "127.0.0.1";

async function bootstrap(): Promise<void> {
  // Initialize database
  await runMigrations();
  console.log("✓ Database ready");

  const app = express();

  const customOrigins = process.env["CORS_ORIGINS"]?.split(",").map((s) => s.trim()) ?? [];
  const defaultOrigins = ["http://localhost:1420", "http://localhost:5173", "tauri://localhost"];
  const allowedOrigins = [...defaultOrigins, ...customOrigins];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: "10mb" }));

  // Health check
  app.get(["/health", "/api/health"], (_req, res) => {
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
  app.use("/api/auto-apply", autoApplyRouter);

  // Serve static UI if available (Docker / production build)
  const candidateDistPaths = [
    process.env["CLIENT_DIST_PATH"],
    path.resolve(process.cwd(), "../desktop/dist"),
    path.resolve(process.cwd(), "apps/desktop/dist"),
  ].filter((p): p is string => Boolean(p));

  const clientDist = candidateDistPaths.find((p) => fs.existsSync(p));
  if (clientDist) {
    console.log(`✓ Serving desktop UI from ${clientDist}`);
    app.use(express.static(clientDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Server Error]", err);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  });

  // Start background worker orchestrator
  const orchestrator = new WorkerOrchestrator();
  orchestrator.start();
  void autoApplyQueue.recover();

  app.listen(PORT, HOST, () => {
    console.log(`✓ Huntly server listening on http://${HOST}:${PORT}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    orchestrator.stop();
    process.exit(0);
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled rejection (kept running):", reason);
});
process.on("uncaughtException", (err) => {
  // A server that could not bind its port is not running, so let the watcher restart it.
  if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error("[Server] Port already in use, exiting:", err.message);
    process.exit(1);
  }
  console.error("[Server] Uncaught exception (kept running):", err);
});

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
