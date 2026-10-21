import fs from "node:fs";
import path from "node:path";

const dir = () => path.join(path.dirname(path.resolve(process.env["DATABASE_PATH"] ?? (fs.existsSync("./huntly.db") ? "./huntly.db" : "./agentforge.db"))), "autoapply-files");
const file = () => path.join(dir(), "resume.pdf");

export function getUploadedResume(): { path: string; size: number; updatedAt: number } | null {
  try {
    const stat = fs.statSync(file());
    return { path: file(), size: stat.size, updatedAt: stat.mtimeMs };
  } catch {
    return null;
  }
}

export function saveUploadedResume(buf: Buffer) {
  if (buf.length < 100 || buf.subarray(0, 4).toString() !== "%PDF") throw new Error("That file is not a PDF");
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(file(), buf);
}

export function deleteUploadedResume() {
  fs.rmSync(file(), { force: true });
}

/** Persistent Chromium profile, so logins (LinkedIn) survive between runs. */
export function browserProfileDir(): string {
  const d = path.join(dir(), "browser-profile");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
