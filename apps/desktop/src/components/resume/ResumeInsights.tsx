import React from "react";
import { motion } from "framer-motion";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ParsedResume } from "./resume-utils";

interface ResumeInsightsProps {
  parsed: ParsedResume | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRescore: () => void;
  rescoring: boolean;
  isActive: boolean;
}

const ContactRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="flex min-w-0 items-baseline justify-between gap-3 py-1 text-[12.5px]">
    <dt className="shrink-0 text-muted-foreground">{label}</dt>
    <dd className="truncate text-right text-foreground">{value || <span className="text-muted-foreground">Not found</span>}</dd>
  </div>
);

export const ResumeInsights: React.FC<ResumeInsightsProps> = ({ parsed, open, onOpenChange, onRescore, rescoring, isActive }) => {
  const skills = parsed?.skills ?? [];
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="-mx-1 flex min-w-0 items-center gap-2 rounded-md px-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 data-[open=false]:-rotate-90" data-open={open} aria-hidden />
            <span className="text-[14px] font-semibold tracking-tight text-foreground">Insights</span>
            <span className="truncate text-[12.5px] text-muted-foreground">
              {parsed ? `${skills.length} skills extracted` : "Save to extract skills and contact details"}
            </span>
          </button>
        </CollapsibleTrigger>
        <Button size="sm" variant={isActive ? "outline" : "default"} onClick={onRescore} disabled={rescoring}>
          {rescoring ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
          {rescoring ? "Saving…" : "Save and rescore"}
        </Button>
      </div>
      <CollapsibleContent>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="grid max-h-56 grid-cols-1 gap-x-6 gap-y-4 overflow-y-auto px-4 pb-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
        >
          <section className="flex min-w-0 flex-col gap-2" aria-label="Extracted skills">
            <p className="text-[12.5px] text-muted-foreground">
              Skills used for job matching{isActive ? "." : ". Saving and rescoring makes this the active resume."}
            </p>
            {skills.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <li key={s}>
                    <Badge variant="outline" className="font-normal">
                      {s}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">
                No skills found. Add a Technical Skills section with comma separated items, then save.
              </p>
            )}
          </section>
          <section className="flex min-w-0 flex-col" aria-label="Contact details">
            <p className="pb-1 text-[12.5px] text-muted-foreground">Contact details</p>
            <dl className="flex flex-col">
              <ContactRow label="Name" value={parsed?.name} />
              <ContactRow label="Email" value={parsed?.email} />
              <ContactRow label="Phone" value={parsed?.phone} />
              <ContactRow label="LinkedIn" value={parsed?.linkedin?.replace(/^https?:\/\//, "")} />
              <ContactRow label="GitHub" value={parsed?.github?.replace(/^https?:\/\//, "")} />
            </dl>
          </section>
        </motion.div>
      </CollapsibleContent>
    </Collapsible>
  );
};
