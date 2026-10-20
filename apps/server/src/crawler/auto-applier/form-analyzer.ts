import type { Frame, Page } from "playwright";
import type { DetectedFormField } from "./types.js";

type Surface = Page | Frame;

export class FormAnalyzer {
  /**
   * Picks the page or iframe that holds the application form (most fillable inputs).
   */
  public async findFormSurface(page: Page): Promise<Surface> {
    let best: Surface = page;
    let bestCount = await this.countInputs(page);
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      const count = await this.countInputs(frame);
      if (count > bestCount) {
        best = frame;
        bestCount = count;
      }
    }
    return best;
  }

  private async countInputs(surface: Surface): Promise<number> {
    try {
      return await surface.evaluate(
        () =>
          document.querySelectorAll(
            "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=search]), textarea, select"
          ).length
      );
    } catch {
      return 0;
    }
  }

  /**
   * Scans the surface for form controls. Radio inputs sharing a name are returned as one field.
   * Every control is tagged with data-af-idx so selectors stay unique and stable.
   */
  public async analyzeForm(surface: Surface, scope?: string): Promise<DetectedFormField[]> {
    return await surface.evaluate((scopeSel) => {
      const root: ParentNode = (scopeSel ? document.querySelector(scopeSel) : null) ?? document;
      const results: any[] = [];
      const seenRadioGroups = new Set<string>();
      const elements = Array.from(
        root.querySelectorAll("input, select, textarea")
      ) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

      const clean = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();

      const labelOf = (el: HTMLElement): string => {
        const aria = el.getAttribute("aria-label");
        if (aria) return clean(aria);
        const by = el.getAttribute("aria-labelledby");
        if (by) {
          const t = by
            .split(" ")
            .map((id) => document.getElementById(id)?.textContent || "")
            .join(" ");
          if (clean(t)) return clean(t);
        }
        if (el.id) {
          const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (l && clean(l.textContent)) return clean(l.textContent);
        }
        const parentLabel = el.closest("label");
        if (parentLabel && clean(parentLabel.textContent)) return clean(parentLabel.textContent);
        let node: HTMLElement | null = el.parentElement;
        for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
          const l = node.querySelector(":scope > label, :scope > legend, :scope > .label, :scope > [class*='label']");
          if (l && l !== el && clean(l.textContent)) return clean(l.textContent);
        }
        return clean(el.getAttribute("placeholder"));
      };

      const groupLabelOf = (el: HTMLElement): string => {
        const fs = el.closest("fieldset");
        const legend = fs?.querySelector("legend");
        if (legend && clean(legend.textContent)) return clean(legend.textContent);
        const rg = el.closest("[role=radiogroup], [role=group]");
        if (rg) {
          const by = rg.getAttribute("aria-labelledby");
          if (by) return clean(document.getElementById(by)?.textContent);
          const aria = rg.getAttribute("aria-label");
          if (aria) return clean(aria);
        }
        let node: HTMLElement | null = el.parentElement;
        for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
          if (node.querySelectorAll("input[type=radio]").length > 1) {
            const l = node.querySelector("legend, label:not(:has(input)), [class*='label'], [class*='title']");
            if (l && clean(l.textContent)) return clean(l.textContent);
            return clean(node.previousElementSibling?.textContent);
          }
        }
        return labelOf(el);
      };

      const categorize = (combined: string, type: string, tag: string, name: string): string => {
        if (type === "file" || /\bresume\b|\bcv\b|curriculum/.test(combined)) return "resume";
        if (/first name|firstname|given name|preferred first/.test(combined) || name === "first_name") return "first_name";
        if (/last name|lastname|surname|family name/.test(combined) || name === "last_name") return "last_name";
        if (/full name|legal name|your name/.test(combined) || (/\bname\b/.test(combined) && !/company|employer|school|university|reference/.test(combined))) return "full_name";
        if (type === "email" || /e-?mail/.test(combined)) return "email";
        if (type === "tel" || /phone|mobile|telephone/.test(combined)) return "phone";
        if (/linkedin/.test(combined)) return "linkedin";
        if (/github/.test(combined)) return "github";
        if (/portfolio|website|personal site|personal url/.test(combined)) return "portfolio";
        if (/cover letter|note to hiring/.test(combined)) return "cover_letter";
        if (/privacy notice|read and accept|i (agree|accept|acknowledge)|consent to|candidate notice/.test(combined)) return "consent";
        if (/how did you (hear|find|learn)|where did you (hear|learn|find)|referral source|source of application/.test(combined)) return "referral_source";
        if (/authori[sz]ed to work|legal right to work|legally (authori[sz]ed|eligible)|eligible to work|work authori[sz]ation/.test(combined)) return "work_authorization";
        if (/sponsor|visa/.test(combined)) return "sponsorship";
        if (/notice period|available to start|start date|earliest start/.test(combined)) return "notice_period";
        if (/salary|compensation|ctc|pay expectation/.test(combined)) return "salary";
        if (/gender|pronoun/.test(combined)) return "gender";
        if (/\brace\b|ethnic/.test(combined)) return "race";
        if (/veteran/.test(combined)) return "veteran";
        if (/disabilit/.test(combined)) return "disability";
        if (/\bcity\b/.test(combined)) return "city";
        if (/\bstate\b|province/.test(combined)) return "state";
        if (/country/.test(combined)) return "country";
        if (/location|address|where are you (based|located)|currently (located|reside)/.test(combined)) return "location";
        if (tag === "textarea" || /why|describe|tell us|explain|how did you/.test(combined)) return "custom_question";
        return "unknown";
      };

      const isNoise = (el: HTMLElement): boolean =>
        !!el.closest("[id*='cookie' i], [class*='cookie' i], [id*='onetrust' i], [class*='onetrust' i], [class*='cookie-banner' i], header nav, [role=search]");

      elements.forEach((el, i) => {
        const type = (el.getAttribute("type") || el.tagName.toLowerCase()).toLowerCase();
        if (["hidden", "submit", "button", "reset", "image", "search"].includes(type)) return;
        if ((el as HTMLInputElement).disabled || el.getAttribute("aria-hidden") === "true" && type !== "file") return;
        if (isNoise(el)) return;
        if (el.className?.toString().includes("requiredInput")) return;

        el.setAttribute("data-af-idx", String(i));
        const attrName = el.getAttribute("name") || "";
        // React forms re-render and drop temporary attributes, so prefer the id, then a unique name.
        const uniqueName = attrName && document.querySelectorAll(`[name="${CSS.escape(attrName)}"]`).length === 1;
        const selector = el.id
          ? `[id="${el.id.replace(/"/g, '\\"')}"]`
          : uniqueName
            ? `${el.tagName.toLowerCase()}[name="${attrName.replace(/"/g, '\\"')}"]`
            : `[data-af-idx="${i}"]`;
        const name = el.getAttribute("name") || el.getAttribute("id") || "";

        if (type === "radio") {
          const groupKey = name || `radio-${i}`;
          if (seenRadioGroups.has(groupKey)) return;
          seenRadioGroups.add(groupKey);
          const radios = Array.from(
            document.querySelectorAll(`input[type=radio]${name ? `[name="${CSS.escape(name)}"]` : ""}`)
          ) as HTMLInputElement[];
          const options = radios.map((r, ri) => {
            r.setAttribute("data-af-radio", `${i}-${ri}`);
            const own = r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null;
            const lab = clean(own?.textContent || r.closest("label")?.textContent || r.value);
            return { label: lab, value: `[data-af-radio="${i}-${ri}"]` };
          });
          const label = groupLabelOf(el);
          const required = radios.some((r) => r.required || r.getAttribute("aria-required") === "true") || /\*|✱/.test(label);
          results.push({
            selector,
            category: categorize(`${label} ${name}`.toLowerCase(), "radio", "input", name),
            name,
            type: "radio",
            label,
            required,
            options,
            currentValue: radios.find((r) => r.checked) ? "checked" : "",
          });
          return;
        }

        const label = labelOf(el);
        const placeholder = el.getAttribute("placeholder") || "";
        const combined = `${label} ${name} ${placeholder}`.toLowerCase();
        const isCombo =
          el.getAttribute("role") === "combobox" ||
          el.getAttribute("aria-haspopup") === "listbox" ||
          /select__input|react-select|combobox/i.test(el.className?.toString() || "");

        let options: Array<{ label: string; value: string }> | undefined;
        if (el instanceof HTMLSelectElement) {
          options = Array.from(el.options)
            .filter((o) => o.value !== "" || clean(o.text) !== "")
            .map((o) => ({ label: clean(o.text), value: o.value }));
        }

        results.push({
          selector,
          category: categorize(combined, type, el.tagName.toLowerCase(), name),
          name,
          type: isCombo ? "combobox" : type,
          label,
          placeholder,
          required:
            (el as HTMLInputElement).required ||
            el.getAttribute("aria-required") === "true" ||
            /\*|✱/.test(label),
          options,
          currentValue: (el as HTMLInputElement).value || "",
        });
      });

      for (const r of results) r.label = r.label.replace(/[*✱]+/g, "").replace(/\s+/g, " ").trim();
      return results;
    }, scope);
  }

  /**
   * Returns a locator-friendly description of the submit button, or null if none is found.
   */
  public async findSubmitButtonSelector(surface: Surface, scope?: string): Promise<string | null> {
    return await surface.evaluate((scopeSel) => {
      const root: ParentNode = (scopeSel ? document.querySelector(scopeSel) : null) ?? document;
      const buttons = Array.from(
        root.querySelectorAll("button, input[type='submit'], [role='button']")
      ) as HTMLElement[];
      const wanted = /submit( application)?|send application|complete application|finish application|apply( now)?$/i;
      const banned = /search|sign in|log in|cookie|save|back|cancel|linkedin|autofill/i;
      let found: HTMLElement | null = null;
      for (const btn of buttons) {
        const text = (btn.textContent || (btn as HTMLInputElement).value || "").trim();
        const visible = !!(btn.offsetWidth || btn.offsetHeight);
        if (!visible || banned.test(text)) continue;
        if (btn.getAttribute("type") === "submit" || wanted.test(text)) {
          found = btn;
          if (/submit/i.test(text)) break;
        }
      }
      if (!found) return null;
      found.setAttribute("data-af-submit", "1");
      return `[data-af-submit="1"]`;
    }, scope);
  }

  /**
   * Visible validation errors or required controls still empty after filling.
   */
  public async collectProblems(surface: Surface): Promise<{ invalid: string[]; captcha: boolean }> {
    return await surface.evaluate(() => {
      const clean = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();
      const invalid = Array.from(document.querySelectorAll("[aria-invalid='true'], .error:not(:empty), [class*='error' i]:not(:empty)"))
        .filter((e) => (e as HTMLElement).offsetWidth || (e as HTMLElement).offsetHeight)
        .map((e) => clean(e.textContent).slice(0, 120))
        .filter((t) => t.length > 0 && t.length < 120);
      const captcha = !!document.querySelector(
        "iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha, .h-captcha, [data-sitekey]"
      );
      return { invalid: Array.from(new Set(invalid)).slice(0, 6), captcha };
    });
  }
  /**
   * Visible links and buttons, tagged so an LLM can pick one by id.
   */
  public async listClickables(surface: Surface): Promise<Array<{ id: string; text: string; kind: string }>> {
    return await surface.evaluate(() => {
      const out: Array<{ id: string; text: string; kind: string }> = [];
      const els = Array.from(
        document.querySelectorAll("a[href], button, [role='button'], input[type='submit']")
      ) as HTMLElement[];
      for (const el of els) {
        const text = (el.innerText || (el as HTMLInputElement).value || el.getAttribute("aria-label") || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!text || text.length > 80 || !(el.offsetWidth || el.offsetHeight)) continue;
        const id = String(out.length);
        el.setAttribute("data-af-click", id);
        out.push({ id, text, kind: el.tagName.toLowerCase() });
        if (out.length >= 60) break;
      }
      return out;
    });
  }

  /** Title and the start of the visible text, for the LLM to read. */
  public async pageDigest(surface: Surface): Promise<{ title: string; text: string }> {
    return await surface.evaluate(() => ({
      title: document.title,
      text: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1800),
    }));
  }
}

export const formAnalyzer = new FormAnalyzer();
