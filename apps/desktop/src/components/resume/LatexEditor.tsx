import React, { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

const INDENT = "  ";

interface LatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Plain textarea with a line-number gutter kept in sync with its scroll position. */
export const LatexEditor: React.FC<LatexEditorProps> = ({ value, onChange, className }) => {
  const gutterRef = useRef<HTMLDivElement>(null);
  const tabEscaped = useRef(false);
  const lineCount = useMemo(() => value.split("\n").length, [value]);

  const insert = (el: HTMLTextAreaElement, text: string) => {
    // execCommand keeps the browser undo stack intact; fall back if it is unavailable.
    if (!document.execCommand("insertText", false, text)) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
      onChange(el.value);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      tabEscaped.current = true;
      return;
    }
    if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) {
      tabEscaped.current = false;
      return;
    }
    if (tabEscaped.current) return; // Escape then Tab moves focus out of the editor.
    e.preventDefault();
    const el = e.currentTarget;
    if (e.shiftKey) {
      const start = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
      if (el.value.startsWith(INDENT, start)) {
        el.setSelectionRange(start, start + INDENT.length);
        insert(el, "");
      }
      return;
    }
    insert(el, INDENT);
  };

  return (
    <div className={cn("relative flex min-h-0 flex-1 overflow-hidden bg-muted/30", className)}>
      <div
        aria-hidden
        className="pointer-events-none w-12 shrink-0 select-none overflow-hidden border-r border-border bg-muted/40 py-3 pr-3 text-right font-mono text-[12px] leading-5 tabular-nums text-muted-foreground"
      >
        <div ref={gutterRef}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      </div>
      <label htmlFor="latex-source" className="sr-only">
        LaTeX source
      </label>
      <textarea
        id="latex-source"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-e.currentTarget.scrollTop}px)`;
        }}
        aria-describedby="latex-source-hint"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        wrap="off"
        className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[12px] leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      />
      <p id="latex-source-hint" className="sr-only">
        Tab inserts two spaces. Press Escape, then Tab, to move focus out of the editor.
      </p>
    </div>
  );
};
