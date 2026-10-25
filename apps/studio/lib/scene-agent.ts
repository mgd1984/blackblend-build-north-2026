import { z } from "zod";
import { sceneDocument, type SceneDocument } from "./scene-document.ts";

export const sceneAgentInput = z
  .object({
    requestId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(6000),
    scene: sceneDocument,
    selectedPartId: z.string().max(80).nullable().optional(),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(3000) }).strict())
      .max(12)
      .optional(),
    image: z
      .string()
      .max(8_000_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
      .optional(),
  })
  .strict();
export const sceneAgentReply = z
  .object({
    message: z.string().min(1).max(3000),
    scene: sceneDocument,
    agent: z
      .object({
        model: z.string(),
        traceId: z.string(),
        actions: z.array(z.string()),
        inputTokens: z.number(),
        outputTokens: z.number(),
      })
      .optional(),
  })
  .strict();
export type SceneAgentReply = z.infer<typeof sceneAgentReply>;

export function validateAgentReply(raw: unknown, source: SceneDocument) {
  const reply = sceneAgentReply.parse(raw);
  if (reply.scene.revision !== source.revision)
    throw Error("Agent replied to a different scene revision.");
  if (reply.scene.asset !== "primitives") {
    const nodes = new Set(
      source.asset === reply.scene.asset ? source.parts.map((p) => p.node).filter(Boolean) : [],
    );
    if (reply.scene.parts.some((p) => p.shape === "native" && !nodes.has(p.node)))
      throw Error("Agent referenced unavailable native geometry.");
  }
  if (reply.scene.asset === "primitives" && reply.scene.fidelity !== "concept")
    throw Error("A generated concept cannot claim source fidelity.");
  return reply;
}
