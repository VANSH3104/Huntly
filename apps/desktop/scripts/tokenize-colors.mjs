// One-off codemod: replaces hardcoded hex/rgba colours in views with theme tokens.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const HEX = {
  "#111827": "var(--text-primary)",
  "#1f2937": "var(--text-primary)",
  "#374151": "var(--text-secondary)",
  "#4b5563": "var(--text-secondary)",
  "#6b7280": "var(--text-muted)",
  "#9ca3af": "var(--text-muted)",
  "#64748b": "var(--text-muted)",
  "#e5e7eb": "var(--border-hover)",
  "#f3f4f6": "var(--bg-secondary)",
  "#f9fafb": "var(--bg-secondary)",
  "#5b7b12": "var(--brand)",
  "#4f46e5": "var(--brand)",
  "#4338ca": "var(--brand-strong)",
  "#6366f1": "var(--brand)",
  "#7c3aed": "var(--brand)",
  "#818cf8": "var(--brand)",
  "#a855f7": "var(--accent-purple)",
  "#059669": "var(--accent-emerald)",
  "#10b981": "var(--accent-emerald)",
  "#166534": "var(--accent-emerald)",
  "#e11d48": "var(--danger)",
  "#ef4444": "var(--danger)",
  "#b91c1c": "var(--danger)",
  "#d97706": "var(--accent-amber)",
  "#2563eb": "var(--accent-blue)",
  "#3b82f6": "var(--accent-blue)",
  "#fee2e2": "color-mix(in srgb, var(--danger) 14%, transparent)",
};

const RGBA_BRAND = /rgba\(\s*(?:99,\s*102,\s*241|79,\s*70,\s*229|124,\s*58,\s*237|91,\s*123,\s*18)\s*,\s*([\d.]+)\s*\)/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "ui") walk(p, out); }
    else if (extname(p) === ".tsx") out.push(p);
  }
  return out;
}

let total = 0;
for (const file of walk(new URL("../src", import.meta.url).pathname.replace(/^\/(\w):/, "$1:"))) {
  let s = readFileSync(file, "utf8");
  const before = s;
  s = s.replace(/#[0-9a-fA-F]{6}\b/g, (m) => HEX[m.toLowerCase()] ?? m);
  s = s.replace(RGBA_BRAND, (_, a) => `color-mix(in srgb, var(--brand) ${Math.round(parseFloat(a) * 100)}%, transparent)`);
  s = s.replace(/(background(?:Color)?:\s*)["'](#ffffff|#fff)["']/g, '$1"var(--bg-card)"');
  s = s.replace(/(\bcolor:\s*)["'](#ffffff|#fff)["']/g, '$1"var(--on-brand)"');
  if (s !== before) { writeFileSync(file, s); total++; }
}
console.log(`updated ${total} files`);
