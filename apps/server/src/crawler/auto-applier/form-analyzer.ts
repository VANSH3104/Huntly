import type { Page } from "playwright";
import type { DetectedFormField, FormFieldCategory } from "./types.js";

export class FormAnalyzer {
  /**
   * Scans the active page for form elements, questions, and inputs.
   */
  public async analyzeForm(page: Page): Promise<DetectedFormField[]> {
    return await page.evaluate(() => {
      const results: Array<{
        selector: string;
        category: string;
        name: string;
        type: string;
        label: string;
        placeholder?: string;
        required: boolean;
        options?: Array<{ label: string; value: string }>;
        currentValue?: string;
      }> = [];

      // Find all input, select, textarea elements
      const elements = Array.from(
        document.querySelectorAll("input, select, textarea")
      ) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]!;
        const type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();

        // Skip hidden, submit, button, reset inputs
        if (["hidden", "submit", "button", "reset", "image"].includes(type)) {
          continue;
        }

        // Determine accessible label
        let labelText = "";

        // 1. Check aria-label or aria-labelledby
        if (el.getAttribute("aria-label")) {
          labelText = el.getAttribute("aria-label")!;
        } else if (el.getAttribute("aria-labelledby")) {
          const labelledByEl = document.getElementById(el.getAttribute("aria-labelledby")!);
          if (labelledByEl) labelText = labelledByEl.textContent || "";
        }

        // 2. Check associated <label for="...">
        if (!labelText && el.id) {
          const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (labelFor) labelText = labelFor.textContent || "";
        }

        // 3. Check closest parent <label>
        if (!labelText) {
          const parentLabel = el.closest("label");
          if (parentLabel) labelText = parentLabel.textContent || "";
        }

        // 4. Check closest field container / preceding text
        if (!labelText) {
          const container = el.closest(".field, .form-group, [class*='field'], [class*='input'], [class*='question'], tr, div");
          if (container) {
            const potentialLabel = container.querySelector("label, .label, [class*='title'], [class*='name']");
            if (potentialLabel && potentialLabel !== el) {
              labelText = potentialLabel.textContent || "";
            }
          }
        }

        const name = el.getAttribute("name") || el.getAttribute("id") || "";
        const placeholder = el.getAttribute("placeholder") || "";
        const combined = `${labelText} ${name} ${placeholder}`.toLowerCase();

        // Categorize field
        let category: FormFieldCategory = "unknown";

        if (type === "file" || combined.includes("resume") || combined.includes("cv") || combined.includes("curriculum")) {
          category = "resume";
        } else if (combined.includes("first name") || combined.includes("firstname") || combined.includes("given name") || name === "first_name") {
          category = "first_name";
        } else if (combined.includes("last name") || combined.includes("lastname") || combined.includes("surname") || combined.includes("family name") || name === "last_name") {
          category = "last_name";
        } else if (combined.includes("full name") || combined.includes("name") && !combined.includes("company")) {
          category = "full_name";
        } else if (type === "email" || combined.includes("email") || combined.includes("e-mail")) {
          category = "email";
        } else if (type === "tel" || combined.includes("phone") || combined.includes("mobile") || combined.includes("telephone")) {
          category = "phone";
        } else if (combined.includes("linkedin") || combined.includes("linked in")) {
          category = "linkedin";
        } else if (combined.includes("github") || combined.includes("git hub")) {
          category = "github";
        } else if (combined.includes("portfolio") || combined.includes("website") || combined.includes("personal site")) {
          category = "portfolio";
        } else if (combined.includes("city")) {
          category = "city";
        } else if (combined.includes("state") || combined.includes("province")) {
          category = "state";
        } else if (combined.includes("country")) {
          category = "country";
        } else if (combined.includes("location") || combined.includes("address")) {
          category = "location";
        } else if (combined.includes("cover letter") || combined.includes("note to hiring manager")) {
          category = "cover_letter";
        } else if (combined.includes("authorized") || combined.includes("legal right to work")) {
          category = "work_authorization";
        } else if (combined.includes("sponsorship") || combined.includes("visa")) {
          category = "sponsorship";
        } else if (combined.includes("gender")) {
          category = "gender";
        } else if (combined.includes("race") || combined.includes("ethnicity")) {
          category = "race";
        } else if (combined.includes("veteran")) {
          category = "veteran";
        } else if (combined.includes("disability")) {
          category = "disability";
        } else if (el.tagName.toLowerCase() === "textarea" || combined.includes("why") || combined.includes("experience") || combined.includes("describe") || combined.includes("tell us")) {
          category = "custom_question";
        }

        // Build unique CSS selector
        let selector = "";
        if (el.id) {
          selector = `#${CSS.escape(el.id)}`;
        } else if (el.getAttribute("name")) {
          selector = `${el.tagName.toLowerCase()}[name="${CSS.escape(el.getAttribute("name")!)}"]`;
        } else {
          selector = `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`;
        }

        // Options if select element
        let options: Array<{ label: string; value: string }> | undefined;
        if (el instanceof HTMLSelectElement) {
          options = Array.from(el.options).map((opt) => ({
            label: opt.text.trim(),
            value: opt.value,
          }));
        }

        results.push({
          selector,
          category,
          name,
          type,
          label: labelText.trim().replace(/\s+/g, " "),
          placeholder,
          required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true" || labelText.includes("*"),
          options,
          currentValue: el.value,
        });
      }

      return results as any;
    });
  }

  /**
   * Locates the primary submit button on the application page.
   */
  public async findSubmitButtonSelector(page: Page): Promise<string | null> {
    return await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll("button, input[type='submit'], [role='button'], a.btn")
      ) as HTMLElement[];

      const submitKeywords = [
        "submit application",
        "submit",
        "apply now",
        "send application",
        "complete application",
        "finish application",
      ];

      for (const btn of buttons) {
        const text = (btn.textContent || (btn as HTMLInputElement).value || "").toLowerCase().trim();
        const type = btn.getAttribute("type") || "";

        if (type === "submit" || submitKeywords.some((kw) => text.includes(kw))) {
          // Avoid search buttons or login buttons
          if (text.includes("search") || text.includes("sign in") || text.includes("log in") || text.includes("cookie")) {
            continue;
          }

          if (btn.id) return `#${CSS.escape(btn.id)}`;
          if (btn.getAttribute("name")) return `button[name="${CSS.escape(btn.getAttribute("name")!)}"]`;
          return null; // Playwright can click by text
        }
      }

      return null;
    });
  }
}

export const formAnalyzer = new FormAnalyzer();
