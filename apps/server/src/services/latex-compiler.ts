import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";

const execFileAsync = promisify(execFile);

export interface CompileResult {
  success: boolean;
  filename: string;
  pdfBase64?: string;
  pdfBuffer?: Buffer;
  error?: string;
  log?: string;
}

export class LatexCompiler {
  private assetsDir: string;
  private binaryPath: string | null = null;

  constructor() {
    const serverRoot = path.resolve(
      process.cwd().includes("apps/server")
        ? process.cwd()
        : path.join(process.cwd(), "apps/server")
    );
    this.assetsDir = path.join(serverRoot, "assets", "tex");
  }

  /**
   * Discovers the best available pdflatex or xelatex binary on the host
   */
  private resolveCompilerBinary(): string {
    if (this.binaryPath) return this.binaryPath;

    const candidates = [
      "/Library/TeX/texbin/pdflatex",
      "/usr/local/bin/pdflatex",
      "/Library/TeX/texbin/xelatex",
      "/usr/bin/pdflatex",
      "pdflatex",
    ];

    for (const cand of candidates) {
      if (cand.startsWith("/")) {
        if (fs.existsSync(cand)) {
          this.binaryPath = cand;
          return cand;
        }
      } else {
        try {
          this.binaryPath = cand;
          return cand;
        } catch {
          // ignore
        }
      }
    }

    this.binaryPath = "/Library/TeX/texbin/pdflatex";
    return this.binaryPath;
  }

  /**
   * Sanitizes and validates LaTeX markup before compilation
   */
  public sanitizeLatex(latex: string, originalLatex?: string): string {
    let clean = latex.trim();

    // Remove any leading/trailing markdown code fences
    clean = clean.replace(/^```(?:latex|tex)?\s*\n?/i, "");
    clean = clean.replace(/\n?```\s*$/i, "");
    clean = clean.trim();

    // Repair common LLM JSON stringification corruptions:
    // \t in JSON becomes tab, converting \textbf -> <TAB>extbf
    clean = clean.replace(/\t(extbf|extit|exttt|itleformat|itlespacing)/g, "\\t$1");
    // \r in JSON becomes carriage return, converting \resumeItem -> <CR>esumeItem
    clean = clean.replace(/\r(esumeItem|esumeSubheading|esumeProjectHeading|esumeItemListStart|esumeItemListEnd)/g, "\\r$1");
    // \n in JSON becomes newline, converting \newline -> <LF>ewline
    clean = clean.replace(/\n(ewline|ewpage|ewcommand)/g, "\n\\n$1");

    // If preamble is missing or truncated, salvage from original
    if (!clean.includes("\\documentclass") && originalLatex && originalLatex.includes("\\begin{document}")) {
      const originalPreamble = originalLatex.split("\\begin{document}")[0];
      if (clean.includes("\\begin{document}")) {
        const body = clean.split("\\begin{document}")[1];
        clean = `${originalPreamble}\\begin{document}${body}`;
      } else {
        clean = `${originalPreamble}\\begin{document}\n${clean}\n\\end{document}`;
      }
    }

    // Ensure document closes
    if (!clean.includes("\\end{document}")) {
      clean += "\n\\end{document}\n";
    }

    // Split into preamble and body so preamble comments are never corrupted
    if (clean.includes("\\begin{document}")) {
      const [preamble, ...rest] = clean.split("\\begin{document}");
      let body = "\\begin{document}" + rest.join("\\begin{document}");

      // Fix unescaped % after numbers in body (e.g. "reduced latency by 25%" -> "reduced latency by 25\%")
      // Uses [ \t]* so it NEVER matches across newlines or breaks comments
      body = body.replace(/(\d+)[ \t]*(?<!\\)%(?=[ \t]*[a-zA-Z\.,;!\)]|$)/g, "$1\\%");

      // Fix unescaped & in plain text within body (e.g. R&D -> R\&D, AT&T -> AT\&T)
      body = body.replace(/([a-zA-Z0-9])[ \t]*(?<!\\)&[ \t]*([a-zA-Z0-9])/g, "$1 \\& $2");

      clean = `${preamble}${body}`;
    }

    return clean;
  }

  /**
   * Compiles LaTeX source entirely in-memory:
   * Uses an ephemeral temporary directory, reads the generated PDF directly into memory (Buffer + Base64),
   * immediately deletes all temporary files, and returns the result without saving to any folder.
   */
  async compile(
    latexSource: string,
    requestedFilename: string,
    originalLatex?: string
  ): Promise<CompileResult> {
    const sanitizedLatex = this.sanitizeLatex(latexSource, originalLatex);

    // Ensure filename ends with .pdf
    let cleanFilename = requestedFilename.trim();
    if (!cleanFilename.endsWith(".pdf")) {
      cleanFilename += ".pdf";
    }
    cleanFilename = cleanFilename.replace(/[^a-zA-Z0-9._-]/g, "_");

    const tmpDir = path.join(os.tmpdir(), `huntly-latex-${uuidv4()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const texFilePath = path.join(tmpDir, "resume.tex");
    fs.writeFileSync(texFilePath, sanitizedLatex, "utf-8");

    const compiler = this.resolveCompilerBinary();
    const texinputs = `.:${this.assetsDir}:${tmpDir}:`;

    try {
      const env = {
        ...process.env,
        TEXINPUTS: texinputs,
        PATH: `${path.dirname(compiler)}:${process.env["PATH"] || ""}`,
      };

      await execFileAsync(
        compiler,
        [
          "-interaction=nonstopmode",
          "-halt-on-error",
          `-output-directory=${tmpDir}`,
          texFilePath,
        ],
        {
          env,
          timeout: 25000,
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      const generatedPdfPath = path.join(tmpDir, "resume.pdf");
      if (!fs.existsSync(generatedPdfPath)) {
        throw new Error("Compiler completed without producing output PDF file");
      }

      // Read PDF completely into memory Buffer
      const pdfBuffer = fs.readFileSync(generatedPdfPath);
      const pdfBase64 = pdfBuffer.toString("base64");

      // Wipe temporary directory immediately — zero disk persistence
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}

      return {
        success: true,
        filename: cleanFilename,
        pdfBuffer,
        pdfBase64,
      };
    } catch (err: any) {
      let logContent = "";
      const logPath = path.join(tmpDir, "resume.log");
      if (fs.existsSync(logPath)) {
        try {
          logContent = fs.readFileSync(logPath, "utf-8");
        } catch {}
      }

      // Wipe temporary directory
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}

      const errorMsg = err.stderr || err.stdout || err.message || "LaTeX compilation failed";
      console.error("[LatexCompiler] Compilation failed:", errorMsg);

      return {
        success: false,
        filename: cleanFilename,
        error: errorMsg,
        log: logContent.slice(-2000),
      };
    }
  }
}

export const latexCompiler = new LatexCompiler();
