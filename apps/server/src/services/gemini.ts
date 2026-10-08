import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDatabase, settings } from "@agentforge/database";
import { eq } from "drizzle-orm";
import { latexCompiler } from "./latex-compiler.js";

export interface LLMConfig {
  provider: "freellm" | "gemini" | "openai";
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class GeminiClient {
  private config: LLMConfig;

  constructor(customConfig?: Partial<LLMConfig>) {
    const provider = (customConfig?.provider ??
      process.env["LLM_PROVIDER"] ??
      (process.env["LLM_BASE_URL"] ? "freellm" : "gemini")) as LLMConfig["provider"];

    const baseUrl =
      customConfig?.baseUrl ??
      process.env["LLM_BASE_URL"] ??
      "http://127.0.0.1:31415/v1";

    const apiKey =
      customConfig?.apiKey ??
      process.env["LLM_API_KEY"] ??
      process.env["GEMINI_API_KEY"] ??
      "freellmapi-7d5b7932a1658638deebf67ab9ea1b699448421afa3587da";

    const model =
      customConfig?.model ??
      process.env["LLM_MODEL"] ??
      process.env["GEMINI_MODEL"] ??
      "auto";

    this.config = {
      provider,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey,
      model,
    };
  }

  /**
   * Helper to load dynamic runtime settings stored in the database
   */
  private async getRuntimeConfig(): Promise<LLMConfig> {
    try {
      const db = getDatabase();
      const rows = await db.select().from(settings);
      const settingsMap: Record<string, string> = {};
      for (const row of rows) {
        try {
          settingsMap[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        } catch {
          settingsMap[row.key] = row.value as string;
        }
      }

      return {
        provider: (settingsMap["llm.provider"] as any) || this.config.provider,
        baseUrl: (settingsMap["llm.baseUrl"] as any) || this.config.baseUrl,
        apiKey: (settingsMap["llm.apiKey"] as any) || (settingsMap["geminiApiKey"] as any) || this.config.apiKey,
        model: (settingsMap["llm.model"] as any) || this.config.model,
      };
    } catch {
      return this.config;
    }
  }

  /**
   * Universal text generation supporting FreeLLM (OpenAI-compatible) and direct Gemini
   */
  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const config = await this.getRuntimeConfig();

    if (config.provider === "freellm" || config.provider === "openai") {
      return this.callOpenAICompatible(config, prompt, systemPrompt);
    }

    // Direct Google Gemini API
    return this.callGeminiDirect(config, prompt);
  }

  private async callOpenAICompatible(
    config: LLMConfig,
    prompt: string,
    systemPrompt?: string
  ): Promise<string> {
    const modelsToTry = [config.model];
    // If auto or custom model, prepare fallbacks if upstream provider spikes
    if (config.model === "auto") {
      modelsToTry.push("gemini-3.5-flash", "gemini-3.6-flash");
    } else if (!modelsToTry.includes("auto")) {
      modelsToTry.push("auto");
    }

    let lastError: Error | null = null;

    for (const modelToAttempt of modelsToTry) {
      try {
        const messages: Array<{ role: string; content: string }> = [];
        if (systemPrompt) {
          messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: prompt });

        const url = `${config.baseUrl}/chat/completions`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: modelToAttempt,
            messages,
            temperature: 0.2,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`LLM API error (${res.status}): ${errText}`);
        }

        const data = (await res.json()) as any;
        if (data.error) {
          throw new Error(data.error.message || "LLM provider error");
        }

        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) {
          throw new Error("Empty response received from LLM API");
        }

        return content.trim();
      } catch (err: any) {
        lastError = err;
        console.warn(`[LLMClient] Attempt with model '${modelToAttempt}' failed:`, err.message);
        // Continue to fallback model if available
      }
    }

    throw lastError || new Error("Failed to generate response from LLM API");
  }

  private async callGeminiDirect(config: LLMConfig, prompt: string): Promise<string> {
    if (!config.apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    const genai = new GoogleGenerativeAI(config.apiKey);
    const model = genai.getGenerativeModel({
      model: config.model === "auto" ? "gemini-1.5-flash" : config.model,
    });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }

  private parseJsonFromText<T = unknown>(text: string): T {
    // 1. Try markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (jsonMatch?.[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {}
    }

    // 2. Try raw text
    try {
      return JSON.parse(text.trim());
    } catch {}

    // 3. Try to locate first '{' and last '}'
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = text.substring(firstBrace, lastBrace + 1);
      return JSON.parse(extracted);
    }

    throw new Error(`Failed to parse JSON response from LLM: ${text.slice(0, 300)}...`);
  }

  async analyzeJobMatch(job: Record<string, unknown>, parsedResume: Record<string, unknown>): Promise<unknown> {
    const prompt = `
You are a senior technical recruiter analyzing a job match.

RESUME SUMMARY:
${JSON.stringify(parsedResume, null, 2)}

JOB POSTING:
Title: ${job["title"]}
Company: ${job["companyId"]}
Description: ${String(job["description"]).slice(0, 3000)}

Analyze this match and return a JSON object with EXACTLY this structure:
{
  "matchScore": <number 0-100>,
  "summary": "<2-3 sentence summary of the match>",
  "strongestMatches": ["<skill or experience 1>", "<skill or experience 2>", ...],
  "missingRequirements": ["<gap 1>", "<gap 2>", ...],
  "concerns": ["<concern 1>", ...],
  "relevantResumeSections": ["<section name>", ...],
  "recommendedKeywords": ["<keyword>", ...],
  "applicationPriority": "<HIGH|MEDIUM|LOW>",
  "resumeTailoringSuggestions": ["<specific actionable suggestion>", ...]
}

Rules:
- Be specific and factual. Reference actual content.
- Never fabricate missing experience.
- matchScore should reflect realistic fit.
- Return ONLY valid JSON, no markdown, no explanation outside JSON.
`;

    const text = await this.generateText(prompt, "You are a professional technical recruiter. Output ONLY valid JSON.");
    return this.parseJsonFromText(text);
  }

  async tailorResume(
    latexResume: string,
    jobDescription: string,
    jobTitle: string,
    analysisJson: string
  ): Promise<{ tailoredLatex: string; changes: string[]; warnings: string[] }> {
    const prompt = `
You are an expert LaTeX resume editor. Tailor the resume for the job WITHOUT fabricating any information.

JOB TITLE: ${jobTitle}

JOB DESCRIPTION (excerpt):
${jobDescription.slice(0, 2000)}

AI ANALYSIS:
${analysisJson.slice(0, 1000)}

ORIGINAL LATEX RESUME:
${latexResume}

RULES (CRITICAL — violating these is unacceptable):
1. NEVER add experience, projects, companies, technologies, or metrics that do not exist in the original.
2. NEVER change dates, titles, GPAs, or metrics.
3. ONLY reorder sections, rephrase existing bullet points, and emphasize relevant existing skills truthfully.
4. PRESERVE THE EXACT PREAMBLE AND STRUCTURE: Keep all \\documentclass, \\usepackage, geometry margins, custom macros, font commands, and the header info (name, contacts) exactly as defined in the original.
5. KEEP SYNTAX VALID: Balance every \\begin{...} and \\end{...}.
6. SPECIAL CHARACTERS: In regular bullet text, always escape special characters (e.g. use \\& for &, \\% for %, \\_ for _).
7. Keep overall length strictly to 1 page if the original is 1 page.

OUTPUT FORMAT (STRICT):
Output your entire response using the following delimiters (do NOT put LaTeX inside a JSON string):

===CHANGES===
- [Specific change 1]
- [Specific change 2]

===WARNINGS===
- [Any caveat or gap, or None]

===LATEX===
[Complete, compilable LaTeX document starting with \\documentclass and ending with \\end{document}]
===END===
`;

    const text = await this.generateText(prompt, "You are an expert LaTeX resume editor. Output raw LaTeX with the exact delimiter tags requested.");

    let tailoredLatex = "";
    let changes: string[] = [];
    let warnings: string[] = [];

    // 1. Try parsing delimited blocks
    const latexMatch = text.match(/===LATEX===\s*([\s\S]*?)(?:===END===|$)/i) ||
                       text.match(/```(?:latex|tex)\s*([\s\S]*?)```/i);
    const changesMatch = text.match(/===CHANGES===\s*([\s\S]*?)(?:===WARNINGS===|===LATEX===|$)/i);
    const warningsMatch = text.match(/===WARNINGS===\s*([\s\S]*?)(?:===LATEX===|$)/i);

    if (latexMatch?.[1]) {
      tailoredLatex = latexMatch[1].trim();
      if (changesMatch?.[1]) {
        changes = changesMatch[1]
          .split("\n")
          .map((l) => l.replace(/^[-*•]\s*/, "").trim())
          .filter(Boolean);
      }
      if (warningsMatch?.[1]) {
        warnings = warningsMatch[1]
          .split("\n")
          .map((l) => l.replace(/^[-*•]\s*/, "").trim())
          .filter((l) => Boolean(l) && !l.toLowerCase().includes("none"));
      }
    } else {
      // 2. Fallback: try parsing JSON if LLM returned JSON
      try {
        const parsed = this.parseJsonFromText<{
          tailoredLatex?: string;
          tailoredLaTeX?: string;
          changes?: string[];
          warnings?: string[];
        }>(text);
        tailoredLatex = parsed.tailoredLatex || parsed.tailoredLaTeX || "";
        changes = parsed.changes || [];
        warnings = parsed.warnings || [];
      } catch {
        // 3. Fallback: If text itself looks like LaTeX
        if (text.includes("\\documentclass") || text.includes("\\begin{document}")) {
          tailoredLatex = text;
        } else {
          throw new Error("Failed to parse valid LaTeX from AI response");
        }
      }
    }

    // Sanitize and protect LaTeX formatting integrity
    tailoredLatex = latexCompiler.sanitizeLatex(tailoredLatex, latexResume);

    // Basic sanity check — if the output is significantly shorter, something went wrong
    if (tailoredLatex && tailoredLatex.length < latexResume.length * 0.45) {
      throw new Error("Tailored resume appears truncated — rejected for safety");
    }

    return {
      tailoredLatex,
      changes,
      warnings,
    };
  }

  async generateCoverLetter(
    parsedResume: Record<string, unknown>,
    job: Record<string, unknown>,
    companyName: string
  ): Promise<string> {
    const prompt = `
Write a concise, professional cover letter for this software engineering job application.

CANDIDATE RESUME DATA:
${JSON.stringify(parsedResume, null, 2)}

JOB:
Title: ${job["title"]}
Company: ${companyName}
Description: ${String(job["description"]).slice(0, 1500)}

Requirements:
- 3 paragraphs maximum
- Professional but personable tone
- Reference specific, real experience from the resume
- Do NOT fabricate experience
- Return plain text only
`;

    return this.generateText(prompt, "You are a professional cover letter writer.");
  }

  async generateSearchCombinations(
    role: string,
    keywords: string,
    location: string,
    candidateSkills: string[] = []
  ): Promise<Array<{ query: string; category: string; description: string }>> {
    const prompt = `
You are an expert technical recruiting AI specialized in sourcing jobs across LinkedIn, Y Combinator, and official ATS boards (Greenhouse, Lever, Ashby).

CANDIDATE / TARGET PROFILE:
Role: ${role || "Software Engineer"}
Keywords: ${keywords || "TypeScript, Node.js, React"}
Location: ${location || "India, Remote"}
Top Candidate Skills: ${candidateSkills.slice(0, 15).join(", ") || "TypeScript, React, Node.js, Python, PostgreSQL"}

Generate 8 to 12 diverse, high-yield job search combinations across multiple dimensions to find hidden matching opportunities:
1. Role Synonyms & Titles (e.g. "Full Stack Developer", "Founding Engineer", "Software Development Engineer II")
2. Core Tech Stack Permutations (e.g. "Node.js React TypeScript", "Golang Distributed Systems", "Fullstack FastAPI")
3. Startup & YC Angles (e.g. "YC Founding Engineer", "Early Stage Startup Software Engineer", "Seed stage Full Stack")
4. ATS Direct Portals (e.g. "Software Engineer site:ashbyhq.com", "Full Stack Developer site:greenhouse.io", "Backend Engineer site:lever.co")
5. High-Intent Keywords (e.g. "Hiring Full Stack Remote", "Founding Developer")

Return ONLY valid JSON with this structure:
{
  "combinations": [
    {
      "query": "<exact search query string>",
      "category": "<role|stack|startup_yc|ats_portal|intent>",
      "description": "<short 1-line reason>"
    }
  ]
}
`;

    try {
      const text = await this.generateText(prompt, "You are a technical recruiting sourcing expert. Output ONLY valid JSON.");
      const parsed = this.parseJsonFromText<{
        combinations: Array<{ query: string; category: string; description: string }>;
      }>(text);
      return parsed.combinations || [];
    } catch (err) {
      console.error("[Gemini] Failed to generate search combinations:", err);
      const baseRole = role || keywords || "Software Engineer";
      return [
        { query: `${baseRole} ${location}`, category: "role", description: "Direct target role and location" },
        { query: `Founding Engineer ${baseRole}`, category: "startup_yc", description: "Early-stage & YC startup roles" },
        { query: `${baseRole} site:ashbyhq.com`, category: "ats_portal", description: "Ashby high-growth startup board" },
        { query: `${baseRole} site:greenhouse.io`, category: "ats_portal", description: "Greenhouse verified career pages" },
        { query: `${baseRole} site:lever.co`, category: "ats_portal", description: "Lever verified career pages" },
        { query: `${baseRole} Remote`, category: "role", description: "Global and remote positions" },
      ];
    }
  }

  /**
   * Generates high-converting Cold DM, Cold Email, and LinkedIn note for founders / recruiters
   */
  async generateColdOutreach(params: {
    jobTitle: string;
    companyName: string;
    platform: string;
    jobDescription: string;
    founderHandle?: string;
    contactEmail?: string;
    candidateResumeText?: string;
    candidateSkills?: string[];
  }): Promise<{
    twitterDM: string;
    coldEmail: { subject: string; body: string };
    linkedInNote: string;
    keyHook: string;
  }> {
    const prompt = `
You are a world-class startup talent connector and cold outreach specialist.
A candidate wants to reach out directly to the founder / engineering hiring manager for this opportunity.

OPPORTUNITY DETAILS:
- Company: ${params.companyName}
- Role: ${params.jobTitle}
- Platform: ${params.platform.toUpperCase()}
- Founder/Contact Handle: ${params.founderHandle || "Founder / Hiring Team"}
- Contact Email: ${params.contactEmail || "N/A"}
- Job Description/Post Snippet:
"""
${params.jobDescription.slice(0, 1000)}
"""

CANDIDATE BACKGROUND:
- Top Skills: ${(params.candidateSkills || []).slice(0, 10).join(", ") || "TypeScript, Node.js, React, Python, PostgreSQL"}
- Resume Context:
"""
${(params.candidateResumeText || "").slice(0, 1200) || "Experienced software engineer with strong full-stack and systems background."}
"""

YOUR TASK:
Generate 3 tailored, punchy, high-response outreach templates:
1. "twitterDM": Max 260 characters. Punchy, authentic, references what they're building, mentions candidate's exact relevant skill/proof of work, asks a low-friction question (e.g. "Open to a quick 5-min chat or demo?").
2. "coldEmail": High-converting 3-paragraph email with a curiosity-driven subject line, mentioning the specific startup mission, candidate's concrete experience/projects, and clear call-to-action.
3. "linkedInNote": Max 280 characters for a personalized connection invitation.
4. "keyHook": A 1-sentence explanation of why this message will grab their attention.

Return ONLY valid JSON matching this schema:
{
  "twitterDM": "<text>",
  "coldEmail": {
    "subject": "<subject>",
    "body": "<email body>"
  },
  "linkedInNote": "<text>",
  "keyHook": "<1 sentence hook>"
}
`;

    try {
      const text = await this.generateText(prompt, "You are an elite cold outreach copywriter. Output ONLY valid JSON.");
      const parsed = this.parseJsonFromText<{
        twitterDM: string;
        coldEmail: { subject: string; body: string };
        linkedInNote: string;
        keyHook: string;
      }>(text);

      return {
        twitterDM: parsed.twitterDM || `Hey ${params.founderHandle || "there"}, saw your post about building ${params.companyName}. Built similar full-stack systems with ${params.candidateSkills?.[0] || "TypeScript"}. Would love to help you scale—mind if I send over my portfolio?`,
        coldEmail: parsed.coldEmail || {
          subject: `${params.jobTitle} at ${params.companyName} — Quick Intro`,
          body: `Hi ${params.companyName} team,\n\nSaw your opening for ${params.jobTitle} and loved what you're building. With my background in ${params.candidateSkills?.slice(0, 3).join(", ") || "full-stack development"}, I'd love to contribute immediately to your roadmap.\n\nLooking forward to connecting!`,
        },
        linkedInNote: parsed.linkedInNote || `Hi! Came across ${params.companyName}'s work on ${params.jobTitle}. Passionate about your mission and would love to connect!`,
        keyHook: parsed.keyHook || "Directly links candidate skills to company's stated tech stack.",
      };
    } catch (err) {
      console.error("[Gemini] Failed to generate cold outreach:", err);
      return {
        twitterDM: `Hey ${params.founderHandle || "there"}, saw your post about hiring for ${params.companyName}. Have experience in ${params.candidateSkills?.[0] || "TypeScript/React"}. Would love to chat!`,
        coldEmail: {
          subject: `${params.jobTitle} Application — ${params.companyName}`,
          body: `Hi,\n\nI came across your hiring post for ${params.jobTitle} at ${params.companyName}. Given my background in ${params.candidateSkills?.slice(0, 3).join(", ") || "modern web systems"}, I'd love to explore how I can add value to your team.\n\nBest regards,`,
        },
        linkedInNote: `Hi! Saw the ${params.jobTitle} opening at ${params.companyName}. Would love to connect!`,
        keyHook: "Concise direct outreach referencing the role.",
      };
    }
  }
}

export const LLMClient = GeminiClient;

