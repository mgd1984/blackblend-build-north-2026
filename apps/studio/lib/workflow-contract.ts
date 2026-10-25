import { z } from "zod";
import { sceneDocument } from "./scene-document.ts";
export const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      briefId: z.string().uuid(),
      prompt: z.string().trim().min(1).max(12000),
      quality: z.enum(["480P", "768P", "1080P"]).default("480P"),
      scene: sceneDocument.optional(),
    })
    .strict(),
  z.object({ action: z.literal("prepare_render"), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal("review_render"),
      id: z.string().uuid(),
      sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("request_generation"),
      id: z.string().uuid(),
      sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("link_local_approval"),
      id: z.string().uuid(),
      sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
      proposalId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("record_submission"),
      id: z.string().uuid(),
      sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
      proposalId: z.string().uuid(),
      jobId: z.string().regex(/^run-[A-Za-z0-9_-]+$/),
    })
    .strict(),
]);
export function requireTransition(
  status: string,
  action: string,
  hash: string | null,
  provided?: string,
) {
  if (
    ["review_render", "request_generation", "record_submission", "link_local_approval"].includes(
      action,
    ) &&
    (!hash || hash !== provided)
  )
    throw new Error("Source changed. Review the current render.");
  const allowed: Record<string, string[]> = {
    prepare_render: ["draft"],
    review_render: ["rendered"],
    request_generation: ["reviewed"],
    record_submission: ["awaiting_local_approval"],
    link_local_approval: ["awaiting_local_approval"],
  };
  if (!allowed[action]?.includes(status))
    throw new Error("This stage is not ready for that action.");
}
export function localHandoff(flow: {
  id: string;
  sourceHash: string | null;
  prompt: string;
  quality: string;
}) {
  return {
    siteWorkflowId: flow.id,
    expectedSourceHash: flow.sourceHash,
    prompt: flow.prompt,
    resolution: flow.quality,
    localHelper: "scripts/workflow-handoff.mjs",
    instructions:
      "The local agent must select the reviewed MP4 under the local runs directory, verify its SHA-256 against expectedSourceHash, then pass this request with sourceFile on stdin to the local helper. The helper prepares a local approval page only. It never submits generation. A person must approve the exact animation, references, prompt and quality there. No hosted tool can approve or submit billing.",
  };
}
