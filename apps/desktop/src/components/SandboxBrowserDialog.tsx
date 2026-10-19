import React, { useState, useEffect, useRef } from "react";
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  ExternalLink,
  Camera,
  Terminal,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Send,
  Sliders,
  Maximize2,
} from "lucide-react";
import { api } from "../lib/api";

interface SandboxBrowserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
}

export const SandboxBrowserDialog: React.FC<SandboxBrowserDialogProps> = ({
  isOpen,
  onClose,
  initialUrl = "http://localhost:5173",
}) => {
  const [url, setUrl] = useState<string>(initialUrl);
  const [currentUrl, setCurrentUrl] = useState<string>(initialUrl);
  const [pageTitle, setPageTitle] = useState<string>("");
  const [screenshot, setScreenshot] = useState<string>("");
  const [status, setStatus] = useState<number>(200);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<Array<{ type: string; text: string; time: string }>>([]);
  const [showConsole, setShowConsole] = useState<boolean>(false);
  const [typeInput, setTypeInput] = useState<string>("");
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 1280, height: 800 });
  const [history, setHistory] = useState<string[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);

  const quickPresets = [
    { label: "Vite Dev (5173)", url: "http://localhost:5173" },
    { label: "Local App (3000)", url: "http://localhost:3000" },
    { label: "Server API (8080)", url: "http://localhost:8080/api/health" },
    { label: "Hacker News", url: "https://news.ycombinator.com" },
    { label: "GitHub", url: "https://github.com" },
  ];

  useEffect(() => {
    if (isOpen) {
      handleNavigate(initialUrl);
    }
  }, [isOpen]);

  const handleNavigate = async (targetUrl: string) => {
    if (!targetUrl.trim()) return;
    setIsLoading(true);
    try {
      const res = await api.sandbox.browser.navigate(targetUrl, viewport);
      applyState(res);
      setHistory((prev) => (prev.includes(targetUrl) ? prev : [targetUrl, ...prev].slice(0, 10)));
    } catch (err: any) {
      console.error("Navigation error:", err);
      setLogs((prev) => [
        ...prev,
        { type: "error", text: `Navigation failed: ${err.message}`, time: new Date().toLocaleTimeString() },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const applyState = (res: any) => {
    if (!res) return;
    if (res.url) {
      setUrl(res.url);
      setCurrentUrl(res.url);
    }
    if (res.title) setPageTitle(res.title);
    if (res.screenshot) setScreenshot(res.screenshot);
    if (res.status) setStatus(res.status);
    if (res.consoleLogs) setLogs(res.consoleLogs);
    if (res.viewport) setViewport(res.viewport);
  };

  const handleBack = async () => {
    setIsLoading(true);
    try {
      const res = await api.sandbox.browser.back();
      applyState(res);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForward = async () => {
    setIsLoading(true);
    try {
      const res = await api.sandbox.browser.forward();
      applyState(res);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReload = async () => {
    setIsLoading(true);
    try {
      const res = await api.sandbox.browser.reload();
      applyState(res);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Scale from displayed CSS dimensions to native viewport
    const scaleX = viewport.width / rect.width;
    const scaleY = viewport.height / rect.height;
    const actualX = Math.round(clickX * scaleX);
    const actualY = Math.round(clickY * scaleY);

    setIsLoading(true);
    try {
      const res = await api.sandbox.browser.click({ x: actualX, y: actualY });
      applyState(res);
    } catch (err: any) {
      console.error("Click error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendType = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!typeInput.trim()) return;
    setIsLoading(true);
    try {
      const res = await api.sandbox.browser.type(typeInput);
      applyState(res);
      setTypeInput("");
    } catch (err: any) {
      console.error("Type error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScroll = async (deltaY: number) => {
    setIsLoading(true);
    try {
      const res = await api.sandbox.browser.scroll(deltaY);
      applyState(res);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadScreenshot = () => {
    if (!screenshot) return;
    const a = document.createElement("a");
    a.href = screenshot;
    a.download = `sandbox-browser-${Date.now()}.png`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "95vw",
          maxWidth: "1280px",
          height: "90vh",
          backgroundColor: "#161822",
          borderRadius: "12px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.6)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Top Window Bar */}
        <div
          style={{
            height: "44px",
            backgroundColor: "#0d0e15",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            justifyContent: "space-between",
          }}
        >
          {/* Traffic lights & Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={onClose}
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  backgroundColor: "#ff5f56",
                  border: "none",
                  cursor: "pointer",
                }}
                title="Close dialog"
              />
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#ffbd2e" }} />
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#27c93f" }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "10px" }}>
              <Globe size={14} color="#6366f1" />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                Sandbox Browser
              </span>
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 6px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  color: "#818cf8",
                  fontWeight: 600,
                }}
              >
                Playwright Live Engine
              </span>
            </div>
          </div>

          {/* Quick presets */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {quickPresets.map((preset) => (
              <button
                key={preset.url}
                onClick={() => {
                  setUrl(preset.url);
                  handleNavigate(preset.url);
                }}
                style={{
                  padding: "3px 8px",
                  fontSize: "11px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Right Action Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setShowConsole(!showConsole)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 8px",
                fontSize: "11px",
                borderRadius: "4px",
                backgroundColor: showConsole ? "rgba(99, 102, 241, 0.2)" : "transparent",
                color: showConsole ? "#a5b4fc" : "var(--text-secondary)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                cursor: "pointer",
              }}
              title="Toggle Console Logs"
            >
              <Terminal size={12} />
              <span>Console ({logs.length})</span>
            </button>

            <button
              onClick={downloadScreenshot}
              style={{
                padding: "4px 8px",
                borderRadius: "4px",
                backgroundColor: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                cursor: "pointer",
              }}
              title="Download Screenshot"
            >
              <Camera size={13} />
            </button>

            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "4px 8px",
                borderRadius: "4px",
                color: "var(--text-secondary)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                display: "flex",
                alignItems: "center",
              }}
              title="Open in Native Browser"
            >
              <ExternalLink size={13} />
            </a>

            <button
              onClick={onClose}
              style={{
                padding: "4px 8px",
                borderRadius: "4px",
                backgroundColor: "transparent",
                color: "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Omnibar / Address Navigation Bar */}
        <div
          style={{
            height: "44px",
            backgroundColor: "#12141c",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            gap: "8px",
          }}
        >
          {/* Back, Forward, Reload */}
          <button
            onClick={handleBack}
            disabled={isLoading}
            style={{
              padding: "6px",
              borderRadius: "4px",
              backgroundColor: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
            title="Back"
          >
            <ArrowLeft size={14} />
          </button>

          <button
            onClick={handleForward}
            disabled={isLoading}
            style={{
              padding: "6px",
              borderRadius: "4px",
              backgroundColor: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
            title="Forward"
          >
            <ArrowRight size={14} />
          </button>

          <button
            onClick={handleReload}
            disabled={isLoading}
            style={{
              padding: "6px",
              borderRadius: "4px",
              backgroundColor: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
            title="Reload"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
          </button>

          {/* URL Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleNavigate(url);
            }}
            style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "6px",
                padding: "0 10px",
                height: "32px",
              }}
            >
              <span style={{ fontSize: "11px", color: "#10b981", marginRight: "6px" }}>🔒</span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter URL (e.g. http://localhost:5173, https://news.ycombinator.com)..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
              {pageTitle && (
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    maxWidth: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginLeft: "8px",
                  }}
                >
                  {pageTitle}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary"
              style={{ height: "32px", padding: "0 14px", fontSize: "12px" }}
            >
              {isLoading ? "Loading..." : "Go"}
            </button>
          </form>
        </div>

        {/* Main Viewport Body */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", backgroundColor: "#0b0c10" }}>
          {/* Scroll & Interactive Screen */}
          <div
            style={{
              flex: 1,
              overflow: "auto",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              padding: "16px",
              position: "relative",
            }}
          >
            {isLoading && (
              <div
                style={{
                  position: "absolute",
                  top: "24px",
                  right: "24px",
                  zIndex: 20,
                  backgroundColor: "rgba(0, 0, 0, 0.7)",
                  backdropFilter: "blur(6px)",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  color: "#818cf8",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                }}
              >
                <Loader2 size={14} className="animate-spin" />
                <span>Navigating Playwright browser...</span>
              </div>
            )}

            {screenshot ? (
              <div style={{ position: "relative", boxShadow: "0 8px 30px rgba(0, 0, 0, 0.7)", borderRadius: "6px", overflow: "hidden" }}>
                <img
                  ref={imgRef}
                  src={screenshot}
                  alt="Real-time Sandbox Browser Viewport"
                  onClick={handleImageClick}
                  style={{
                    display: "block",
                    maxWidth: "100%",
                    height: "auto",
                    cursor: "crosshair",
                  }}
                  title="Click anywhere to interact with the page"
                />
              </div>
            ) : (
              <div
                style={{
                  marginTop: "80px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-secondary)",
                  gap: "14px",
                }}
              >
                <Globe size={48} color="#6366f1" />
                <p style={{ fontSize: "14px", fontWeight: 500 }}>
                  Ready to launch Sandboxed Browser
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => handleNavigate(url)}
                  disabled={isLoading}
                >
                  Start Browser Session
                </button>
              </div>
            )}
          </div>

          {/* Floating Scroll Controls */}
          <div
            style={{
              position: "absolute",
              right: "24px",
              bottom: "70px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              zIndex: 10,
            }}
          >
            <button
              onClick={() => handleScroll(-400)}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                backgroundColor: "rgba(22, 24, 34, 0.9)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
              title="Scroll Up"
            >
              <ChevronUp size={18} />
            </button>
            <button
              onClick={() => handleScroll(400)}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                backgroundColor: "rgba(22, 24, 34, 0.9)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
              title="Scroll Down"
            >
              <ChevronDown size={18} />
            </button>
          </div>

          {/* Live Console Drawer */}
          {showConsole && (
            <div
              style={{
                width: "340px",
                borderLeft: "1px solid rgba(255, 255, 255, 0.1)",
                backgroundColor: "#0d0e15",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Terminal size={13} color="#818cf8" />
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>Browser Console Logs</span>
                </div>
                <button
                  onClick={() => setShowConsole(false)}
                  style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                >
                  <X size={13} />
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "10px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  lineHeight: "1.5",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {logs.length === 0 ? (
                  <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                    No console events recorded yet.
                  </span>
                ) : (
                  logs.map((log, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        backgroundColor:
                          log.type === "error"
                            ? "rgba(239, 68, 68, 0.15)"
                            : log.type === "warn"
                            ? "rgba(245, 158, 11, 0.15)"
                            : "rgba(255, 255, 255, 0.03)",
                        color:
                          log.type === "error"
                            ? "#fca5a5"
                            : log.type === "warn"
                            ? "#fcd34d"
                            : "var(--text-secondary)",
                        wordBreak: "break-all",
                      }}
                    >
                      <span style={{ color: "var(--text-muted)", marginRight: "6px" }}>[{log.time}]</span>
                      <span>{log.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Interactive Bottom Bar (Type text into active input & Status) */}
        <div
          style={{
            height: "44px",
            backgroundColor: "#0d0e15",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          {/* Quick type into active field */}
          <form
            onSubmit={handleSendType}
            style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, maxWidth: "450px" }}
          >
            <input
              type="text"
              value={typeInput}
              onChange={(e) => setTypeInput(e.target.value)}
              placeholder="Type into active element / search box..."
              style={{
                flex: 1,
                height: "28px",
                padding: "0 10px",
                fontSize: "11px",
                borderRadius: "4px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                color: "var(--text-primary)",
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !typeInput.trim()}
              style={{
                height: "28px",
                padding: "0 10px",
                fontSize: "11px",
                borderRadius: "4px",
                border: "none",
                backgroundColor: "#4f46e5",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Send size={11} />
              <span>Type</span>
            </button>
          </form>

          {/* Status info */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", color: "var(--text-muted)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  backgroundColor: status >= 200 && status < 400 ? "#10b981" : "#ef4444",
                }}
              />
              HTTP {status}
            </span>
            <span>Viewport: {viewport.width}×{viewport.height}</span>
            <span style={{ color: "#818cf8" }}>Click image to navigate / click buttons</span>
          </div>
        </div>
      </div>
    </div>
  );
};
