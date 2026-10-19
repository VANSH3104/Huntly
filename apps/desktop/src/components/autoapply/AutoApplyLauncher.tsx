import React, { useEffect, useState } from "react";
import { Zap, X, ShieldCheck, Eye, Loader2, CheckCircle2, SkipForward, FileUp, AlertTriangle, LogIn } from "lucide-react";
import { api, type AutoApplyConfig } from "../../lib/api";
import { useStore } from "../../store/useStore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Every job id matching the current filters (already de-duplicated against the board by the server). */
  jobIds: string[];
  /** Total matches, which can be larger than jobIds when the fetch was capped. */
  totalMatching: number;
}

const field: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: "13px",
  background: "var(--bg-input)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
};

export const AutoApplyLauncher: React.FC<Props> = ({ isOpen, onClose, jobIds, totalMatching }) => {
  const setDockOpen = useStore((s) => s.setIsAutoApplyDockOpen);
  const [config, setConfig] = useState<AutoApplyConfig | null>(null);
  const [preview, setPreview] = useState<{ fresh: number; skipped: Array<{ reason: string }> } | null>(null);
  const [limit, setLimit] = useState(25);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Awaited<ReturnType<typeof api.autoApply.readiness>> | null>(null);
  const [me, setMe] = useState({ fullName: "", email: "", phone: "", city: "" });
  const [uploading, setUploading] = useState(false);

  const loadReadiness = () =>
    api.autoApply.readiness().then((r) => {
      setReady(r);
      setMe({ fullName: r.profile.fullName, email: r.profile.email, phone: r.profile.phone, city: "" });
    });

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setPreview(null);
    loadReadiness().catch(() => {});
    api.autoApply.getConfig().then((c) => {
      setConfig(c);
      setLimit(c.maxPerRun);
    });
    api.autoApply
      .previewQueue(jobIds)
      .then(setPreview)
      .catch((e) => setError(e.message));
  }, [isOpen, jobIds]);

  if (!isOpen || !config) return null;

  const fresh = preview?.fresh ?? 0;
  const willApply = Math.min(limit, fresh);
  const skippedApplied = preview?.skipped.length ?? 0;

  const start = async () => {
    try {
      setStarting(true);
      setError(null);
      if (ready && ready.missing.length > 0) {
        if (!me.fullName.trim() || !me.email.trim() || !me.phone.trim()) {
          throw new Error("Fill in your name, email and phone first. Forms need them.");
        }
        const [first, ...rest] = me.fullName.trim().split(/\s+/);
        const saved = await api.autoApply.getProfile().catch(() => ({}));
        await api.autoApply.updateProfile({
          ...saved,
          fullName: me.fullName.trim(),
          firstName: first,
          lastName: rest.join(" "),
          email: me.email.trim(),
          phone: me.phone.trim(),
        });
      }
      if (ready?.needsCity && me.city.trim()) {
        const saved = await api.autoApply.getProfile().catch(() => ({}));
        const city = me.city.trim();
        await api.autoApply.updateProfile({ ...saved, location: city, city: city.split(",")[0].trim() });
      }
      if (!ready?.resumePdf) throw new Error("Upload your resume as a PDF first. Most forms require a file.");
      await api.autoApply.saveConfig({ ...config, maxPerRun: limit });
      await api.autoApply.enqueue({ jobIds, mode: config.mode, limit });
      setDockOpen(true);
      onClose();
    } catch (e: any) {
      setError(e.message || "Could not start auto-apply");
    } finally {
      setStarting(false);
    }
  };

  const modeCard = (value: AutoApplyConfig["mode"], title: string, body: string, icon: React.ReactNode) => {
    const active = config.mode === value;
    return (
      <button
        type="button"
        onClick={() => setConfig({ ...config, mode: value })}
        style={{
          flex: 1,
          textAlign: "left",
          padding: "12px",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          border: `1px solid ${active ? "var(--border-active)" : "var(--border-subtle)"}`,
          background: active ? "rgba(79, 70, 229, 0.06)" : "var(--bg-card)",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
          {icon} {title}
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.4 }}>{body}</span>
      </button>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(28, 25, 23, 0.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          padding: "22px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--gradient-brand)", display: "grid", placeItems: "center", color: "#fff" }}>
              <Zap size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-primary)" }}>Auto-Apply to filtered jobs</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Runs in the background. Keep working while it applies.</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {totalMatching > jobIds.length && (
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "-6px" }}>
            Checking the first {jobIds.length} of {totalMatching} matches. Run it again for the rest.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
          {[
            { label: "Match your filters", value: totalMatching, color: "var(--text-primary)" },
            { label: "New, will apply", value: preview ? fresh : "…", color: "var(--accent-emerald)" },
            { label: "Skipped (done / queued)", value: preview ? skippedApplied : "…", color: "var(--text-muted)" },
          ].map((s) => (
            <div key={s.label} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "20px", fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {ready && (ready.missing.length > 0 || !ready.resumePdf || ready.needsCity) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "var(--radius-md)", background: "rgba(217, 119, 6, 0.07)", border: "1px solid rgba(217, 119, 6, 0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--accent-amber)" }}>
              <AlertTriangle size={14} /> One-time setup. Saved for every future application.
            </div>
            {ready.missing.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                <input placeholder="Full name" value={me.fullName} onChange={(e) => setMe({ ...me, fullName: e.target.value })} style={field} />
                <input placeholder="Email" value={me.email} onChange={(e) => setMe({ ...me, email: e.target.value })} style={field} />
                <input placeholder="Phone" value={me.phone} onChange={(e) => setMe({ ...me, phone: e.target.value })} style={field} />
              </div>
            )}
            {ready.needsCity && (
              <input placeholder="Your city, country (for example Noida, India)" value={me.city} onChange={(e) => setMe({ ...me, city: e.target.value })} style={field} />
            )}
            {!ready.resumePdf && (
              <label className="btn btn-secondary" style={{ alignSelf: "flex-start", cursor: "pointer", fontSize: "12px" }}>
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
                <span>Upload resume PDF</span>
                <input
                  type="file"
                  accept="application/pdf"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      setUploading(true);
                      await api.autoApply.uploadResumePdf(f);
                      await loadReadiness();
                    } catch (err: any) {
                      setError(err.message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          {modeCard("auto_submit", "Fully automatic", "Fills and submits. Stops on anything unclear and asks you.", <Zap size={14} color="var(--accent-emerald)" />)}
          {modeCard("review", "Review first", "Fills every form but waits for your approval to submit.", <Eye size={14} color="var(--accent-indigo)" />)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
            Apply to at most (this run)
            <input type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))} style={field} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
            Daily cap (safety)
            <input type="number" min={1} max={500} value={config.dailyCap} onChange={(e) => setConfig({ ...config, dailyCap: Math.max(1, Number(e.target.value) || 1) })} style={field} />
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={config.fillGaps} onChange={(e) => setConfig({ ...config, fillGaps: e.target.checked })} style={{ marginTop: 2 }} />
          <span>
            <b style={{ color: "var(--text-primary)" }}>Never stop on a question.</b> If a required question is unclear, answer it with the best guess from your resume instead of asking me.
          </span>
        </label>

        <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={config.onCaptcha === "wait"} onChange={(e) => setConfig({ ...config, onCaptcha: e.target.checked ? "wait" : "skip" })} style={{ marginTop: 2 }} />
          <span>
            <b style={{ color: "var(--text-primary)" }}>If a captcha appears, let me solve it.</b> A browser window opens on that job, you tick the captcha, and it submits for you.
          </span>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>When a job needs you to sign in</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {([
              ["skip", "Skip it and list it for later"],
              ["wait", "Pause and let me sign in"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setConfig({ ...config, onLogin: value })}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  fontSize: "12px",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  border: `1px solid ${config.onLogin === value ? "var(--border-active)" : "var(--border-subtle)"}`,
                  background: config.onLogin === value ? "rgba(79, 70, 229, 0.06)" : "var(--bg-card)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ alignSelf: "flex-start", fontSize: "12px" }}
            onClick={() => api.autoApply.connectLinkedIn().catch((e) => setError(e.message))}
          >
            <LogIn size={13} /> <span>Connect LinkedIn (opens a window, sign in once)</span>
          </button>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={!config.headless} onChange={(e) => setConfig({ ...config, headless: !e.target.checked })} />
          Watch the browser while it applies (opens a visible window)
        </label>

        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "12px", color: "var(--text-secondary)", background: "rgba(5, 150, 105, 0.07)", border: "1px solid rgba(5, 150, 105, 0.2)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
          <ShieldCheck size={15} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Jobs already on your board, already submitted, or the same posting under another link are skipped. A job is only marked applied after the site confirms it.
          </span>
        </div>

        {error && <div style={{ fontSize: "12px", color: "var(--accent-rose)" }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={start} disabled={starting || !preview || fresh === 0}>
            {starting ? <Loader2 size={14} className="animate-spin" /> : fresh === 0 && preview ? <SkipForward size={14} /> : <CheckCircle2 size={14} />}
            <span>{preview && fresh === 0 ? "Nothing new to apply" : `Start applying to ${willApply} jobs`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
