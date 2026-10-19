import React, { useState, useEffect, useRef } from "react";
import {
  Terminal,
  FolderTree,
  Globe,
  RefreshCw,
  Play,
  FileText,
  Copy,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  Save,
  Cpu,
  Layers,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { api } from "../lib/api";

interface CommandLog {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs?: number;
  timestamp: string;
}

interface SandboxItem {
  id: string;
  status: string;
  workspacePath: string;
  createdAt: string;
  lastActiveAt: string;
}

export const SandboxView: React.FC = () => {
  const [sandboxes, setSandboxes] = useState<SandboxItem[]>([]);
  const [activeSandboxId, setActiveSandboxId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"terminal" | "files" | "browser">("terminal");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Terminal state
  const [commandInput, setCommandInput] = useState<string>("");
  const [commandLogs, setCommandLogs] = useState<CommandLog[]>([]);
  const [isRunningCommand, setIsRunningCommand] = useState<boolean>(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Files state
  const [currentPath, setCurrentPath] = useState<string>(".");
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isSavingFile, setIsSavingFile] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>("");
  const [isCreatingFile, setIsCreatingFile] = useState<boolean>(false);

  // Browser state
  const [browserUrl, setBrowserUrl] = useState<string>("http://localhost:5173");
  const [browserIframeSrc, setBrowserIframeSrc] = useState<string>("http://localhost:5173");

  // Load existing sandboxes or create default
  useEffect(() => {
    loadSandboxes();
  }, []);

  const loadSandboxes = async () => {
    try {
      setIsLoading(true);
      const list = await api.sandbox.list();
      setSandboxes(list);
      if (list.length > 0 && !activeSandboxId) {
        setActiveSandboxId(list[0].id);
      } else if (list.length === 0) {
        // Auto-create initial sandbox
        const created = await api.sandbox.create({ persistent: false });
        setSandboxes([created]);
        setActiveSandboxId(created.id);
      }
    } catch (err: any) {
      console.error("Failed to load sandboxes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSandbox = async () => {
    try {
      setIsLoading(true);
      const created = await api.sandbox.create({ persistent: false });
      setSandboxes((prev) => [created, ...prev]);
      setActiveSandboxId(created.id);
      setCommandLogs((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          command: "# Initialized new isolated sandbox",
          stdout: `Sandbox ${created.id} spawned at ${created.workspacePath}`,
          stderr: "",
          exitCode: 0,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch (err: any) {
      alert(`Failed to create sandbox: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTerminateSandbox = async () => {
    if (!activeSandboxId) return;
    if (!confirm(`Are you sure you want to terminate sandbox ${activeSandboxId}?`)) return;

    try {
      await api.sandbox.terminate(activeSandboxId);
      const remaining = sandboxes.filter((s) => s.id !== activeSandboxId);
      setSandboxes(remaining);
      setActiveSandboxId(remaining[0]?.id || "");
      setSelectedFile(null);
      setFileContent("");
      setFiles([]);
    } catch (err: any) {
      alert(`Failed to terminate sandbox: ${err.message}`);
    }
  };

  // Run shell command
  const handleRunCommand = async (cmdToRun?: string) => {
    const cmd = (cmdToRun || commandInput).trim();
    if (!cmd || !activeSandboxId || isRunningCommand) return;

    setIsRunningCommand(true);
    setCommandInput("");

    try {
      const res = await api.sandbox.execCommand(activeSandboxId, cmd);
      setCommandLogs((prev) => [
        ...prev,
        {
          id: res.commandId,
          command: cmd,
          stdout: res.stdout,
          stderr: res.stderr,
          exitCode: res.exitCode,
          durationMs: res.durationMs,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch (err: any) {
      setCommandLogs((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          command: cmd,
          stdout: "",
          stderr: err.message || "Failed to execute command",
          exitCode: 1,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsRunningCommand(false);
      setTimeout(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  };

  // Fetch files when switching to Files tab or changing path
  useEffect(() => {
    if (activeTab === "files" && activeSandboxId) {
      fetchFiles(currentPath);
    }
  }, [activeTab, activeSandboxId, currentPath]);

  const fetchFiles = async (relPath: string) => {
    try {
      const res = await api.sandbox.listFiles(activeSandboxId, relPath);
      setFiles(res.files || []);
    } catch (err: any) {
      console.error("Failed to list files:", err);
    }
  };

  const handleOpenFile = async (filePath: string) => {
    try {
      const res = await api.sandbox.readFile(activeSandboxId, filePath);
      setSelectedFile(filePath);
      setFileContent(res.content);
    } catch (err: any) {
      alert(`Failed to read file: ${err.message}`);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile || !activeSandboxId) return;
    try {
      setIsSavingFile(true);
      await api.sandbox.writeFile(activeSandboxId, selectedFile, fileContent);
      fetchFiles(currentPath);
    } catch (err: any) {
      alert(`Failed to save file: ${err.message}`);
    } finally {
      setIsSavingFile(false);
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim() || !activeSandboxId) return;
    const target = currentPath === "." ? newFileName.trim() : `${currentPath}/${newFileName.trim()}`;
    try {
      await api.sandbox.writeFile(activeSandboxId, target, "");
      setNewFileName("");
      setIsCreatingFile(false);
      await fetchFiles(currentPath);
      handleOpenFile(target);
    } catch (err: any) {
      alert(`Failed to create file: ${err.message}`);
    }
  };

  const handleCopyId = () => {
    if (!activeSandboxId) return;
    navigator.clipboard.writeText(activeSandboxId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)", backgroundColor: "var(--bg-primary)" }}>
      {/* Top Sandbox Bar */}
      <div
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          backgroundColor: "var(--bg-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 10px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <Cpu size={16} color="var(--accent-indigo)" />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>Sandbox:</span>
            <select
              value={activeSandboxId}
              onChange={(e) => setActiveSandboxId(e.target.value)}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                border: "none",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              {sandboxes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} ({s.status})
                </option>
              ))}
            </select>

            <button
              onClick={handleCopyId}
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: "2px", display: "flex" }}
              title="Copy Sandbox ID"
            >
              {copied ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} color="var(--text-muted)" />}
            </button>
          </div>

          <button
            className="btn btn-secondary"
            onClick={handleCreateSandbox}
            disabled={isLoading}
            style={{ fontSize: "12px", height: "30px", padding: "0 10px" }}
          >
            <Plus size={13} />
            <span>New Sandbox</span>
          </button>

          {activeSandboxId && (
            <button
              className="btn btn-ghost"
              onClick={handleTerminateSandbox}
              style={{ fontSize: "12px", height: "30px", color: "var(--accent-rose)" }}
              title="Terminate Sandbox Environment"
            >
              <Trash2 size={13} />
              <span>Terminate</span>
            </button>
          )}
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "3px",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            gap: "4px",
          }}
        >
          <button
            onClick={() => setActiveTab("terminal")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 500,
              borderRadius: "4px",
              border: "none",
              cursor: "pointer",
              backgroundColor: activeTab === "terminal" ? "var(--bg-secondary)" : "transparent",
              color: activeTab === "terminal" ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: activeTab === "terminal" ? "var(--shadow-sm)" : "none",
            }}
          >
            <Terminal size={13} />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab("files")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 500,
              borderRadius: "4px",
              border: "none",
              cursor: "pointer",
              backgroundColor: activeTab === "files" ? "var(--bg-secondary)" : "transparent",
              color: activeTab === "files" ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: activeTab === "files" ? "var(--shadow-sm)" : "none",
            }}
          >
            <FolderTree size={13} />
            <span>Files</span>
          </button>

          <button
            onClick={() => setActiveTab("browser")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 500,
              borderRadius: "4px",
              border: "none",
              cursor: "pointer",
              backgroundColor: activeTab === "browser" ? "var(--bg-secondary)" : "transparent",
              color: activeTab === "browser" ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: activeTab === "browser" ? "var(--shadow-sm)" : "none",
            }}
          >
            <Globe size={13} />
            <span>Web Preview</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {/* TAB 1: TERMINAL */}
        {activeTab === "terminal" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#0f1117" }}>
            {/* Quick Command Chips */}
            <div
              style={{
                padding: "8px 16px",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                overflowX: "auto",
              }}
            >
              <span style={{ fontSize: "11px", color: "#8a919e", fontWeight: 500 }}>Quick run:</span>
              {[
                "pwd && ls -la",
                "node -v && python3 --version",
                "git status",
                "env | grep -v 'KEY\\|SECRET\\|PASS'",
                "cat /etc/os-release",
              ].map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => handleRunCommand(cmd)}
                  disabled={isRunningCommand}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    color: "#cbd5e1",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cmd}
                </button>
              ))}

              <button
                onClick={() => setCommandLogs([])}
                style={{
                  marginLeft: "auto",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  border: "none",
                  backgroundColor: "transparent",
                  color: "#64748b",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Clear Output
              </button>
            </div>

            {/* Terminal Logs Scroll Area */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>
              {commandLogs.length === 0 ? (
                <div style={{ color: "#64748b", textAlign: "center", marginTop: "40px" }}>
                  <Terminal size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
                  <p>AgentForge Isolated Sandbox Shell Ready</p>
                  <p style={{ fontSize: "11px", marginTop: "4px" }}>Type any bash command below to execute inside the sandbox workspace.</p>
                </div>
              ) : (
                commandLogs.map((log) => (
                  <div key={log.id} style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#38bdf8" }}>
                      <span style={{ color: "#10b981" }}>➜</span>
                      <span style={{ color: "#94a3b8" }}>sandbox$</span>
                      <span style={{ fontWeight: 600, color: "#f8fafc" }}>{log.command}</span>
                      <span style={{ marginLeft: "auto", fontSize: "10px", color: "#64748b" }}>
                        {log.timestamp} {log.durationMs !== undefined ? `(${log.durationMs}ms)` : ""}
                      </span>
                    </div>

                    {log.stdout && (
                      <pre style={{ margin: "6px 0 0 16px", whiteSpace: "pre-wrap", color: "#e2e8f0", lineHeight: 1.5 }}>
                        {log.stdout}
                      </pre>
                    )}

                    {log.stderr && (
                      <pre style={{ margin: "6px 0 0 16px", whiteSpace: "pre-wrap", color: "#f87171", lineHeight: 1.5 }}>
                        {log.stderr}
                      </pre>
                    )}

                    {log.exitCode !== null && log.exitCode !== 0 && (
                      <div style={{ margin: "4px 0 0 16px", fontSize: "11px", color: "#ef4444" }}>
                        Command exited with error code {log.exitCode}
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>

            {/* Command Input Bar */}
            <div
              style={{
                padding: "12px 16px",
                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                backgroundColor: "#090a0f",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span style={{ color: "#10b981", fontFamily: "var(--font-mono)", fontWeight: 700 }}>$</span>
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleRunCommand();
                  }
                }}
                placeholder={isRunningCommand ? "Command running..." : "Enter bash command (e.g. ls, npm install, python3 script.py)..."}
                disabled={isRunningCommand || !activeSandboxId}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#f8fafc",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                }}
              />

              <button
                className="btn btn-primary"
                onClick={() => handleRunCommand()}
                disabled={isRunningCommand || !commandInput.trim() || !activeSandboxId}
                style={{ height: "30px", padding: "0 12px", fontSize: "12px" }}
              >
                {isRunningCommand ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
                <span>Run</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: FILES EXPLORER */}
        {activeTab === "files" && (
          <div style={{ flex: 1, display: "flex", height: "100%" }}>
            {/* File List Side Panel */}
            <div
              style={{
                width: "280px",
                borderRight: "1px solid var(--border-subtle)",
                backgroundColor: "var(--bg-secondary)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Path & Actions */}
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Files ({currentPath})
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className="btn-icon btn-secondary"
                    onClick={() => setIsCreatingFile(true)}
                    style={{ width: "24px", height: "24px" }}
                    title="New File"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    className="btn-icon btn-secondary"
                    onClick={() => fetchFiles(currentPath)}
                    style={{ width: "24px", height: "24px" }}
                    title="Refresh"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>

              {/* Create new file inline input */}
              {isCreatingFile && (
                <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="filename.ts"
                    style={{
                      flex: 1,
                      padding: "4px 8px",
                      fontSize: "12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-subtle)",
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-primary)",
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateFile();
                      if (e.key === "Escape") setIsCreatingFile(false);
                    }}
                    autoFocus
                  />
                  <button className="btn btn-primary" onClick={handleCreateFile} style={{ height: "26px", padding: "0 8px", fontSize: "11px" }}>
                    Add
                  </button>
                </div>
              )}

              {/* Files list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
                {files.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                    No files found in workspace
                  </div>
                ) : (
                  files.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => !file.isDirectory && handleOpenFile(file.path)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "none",
                        backgroundColor: selectedFile === file.path ? "var(--bg-card)" : "transparent",
                        color: selectedFile === file.path ? "var(--text-primary)" : "var(--text-secondary)",
                        fontWeight: selectedFile === file.path ? 600 : 400,
                        fontSize: "12px",
                        cursor: file.isDirectory ? "default" : "pointer",
                        textAlign: "left",
                        marginBottom: "2px",
                      }}
                    >
                      {file.isDirectory ? <FolderTree size={14} color="var(--accent-amber)" /> : <FileText size={14} color="var(--accent-indigo)" />}
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        {file.isDirectory ? "dir" : `${Math.round(file.sizeBytes / 1024)}KB`}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Code / Text Editor Area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "var(--bg-card)" }}>
              {selectedFile ? (
                <>
                  <div
                    style={{
                      padding: "8px 16px",
                      borderBottom: "1px solid var(--border-subtle)",
                      backgroundColor: "var(--bg-secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                      {selectedFile}
                    </span>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveFile}
                      disabled={isSavingFile}
                      style={{ height: "28px", padding: "0 10px", fontSize: "12px" }}
                    >
                      <Save size={13} />
                      <span>{isSavingFile ? "Saving..." : "Save File"}</span>
                    </button>
                  </div>

                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "16px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      lineHeight: 1.6,
                      backgroundColor: "var(--bg-card)",
                      color: "var(--text-primary)",
                      border: "none",
                      outline: "none",
                      resize: "none",
                    }}
                  />
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  <FileText size={40} style={{ opacity: 0.3, marginBottom: "12px" }} />
                  <p style={{ fontSize: "13px" }}>Select a file from the explorer to view and edit</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: WEB PREVIEW */}
        {activeTab === "browser" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
            {/* URL Navigation Bar */}
            <div
              style={{
                padding: "8px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                backgroundColor: "var(--bg-secondary)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <input
                type="text"
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setBrowserIframeSrc(browserUrl);
                }}
                style={{
                  flex: 1,
                  padding: "6px 12px",
                  fontSize: "12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-input)",
                  color: "var(--text-primary)",
                }}
              />

              <button
                className="btn btn-secondary"
                onClick={() => setBrowserIframeSrc(browserUrl)}
                style={{ height: "30px", padding: "0 10px", fontSize: "12px" }}
              >
                <RefreshCw size={13} />
                <span>Navigate</span>
              </button>

              <a
                href={browserUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
                style={{ height: "30px", padding: "0 8px" }}
                title="Open in new window"
              >
                <ExternalLink size={14} />
              </a>
            </div>

            <iframe
              src={browserIframeSrc}
              title="Sandbox Web Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              style={{ flex: 1, width: "100%", border: "none", backgroundColor: "#fff" }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
