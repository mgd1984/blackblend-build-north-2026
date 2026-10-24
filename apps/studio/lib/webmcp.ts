"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
export type PageTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (input: unknown) => unknown | Promise<unknown>;
};
type Registry = {
  registerTool: (
    tool: PageTool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
// Wait for the shared React action to be reflected on the visible page.
export const afterPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
export function usePageTools(tools: PageTool[]) {
  const latest = useRef(tools);
  useLayoutEffect(() => {
    latest.current = tools;
  });
  const names = tools.map((t) => t.name).join("|");
  useEffect(() => {
    const registry = (document as Document & { modelContext?: Registry })
      .modelContext;
    if (typeof registry?.registerTool !== "function") return;
    const lifecycle = new AbortController();
    for (const tool of latest.current) {
      try {
        void Promise.resolve(
          registry.registerTool(
            {
              ...tool,
              async execute(input) {
                const current = latest.current.find(
                  (item) => item.name === tool.name,
                );
                if (!current)
                  throw new Error("Page tool is no longer available.");
                const result = await current.execute(input);
                await afterPaint();
                return result;
              },
            },
            { signal: lifecycle.signal },
          ),
        ).catch(() =>
          console.warn("Blackblend page tool registration failed:", tool.name),
        );
      } catch {
        console.warn("Blackblend page tool registration failed:", tool.name);
      }
    }
    return () => lifecycle.abort();
  }, [names]);
}
