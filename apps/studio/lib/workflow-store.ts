import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../db";
import { workflows } from "../db/schema";
import { getBrief } from "./brief-store";
import { command, requireTransition, localHandoff } from "./workflow-contract";
export async function getWorkflow(owner: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid workflow ID.");
  const rows = await getDb()
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.owner, owner)))
    .limit(1);
  if (!rows[0]) throw new Error("Workflow not found.");
  return rows[0];
}
export function viewFlow(record: typeof workflows.$inferSelect) {
  const { owner, proofKey, sourceKey, resultKey, ...result } = record;
  const url = (kind: string) =>
    "/api/workflow-media?id=" +
    record.id +
    "&kind=" +
    kind +
    "&v=" +
    record.revision;
  return {
    ...result,
    metadata: JSON.parse(record.metadata),
    proof: proofKey ? url("proof") : null,
    source: sourceKey ? url("source") : null,
    result: resultKey ? url("result") : null,
    approvalUrl: record.localProposal
      ? "http://127.0.0.1:4317/workflow.html?id=" + record.localProposal
      : null,
  };
}
export async function listWorkflows(owner: string) {
  const rows = await getDb()
    .select()
    .from(workflows)
    .where(eq(workflows.owner, owner))
    .orderBy(desc(workflows.createdAt))
    .limit(30);
  return rows.map(viewFlow);
}
async function update(
  old: typeof workflows.$inferSelect,
  values: Partial<typeof workflows.$inferInsert>,
) {
  const rows = await getDb()
    .update(workflows)
    .set({
      ...values,
      revision: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(workflows.id, old.id),
        eq(workflows.owner, old.owner),
        eq(workflows.revision, old.revision),
      ),
    )
    .returning();
  if (!rows[0]) throw new Error("Workflow changed. Refresh before continuing.");
  return viewFlow(rows[0]);
}
export async function actWorkflow(owner: string, input: unknown) {
  const data = command.parse(input);
  if (data.action === "create") {
    const brief = await getBrief(owner, data.briefId);
    const now = new Date().toISOString();
    const rows = await getDb()
      .insert(workflows)
      .values({
        id: crypto.randomUUID(),
        owner,
        briefId: brief.id,
        status: "draft",
        revision: crypto.randomUUID(),
        metadata: JSON.stringify(data.scene ? {scene: data.scene} : {}),
        prompt: data.prompt,
        quality: data.quality,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { workflow: viewFlow(rows[0]) };
  }
  const flow = await getWorkflow(owner, data.id);
  requireTransition(
    flow.status,
    data.action,
    flow.sourceHash,
    "sourceHash" in data ? data.sourceHash : undefined,
  );
  if (data.action === "prepare_render") {
    return {
      workflow: await update(flow, { status: "prepared" }),
      agentTask: {
        operation: "prepare_and_render",
        instructions:
          "Use the connected Blender MCP locally. Read the current scene, preserve a copy of unsaved work, then invoke the fixed blender/workflow.py prepare and asynchronous render operations. Output PNG proof and MP4 under runs. Upload rendered media here; do not upload the native .blend scene. No network access to the desktop is created.",
      },
    };
  }
  if (data.action === "review_render")
    return { workflow: await update(flow, { status: "reviewed" }) };
  if (data.action === "request_generation")
    return {
      workflow: await update(flow, { status: "awaiting_local_approval" }),
      handoff: localHandoff(flow),
    };
  if (data.action === "link_local_approval")
    return { workflow: await update(flow, { localProposal: data.proposalId }) };
  if (data.action === "record_submission")
    return {
      workflow: await update(flow, {
        status: "submitted",
        localProposal: data.proposalId,
        jobId: data.jobId,
      }),
    };
}
export async function putMedia(
  owner: string,
  id: string,
  kind: string,
  file: File,
) {
  if (!env.BUCKET) throw new Error("Media storage unavailable.");
  const flow = await getWorkflow(owner, id);
  if (!["proof", "source", "result"].includes(kind))
    throw new Error("Invalid media kind.");
  if (file.size <= 0 || file.size > 25_000_000)
    throw new Error("Use media under 25 MB.");
  if (kind === "result" && flow.generationId)
    throw new Error("Hosted results are attached by the generation job. Upload a separate take for other media.");
  if (kind === "result" && flow.status !== "submitted")
    throw new Error(
      "Record the approved local submission before uploading a result.",
    );
  if (
    kind !== "result" &&
    !["draft", "prepared", "rendered", "reviewed"].includes(flow.status)
  )
    throw new Error("Start a new workflow to change this render.");
  const bytes = await file.arrayBuffer(),
    head = new Uint8Array(bytes);
  if (
    kind === "proof"
      ? head[0] !== 137 || head[1] !== 80 || head[2] !== 78 || head[3] !== 71
      : String.fromCharCode(...head.slice(4, 8)) !== "ftyp"
  )
    throw new Error("Use a PNG proof or MP4 animation.");
  const key = flow.id + "/" + kind + "/" + crypto.randomUUID();
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: kind === "proof" ? "image/png" : "video/mp4" },
  });
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  const values =
    kind === "proof"
      ? { proofKey: key }
      : kind === "source"
        ? {
            sourceKey: key,
            sourceHash: hash,
            status: "rendered",
            localProposal: null,
            jobId: null,
            resultKey: null,
          }
        : { resultKey: key, status: "completed" };
  return update(flow, values);
}
