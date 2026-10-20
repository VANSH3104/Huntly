import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Settings,
  Key,
  Globe,
  Sliders,
  Save,
  CheckCircle,
  Shield,
  Layers,
} from "lucide-react";

export const SettingsView: React.FC = () => {
  const [llmProvider, setLlmProvider] = useState("freellm");
  const [llmBaseUrl, setLlmBaseUrl] = useState("http://127.0.0.1:31415/v1");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("auto");
  const [geminiKey, setGeminiKey] = useState("");
  const [searchProvider, setSearchProvider] = useState("serper");
  const [searchKey, setSearchKey] = useState("");
  const [targetRoles, setTargetRoles] = useState("Software Engineer, Backend Engineer, Full Stack Engineer");
  const [targetLocations, setTargetLocations] = useState("Bengaluru, Remote, India");
  const [minMatchThreshold, setMinMatchThreshold] = useState(60);
  const [crawlIntervalHours, setCrawlIntervalHours] = useState(6);
  const [saved, setSaved] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string; latencyMs?: number } | null>(null);

  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.getAll(),
  });

  useEffect(() => {
    if (settingsData) {
      if (settingsData["llm.provider"]) setLlmProvider(settingsData["llm.provider"]);
      if (settingsData["llm.baseUrl"]) setLlmBaseUrl(settingsData["llm.baseUrl"]);
      if (settingsData["llm.apiKey"]) setLlmApiKey(settingsData["llm.apiKey"]);
      if (settingsData["llm.model"]) setLlmModel(settingsData["llm.model"]);
      if (settingsData.geminiApiKey) setGeminiKey(settingsData.geminiApiKey);
      if (settingsData.searchProvider) setSearchProvider(settingsData.searchProvider);
      if (settingsData.searchApiKey) setSearchKey(settingsData.searchApiKey);
      if (settingsData.targetRoles) setTargetRoles(settingsData.targetRoles);
      if (settingsData.targetLocations) setTargetLocations(settingsData.targetLocations);
      if (settingsData.minMatchThreshold) setMinMatchThreshold(Number(settingsData.minMatchThreshold));
    }
  }, [settingsData]);

  const handleTestLlm = async () => {
    setTestingLlm(true);
    setTestResult(null);
    try {
      const res = await api.settings.testLlm({
        provider: llmProvider,
        baseUrl: llmBaseUrl,
        apiKey: llmProvider === "freellm" ? llmApiKey : geminiKey,
        model: llmModel,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || "Failed to reach LLM" });
    } finally {
      setTestingLlm(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      api.settings.update({
        "llm.provider": llmProvider,
        "llm.baseUrl": llmBaseUrl,
        "llm.apiKey": llmApiKey,
        "llm.model": llmModel,
        geminiApiKey: geminiKey,
        searchProvider,
        searchApiKey: searchKey,
        targetRoles,
        targetLocations,
        minMatchThreshold,
        crawlIntervalHours,
      }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "800px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 700 }}>System Configuration & Credentials</h2>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Credentials and AI routing models are managed locally in your SQLite database.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {saved && (
            <span style={{ fontSize: "12px", color: "var(--accent-emerald)", display: "flex", alignItems: "center", gap: "4px" }}>
              <CheckCircle size={14} /> Settings Saved
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save size={14} />
            <span>{saveMutation.isPending ? "Saving..." : "Save Preferences"}</span>
          </button>
        </div>
      </div>

      {/* AI Engine & Credentials */}
      <div className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Key size={18} color="var(--accent-cyan)" />
            <h3 style={{ fontSize: "14px", fontWeight: 600 }}>AI Intelligence Engine</h3>
          </div>
          <button
            type="button"
            className="btn"
            onClick={handleTestLlm}
            disabled={testingLlm}
            style={{
              padding: "4px 12px",
              fontSize: "12px",
              background: "rgba(6, 182, 212, 0.15)",
              color: "var(--accent-cyan)",
              border: "1px solid rgba(6, 182, 212, 0.4)",
              borderRadius: "6px",
              cursor: testingLlm ? "not-allowed" : "pointer",
            }}
          >
            {testingLlm ? "Testing Connection..." : "⚡ Test LLM Connection"}
          </button>
        </div>

        {testResult && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: testResult.ok ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
              color: testResult.ok ? "var(--accent-emerald)" : "var(--accent-rose)",
              border: `1px solid ${testResult.ok ? "rgba(16, 185, 129, 0.3)" : "rgba(244, 63, 94, 0.3)"}`,
            }}
          >
            <CheckCircle size={14} />
            <span>
              {testResult.ok
                ? `Connection Successful! Model: ${llmModel} (${testResult.latencyMs}ms latency)`
                : `Connection Failed: ${testResult.error}`}
            </span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              AI Provider
            </label>
            <select
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="freellm">FreeLLM Gateway (OpenAI-compatible Local / Multi-model)</option>
              <option value="gemini">Google Gemini API (Direct)</option>
              <option value="openai">Custom OpenAI-compatible API</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              Active AI Model
            </label>
            <input
              type="text"
              placeholder="auto, gemini-3.5-flash, etc."
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              style={{ width: "100%", fontFamily: "var(--font-mono)" }}
            />
          </div>
        </div>

        {llmProvider === "freellm" || llmProvider === "openai" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                API Gateway URL
              </label>
              <input
                type="text"
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
                style={{ width: "100%", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                Gateway API Key
              </label>
              <input
                type="password"
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                style={{ width: "100%", fontFamily: "var(--font-mono)" }}
              />
            </div>
          </div>
        ) : (
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              Google Gemini API Key
            </label>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              style={{ width: "100%", fontFamily: "var(--font-mono)" }}
            />
          </div>
        )}
      </div>

      {/* Search Provider Credentials */}
      <div className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Globe size={18} color="var(--accent-emerald)" />
          <h3 style={{ fontSize: "14px", fontWeight: 600 }}>Web Search Discovery Provider</h3>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              Active Search Provider
            </label>
            <select
              value={searchProvider}
              onChange={(e) => setSearchProvider(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="serper">Serper.dev (Google Search API)</option>
              <option value="serpapi">SerpAPI (Google Jobs / Web)</option>
              <option value="brave">Brave Search API</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              Search Provider API Key
            </label>
            <input
              type="password"
              placeholder="Search API Key..."
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
              style={{ width: "100%", fontFamily: "var(--font-mono)" }}
            />
          </div>
        </div>
      </div>

      {/* Targeting & Preferences */}
      <div className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Sliders size={18} color="var(--accent-purple)" />
          <h3 style={{ fontSize: "14px", fontWeight: 600 }}>Crawling & Targeting Filters</h3>
        </div>

        <div>
          <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
            Target Roles (Comma-separated)
          </label>
          <input
            type="text"
            value={targetRoles}
            onChange={(e) => setTargetRoles(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
            Target Locations
          </label>
          <input
            type="text"
            value={targetLocations}
            onChange={(e) => setTargetLocations(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              Minimum Match Score Threshold: {minMatchThreshold}%
            </label>
            <input
              type="range"
              min="20"
              max="90"
              step="5"
              value={minMatchThreshold}
              onChange={(e) => setMinMatchThreshold(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              Background Crawl Interval (Hours)
            </label>
            <input
              type="number"
              min="1"
              max="48"
              value={crawlIntervalHours}
              onChange={(e) => setCrawlIntervalHours(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
