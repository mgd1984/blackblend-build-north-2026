import { z } from "zod";
export const briefInput = z
  .object({
    requestId: z.string().uuid(),
    title: z.string().trim().min(2).max(120),
    track: z.enum(["studio", "directed"]),
    audience: z.string().trim().min(2).max(200),
    goal: z.string().trim().min(10).max(4000),
    source: z.enum(["blender", "cad", "video", "none"]),
    fidelity: z.enum(["native", "appearance"]),
  })
  .strict();
export const briefId = z.string().uuid();
export type BriefInput = z.infer<typeof briefInput>;
export function planFor(brief: Omit<BriefInput, "requestId">) {
  return {
    goal: brief.goal,
    track: brief.track,
    steps: [
      brief.source === "none"
        ? "Prepare a part-organized source scene before rendering."
        : `Inspect the ${brief.source} source and record its version.`,
      "Agree the shot, camera path, component motion, deliverable and acceptance criteria.",
      "Render a native motion proof; check opening frame, clearances, component orientation and final reassembly.",
      brief.fidelity === "native"
        ? "Use native rendering for the final geometry-critical output."
        : "Create an optional appearance experiment only after a person approves its inputs and spending limit.",
      "Review source and result at matched progress. Log rejected takes and total cost.",
      "Have the project owner approve the deliverable before export or sharing.",
    ],
    gates: [
      "No paid generation is submitted by this tool.",
      "A brief is not a booking, quote or purchase.",
      "Visual review does not certify engineering or fabrication correctness.",
    ],
    requiredBeforeGeneration: [
      "source version",
      "reference rights",
      "shot plan",
      "acceptance criteria",
      "provider and model",
      "explicit spending cap",
      "human approval",
    ],
  };
}
