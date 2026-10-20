import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, FileText, Play } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type PreviewState =
  | { status: "idle" }
  | { status: "compiling" }
  | { status: "ready"; url: string }
  | { status: "error"; error: string; log?: string };

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
};

export const PdfPreview: React.FC<{ state: PreviewState; onCompile: () => void; shortcut: string }> = ({
  state,
  onCompile,
  shortcut,
}) => (
  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
    <AnimatePresence mode="wait" initial={false}>
      {state.status === "compiling" && (
        <motion.div key="loading" {...fade} className="flex flex-1 justify-center overflow-hidden p-6" aria-busy="true" aria-label="Compiling preview">
          <div className="flex aspect-[8.5/11] w-full max-w-[520px] flex-col gap-3 rounded-md border border-border bg-card p-8">
            <Skeleton className="mx-auto h-5 w-1/2" />
            <Skeleton className="mx-auto h-3 w-3/4" />
            <Skeleton className="mt-4 h-3.5 w-1/3" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={`a${i}`} className="h-3 w-full" />
            ))}
            <Skeleton className="mt-4 h-3.5 w-1/4" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={`b${i}`} className="h-3" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
            ))}
          </div>
        </motion.div>
      )}

      {state.status === "ready" && (
        <motion.iframe
          key={state.url}
          {...fade}
          title="Compiled resume preview"
          src={state.url}
          className="min-h-0 w-full flex-1 border-0 bg-card"
        />
      )}

      {state.status === "error" && (
        <motion.div key="error" {...fade} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Compilation failed</AlertTitle>
            <AlertDescription>
              <p className="break-words [overflow-wrap:anywhere]">{state.error}</p>
              {state.log ? (
                <Collapsible className="w-full">
                  <CollapsibleTrigger asChild>
                    <Button variant="link" size="sm" className="h-auto px-0">
                      Show compiler log
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="mt-2 max-h-72 w-full overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-foreground">
                      {state.log}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </AlertDescription>
          </Alert>
          <div>
            <Button variant="outline" size="sm" onClick={onCompile}>
              <Play data-icon="inline-start" />
              Try again
            </Button>
          </div>
        </motion.div>
      )}

      {state.status === "idle" && (
        <motion.div key="idle" {...fade} className="flex flex-1 items-center justify-center p-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>No preview yet</EmptyTitle>
              <EmptyDescription>Compile the LaTeX source to see the PDF here. Shortcut: {shortcut}.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={onCompile}>
                <Play data-icon="inline-start" />
                Compile preview
              </Button>
            </EmptyContent>
          </Empty>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);
