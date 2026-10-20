import { Router } from "express";
import { getDatabase, notifications } from "@huntly/database";
import { eq, desc } from "drizzle-orm";

export const notificationsRouter = Router();

notificationsRouter.get("/", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

notificationsRouter.patch("/:id/read", async (req, res, next) => {
  try {
    const db = getDatabase();
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, req.params["id"]!));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/read-all", async (_req, res, next) => {
  try {
    const db = getDatabase();
    await db.update(notifications).set({ read: true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
