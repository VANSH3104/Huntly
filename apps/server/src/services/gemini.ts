import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDatabase, settings } from "@agentforge/database";
import { eq } from "drizzle-orm";

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
3. ONLY reorder sections, rephrase existing bullet points, and emphasize relevant existing skills.
4. Preserve all LaTeX commands and compilation integrity.
5. Keep the overall length similar.
6. Naturally incorporate job-relevant keywords into existing descriptions when truthful.

Return ONLY a JSON object:
{
  "tailoredLatex": "<complete modified LaTeX string>",
  "changes": ["<specific change made 1>", ...],
  "warnings": ["<any concern about the tailoring>"]
}

Return ONLY valid JSON. No markdown. No explanation outside JSON.
`;

    const text = await this.generateText(prompt, "You are an expert LaTeX editor. Output ONLY valid JSON.");
    const parsed = this.parseJsonFromText<{
      tailoredLatex: string;
      changes: string[];
      warnings: string[];
    }>(text);

    // Basic sanity check — if the output is significantly shorter, something went wrong
    if (parsed.tailoredLatex && parsed.tailoredLatex.length < latexResume.length * 0.5) {
      throw new Error("Tailored resume appears truncated — rejected for safety");
    }

    return parsed;
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
}

export const LLMClient = GeminiClient;
