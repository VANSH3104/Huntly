import { GeminiClient } from "../../services/gemini.js";
import { getDatabase, settings } from "@agentforge/database";
import { eq } from "drizzle-orm";
import type { ApplicantProfile } from "./types.js";

const geminiService = new GeminiClient();

export class AIAnswerGenerator {
  /**
   * Retrieves a previously remembered answer from persistent SQLite memory.
   */
  public async getRememberedAnswer(question: string): Promise<string | null> {
    try {
      const db = getDatabase();
      const [row] = await db.select().from(settings).where(eq(settings.key, "autoApplyMemory")).limit(1);
      if (!row?.value) return null;
      const memory = JSON.parse(row.value) as Record<string, string>;
      const normalizedQ = question.trim().toLowerCase();

      // 1. Exact match
      if (memory[normalizedQ]) return memory[normalizedQ];

      // 2. Fuzzy / keyword match for recurring screening questions
      for (const [key, answer] of Object.entries(memory)) {
        if (key.length >= 6 && (normalizedQ.includes(key) || key.includes(normalizedQ))) {
          return answer;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Persists a question-answer pair to database memory so it is remembered forever.
   */
  public async saveRememberedAnswer(question: string, answer: string): Promise<void> {
    try {
      const db = getDatabase();
      const [row] = await db.select().from(settings).where(eq(settings.key, "autoApplyMemory")).limit(1);
      let memory: Record<string, string> = {};
      if (row?.value) {
        try {
          memory = JSON.parse(row.value);
        } catch {
          // ignore
        }
      }

      const normalizedQ = question.trim().toLowerCase();
      memory[normalizedQ] = answer.trim();

      await db
        .insert(settings)
        .values({
          key: "autoApplyMemory",
          value: JSON.stringify(memory),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: JSON.stringify(memory),
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      console.warn("[AIAnswerGenerator] Failed to save answer memory:", err);
    }
  }

  /**
   * Generates a tailored answer to an application screening question, checking memory first.
   */
  public async generateAnswer(params: {
    question: string;
    jobTitle: string;
    company: string;
    jobDescription: string;
    profile: ApplicantProfile;
    options?: string[];
    resumeContext?: string;
  }): Promise<string> {
    const { question, jobTitle, company, jobDescription, profile, options, resumeContext } = params;
    const resumeBlock = resumeContext
      ? `\nCandidate resume (the only source of facts about the candidate):\n${resumeContext}\n`
      : "";

    // 1. Check persistent memory
    const remembered = await this.getRememberedAnswer(question);
    if (remembered) {
      if (options && options.length > 0) {
        const matched = options.find((o) => o.toLowerCase() === remembered.toLowerCase() || o.toLowerCase().includes(remembered.toLowerCase()));
        if (matched) return matched;
      } else {
        return remembered;
      }
    }

    const lowerQ = question.toLowerCase();

    // 2. Quick direct logic for well-known standard questions
    let directAnswer: string | null = null;
    if (lowerQ.includes("years of experience") || lowerQ.includes("how many years")) {
      directAnswer = String(profile.yearsOfExperience || 1);
    } else if (lowerQ.includes("authorized to work") || lowerQ.includes("legally authorized")) {
      if (options && options.length > 0) {
        const yesOpt = options.find((o) => /^yes/i.test(o));
        directAnswer = yesOpt || (profile.authorizedToWork ? "Yes" : "No");
      } else {
        directAnswer = profile.authorizedToWork ? "Yes" : "No";
      }
    } else if (lowerQ.includes("require sponsorship") || lowerQ.includes("sponsorship in the future")) {
      if (options && options.length > 0) {
        const noOpt = options.find((o) => /^no/i.test(o));
        directAnswer = noOpt || (profile.requireSponsorship ? "Yes" : "No");
      } else {
        directAnswer = profile.requireSponsorship ? "Yes" : "No";
      }
    } else if (lowerQ.includes("notice period")) {
      directAnswer = `${profile.noticePeriodDays || 0} days (immediate/flexible)`;
    } else if (lowerQ.includes("expected salary") || lowerQ.includes("salary expectations")) {
      directAnswer = profile.expectedSalary || "Negotiable / Competitive as per industry standards";
    }

    if (directAnswer) {
      await this.saveRememberedAnswer(question, directAnswer);
      return directAnswer;
    }

    // 3. If options are provided (like multiple choice or dropdown), pick the most suitable option via AI
    if (options && options.length > 0) {
      const prompt = `You are filling out a job application for ${profile.fullName} applying for ${jobTitle} at ${company}.
Question: "${question}"
Available Options:
${options.map((opt, i) => `${i + 1}. ${opt}`).join("\n")}

Job description snippet:
${jobDescription.slice(0, 500)}
${resumeBlock}

Candidate Profile:
- Name: ${profile.fullName}
- Experience: ${profile.yearsOfExperience} years
- Work Auth: ${profile.authorizedToWork ? "Authorized" : "Not authorized"}, Sponsorship needed: ${profile.requireSponsorship ? "Yes" : "No"}

Select ONLY the single best option matching the candidate. Return EXACTLY the text of the selected option, nothing else.`;

      try {
        const aiResponse = await geminiService.generateText(prompt);
        const cleaned = aiResponse.trim().replace(/^[\d\.\-\s]+/, "").trim();
        const matched = options.find((o) => o.toLowerCase() === cleaned.toLowerCase() || o.toLowerCase().includes(cleaned.toLowerCase()));
        const finalOption = matched;
        if (!finalOption) return "";
        await this.saveRememberedAnswer(question, finalOption);
        return finalOption;
      } catch (err) {
        console.warn("[AIAnswerGenerator] Option pick failed:", err instanceof Error ? err.message : err);
        return "";
      }
    }

    // 4. Open-ended response generation with Gemini
    const prompt = `You are an executive career advisor writing a concise, authentic response for a job application form.
Candidate: ${profile.fullName}
Role: ${jobTitle} at ${company}
Question: "${question}"

Candidate Details:
- Location: ${profile.location || "not specified"}
- Current: ${profile.currentTitle || "Software Engineer"} at ${profile.currentCompany || "Technology"}
- Years Experience: ${profile.yearsOfExperience}
- Skills & Background: Strong software development, problem solving, fullstack & backend engineering

${resumeBlock}
Instructions:
- Ground every claim in the resume above. Never invent employers, degrees, dates or numbers.
- Write a direct, compelling response in first-person ("I").
- Keep it between 2 to 4 sentences maximum (suitable for a text area field).
- Never write bracketed placeholders such as [City]. If a detail is unknown, answer with what is known.
- Match the length to the question: a one-line question gets one short sentence.
- Do not use cheesy clichés or greetings. Answer the question directly with confidence and relevant specifics.`;

    try {
      const response = await geminiService.generateText(prompt);
      const answer = response.trim().replace(/^"/, "").replace(/"$/, "");
      await this.saveRememberedAnswer(question, answer);
      return answer;
    } catch (err) {
      console.warn("[AIAnswerGenerator] Answer generation failed:", err instanceof Error ? err.message : err);
      return "";
    }
  }
}

export const aiAnswerGenerator = new AIAnswerGenerator();
