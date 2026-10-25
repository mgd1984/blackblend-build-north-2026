import { z } from "zod";
import { digest, imageBytes, inspectMp4 } from "./media-inspection.ts";
import { falQueue, VIDEO_MODEL, SubmissionRejected } from "./fal-queue.ts";
export type GenerationConfig = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  FAL_KEY?: string;
  GENERATION_MEDIA_SECRET?: string;
  GENERATION_ALLOWED_OWNERS?: string;
  GENERATION_DAILY_LIMIT?: string;
  APP_ORIGIN?: string;
};
type Input = {
  model: string;
  workflowId: string;
  sourceHash: string;
  sourceKey: string;
  prompt: string;
  resolution: "480P" | "768P" | "1080P";
  referenceKeys: string[];
  referenceHashes: string[];
  durationMs: number;
};
type Job = {
  id: string;
  owner: string;
  workflow_id: string;
  request_id: string;
  input_hash: string;
  input: string;
  status: string;
  remote_id: string | null;
  error: string | null;
  duration_ms: number;
  base_estimate_cents: number;
  result_key: string | null;
  processing_ms: number | null;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  updated_at: string;
  poll_after: number;
};
type Flow = {
  id: string;
  owner: string;
  status: string;
  source_hash: string | null;
  source_key: string | null;
  prompt: string;
  quality: string;
  generation_id: string | null;
};
const uuid = z.string().uuid();
const prepareInput = z
  .object({
    workflowId: uuid,
    requestId: uuid,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    images: z.array(z.string().max(10_000_000)).max(6).default([]),
  })
  .strict();
export const generationCommand = z.discriminatedUnion("action", [
  prepareInput.extend({ action: z.literal("prepare") }),
  z
    .object({
      action: z.literal("approve"),
      id: uuid,
      inputHash: z.string().regex(/^[a-f0-9]{64}$/),
      acceptProviderCharge: z.literal(true),
    })
    .strict(),
  z.object({ action: z.literal("refresh"), id: uuid }).strict(),
  z.object({ action: z.literal("cancel"), id: uuid }).strict(),
]);
export class GenerationError extends Error {}
export function generationAvailable(config: GenerationConfig, owner: string) {
  return (
    !!config.DB &&
    !!config.BUCKET &&
    !!config.FAL_KEY &&
    (config.GENERATION_MEDIA_SECRET?.length ?? 0) >= 32 &&
    !!config.APP_ORIGIN?.startsWith("https://") &&
    (config.GENERATION_ALLOWED_OWNERS ?? "")
      .split(",")
      .map((x) => x.trim())
      .includes(owner)
  );
}
export function generationService(config: GenerationConfig, fetchImpl = fetch) {
  const db = config.DB!,
    bucket = config.BUCKET!;
  function allowed(owner: string) {
    if (!generationAvailable(config, owner))
      throw new GenerationError("Hosted generation is not enabled for this account.");
  }
  async function get(owner: string, id: string) {
    uuid.parse(id);
    const row = await db
      .prepare("SELECT * FROM generation_jobs WHERE id=? AND owner=?")
      .bind(id, owner)
      .first<Job>();
    if (!row) throw new GenerationError("Generation not found.");
    return row;
  }
  const view = (row: Job) => {
    const input = JSON.parse(row.input) as Input;
    return {
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      inputHash: row.input_hash,
      prompt: input.prompt,
      resolution: input.resolution,
      model: input.model,
      durationMs: row.duration_ms,
      referenceCount: input.referenceKeys.length,
      baseEstimateCents: row.base_estimate_cents,
      estimateIncludesReferenceUsage: false,
      error: row.error,
      processingMs: row.processing_ms,
      createdAt: row.created_at,
      approvedAt: row.approved_at,
      expiresAt: row.expires_at,
      source: "/api/generation-media?id=" + row.id + "&kind=source",
      references: input.referenceKeys.map(
        (_, i) => "/api/generation-media?id=" + row.id + "&kind=ref" + i,
      ),
      result: row.result_key ? "/api/generation-media?id=" + row.id + "&kind=result" : null,
    };
  };
  async function flow(owner: string, id: string) {
    const record = await db
      .prepare("SELECT * FROM workflows WHERE id=? AND owner=?")
      .bind(id, owner)
      .first<Flow>();
    if (!record) throw new GenerationError("Project take not found.");
    return record;
  }
  async function signedSource(id: string, kind: string) {
    const expires = String(Math.floor(Date.now() / 1000) + 4 * 60 * 60);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(config.GENERATION_MEDIA_SECRET!),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = Array.from(
      new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(id + ":" + kind + ":" + expires),
        ),
      ),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    const url = new URL("/api/generation-source", config.APP_ORIGIN);
    url.search = new URLSearchParams({ id, kind, expires, signature }).toString();
    return url.toString();
  }
  async function media(row: Job, kind: string) {
    const input = JSON.parse(row.input) as Input;
    const key =
      kind === "source"
        ? input.sourceKey
        : kind === "result"
          ? row.result_key
          : /^ref[0-5]$/.test(kind)
            ? input.referenceKeys[Number(kind.slice(3))]
            : null;
    if (!key) throw new GenerationError("Media not found.");
    const object = await bucket.get(key);
    if (!object) throw new GenerationError("Media not found.");
    return object;
  }
  return {
    async read(owner: string, id: string) {
      return view(await get(owner, id));
    },
    async forWorkflow(owner: string, id: string) {
      uuid.parse(id);
      const f = await flow(owner, id);
      return f.generation_id ? view(await get(owner, f.generation_id)) : null;
    },
    async media(owner: string, id: string, kind: string) {
      return media(await get(owner, id), kind);
    },
    async sourceCapability(url: URL) {
      const { id, kind, expires, signature } = Object.fromEntries(url.searchParams);
      uuid.parse(id);
      const expiry = Number(expires),
        now = Math.floor(Date.now() / 1000);
      if (
        !/^(source|ref[0-5])$/.test(kind ?? "") ||
        !/^\d+$/.test(expires ?? "") ||
        expiry < now ||
        expiry > now + 4 * 60 * 60 ||
        !/^[a-f0-9]{64}$/.test(signature ?? "") ||
        !config.GENERATION_MEDIA_SECRET
      )
        throw new GenerationError("Media access expired.");
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(config.GENERATION_MEDIA_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const signatureBytes = Uint8Array.from(signature.match(/../g)!, (pair) => parseInt(pair, 16));
      if (
        !(await crypto.subtle.verify(
          "HMAC",
          key,
          signatureBytes,
          new TextEncoder().encode(id + ":" + kind + ":" + expires),
        ))
      )
        throw new GenerationError("Invalid media access.");
      const row = await db
        .prepare("SELECT * FROM generation_jobs WHERE id=?")
        .bind(id)
        .first<Job>();
      if (!row?.approved_at || ["awaiting_approval", "cancelled"].includes(row.status))
        throw new GenerationError("Media access unavailable.");
      return media(row, kind);
    },
    async prepare(owner: string, raw: unknown) {
      allowed(owner);
      const data = prepareInput.parse(raw),
        f = await flow(owner, data.workflowId);
      if (data.images.reduce((sum, image) => sum + image.length, 0) > 8_000_000)
        throw new GenerationError("Use appearance images totalling less than 6 MB.");
      const previous = await db
        .prepare("SELECT * FROM generation_jobs WHERE owner=? AND request_id=?")
        .bind(owner, data.requestId)
        .first<Job>();
      if (
        !["reviewed", "awaiting_approval"].includes(f.status) ||
        !f.source_key ||
        f.source_hash !== data.sourceHash
      )
        throw new GenerationError("Review the current animation before preparing generation.");
      const source = await bucket.get(f.source_key);
      if (!source) throw new GenerationError("Source animation is unavailable.");
      const sourceBytes = await source.arrayBuffer(),
        sourceHash = await digest(sourceBytes);
      if (sourceHash !== data.sourceHash)
        throw new GenerationError("The source differs from the reviewed animation.");
      const { durationMs } = inspectMp4(new Uint8Array(sourceBytes));
      const resolution = z.enum(["480P", "768P", "1080P"]).parse(f.quality);
      const images = data.images.map(imageBytes),
        referenceHashes = await Promise.all(
          images.map((image) => digest(image.bytes as Uint8Array<ArrayBuffer>)),
        );
      const canonical = {
        model: VIDEO_MODEL,
        workflowId: f.id,
        sourceHash,
        prompt: f.prompt,
        resolution,
        referenceHashes,
        durationMs,
      };
      const inputHash = await digest(new TextEncoder().encode(JSON.stringify(canonical)));
      if (previous) {
        if (previous.input_hash !== inputHash)
          throw new GenerationError("This request ID already has different inputs.");
        return view(previous);
      }
      const id = crypto.randomUUID(),
        referenceKeys = images.map((_, i) => "generations/" + id + "/reference-" + i);
      const input: Input = { ...canonical, sourceKey: f.source_key, referenceKeys };
      const now = new Date().toISOString(),
        expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      // This is the published output-video base only. Reference token charges are additional.
      const base = Math.ceil(
        Math.max(5, durationMs / 1000) * { "480P": 5, "768P": 8, "1080P": 16 }[resolution],
      );
      let databaseWriteAttempted = false;
      try {
        for (const [i, image] of images.entries())
          await bucket.put(referenceKeys[i], image.bytes, {
            httpMetadata: { contentType: image.mime },
          });
        databaseWriteAttempted = true;
        await db.batch([
          db
            .prepare(
              `INSERT INTO generation_jobs
            (id,owner,workflow_id,request_id,input_hash,input,status,duration_ms,base_estimate_cents,created_at,expires_at,updated_at,poll_after)
            SELECT ?,?,?,?,?,?,'awaiting_approval',?,?,?,?,?,0 FROM workflows
            WHERE id=? AND owner=? AND status='reviewed' AND source_hash=? AND source_key=?
            ON CONFLICT(owner,request_id) DO NOTHING`,
            )
            .bind(
              id,
              owner,
              f.id,
              data.requestId,
              inputHash,
              JSON.stringify(input),
              durationMs,
              base,
              now,
              expires,
              now,
              f.id,
              owner,
              sourceHash,
              f.source_key,
            ),
          db
            .prepare(
              `UPDATE workflows SET generation_id=?,status='awaiting_approval',revision=?,updated_at=?
            WHERE id=? AND owner=? AND status='reviewed' AND source_hash=?
            AND EXISTS(SELECT 1 FROM generation_jobs WHERE id=? AND owner=?)`,
            )
            .bind(id, crypto.randomUUID(), now, f.id, owner, sourceHash, id, owner),
        ]);
        const row = await db
          .prepare("SELECT * FROM generation_jobs WHERE owner=? AND request_id=?")
          .bind(owner, data.requestId)
          .first<Job>();
        if (!row || row.input_hash !== inputHash)
          throw new GenerationError("The take changed. Reload it before continuing.");
        if (row.id !== id) for (const key of referenceKeys) await bucket.delete(key);
        return view(row);
      } catch (error) {
        // A lost response may follow a successful database write. Keep these input files
        // once the write starts; check whether they are unused before deleting them.
        if (!databaseWriteAttempted)
          for (const key of referenceKeys) await bucket.delete(key).catch(() => {});
        throw error;
      }
    },
    async cancel(owner: string, id: string) {
      const row = await get(owner, id);
      if (row.status !== "awaiting_approval")
        throw new GenerationError("This generation cannot be cancelled locally.");
      const now = new Date().toISOString();
      await db.batch([
        db
          .prepare(
            `UPDATE generation_jobs SET status='cancelled',updated_at=? WHERE id=? AND owner=? AND status='awaiting_approval'`,
          )
          .bind(now, id, owner),
        db
          .prepare(
            `UPDATE workflows SET status='reviewed',generation_id=NULL,revision=?,updated_at=?
          WHERE id=? AND owner=? AND generation_id=? AND status='awaiting_approval'
          AND EXISTS(SELECT 1 FROM generation_jobs WHERE id=? AND status='cancelled')`,
          )
          .bind(crypto.randomUUID(), now, row.workflow_id, owner, id, id),
      ]);
      return view(await get(owner, id));
    },
    async approve(owner: string, id: string, inputHash: string) {
      allowed(owner);
      const row = await get(owner, id),
        input = JSON.parse(row.input) as Input;
      if (row.input_hash !== inputHash) throw new GenerationError("Approval inputs changed.");
      if (row.status !== "awaiting_approval") return view(row); // replay never starts another POST
      const f = await flow(owner, row.workflow_id);
      if (
        f.generation_id !== id ||
        f.source_hash !== input.sourceHash ||
        f.status !== "awaiting_approval"
      )
        throw new GenerationError("Review the current source.");
      const limit = Math.max(
          1,
          Math.min(20, Math.floor(Number(config.GENERATION_DAILY_LIMIT) || 3)),
        ),
        now = new Date().toISOString();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const changed = await db.batch([
        db
          .prepare(
            `UPDATE generation_jobs SET status='submitting',approved_at=?,updated_at=? WHERE id=? AND owner=?
          AND status='awaiting_approval' AND input_hash=? AND expires_at>?
          AND NOT EXISTS(SELECT 1 FROM generation_jobs WHERE owner=? AND id<>? AND status IN ('submitting','queued','running','unknown'))
          AND (SELECT COUNT(*) FROM generation_jobs WHERE owner=? AND approved_at>?)<?`,
          )
          .bind(now, now, id, owner, inputHash, now, owner, id, owner, since, limit),
        db
          .prepare(
            `UPDATE workflows SET status='submitted',revision=?,updated_at=? WHERE id=? AND owner=? AND generation_id=? AND status='awaiting_approval'
          AND EXISTS(SELECT 1 FROM generation_jobs WHERE id=? AND status='submitting')`,
          )
          .bind(crypto.randomUUID(), now, row.workflow_id, owner, id, id),
      ]);
      if (!changed[0].meta.changes) {
        const latest = await get(owner, id);
        if (latest.status !== "awaiting_approval") return view(latest);
        throw new GenerationError(
          "Approval expired, another job is active, or the daily run limit was reached.",
        );
      }
      try {
        const remote = await falQueue(config.FAL_KEY!, fetchImpl).submit({
          video_url: await signedSource(id, "source"),
          prompt: input.prompt,
          resolution: input.resolution,
          reference_image_urls: await Promise.all(
            input.referenceKeys.map((_, i) => signedSource(id, "ref" + i)),
          ),
          max_generated_reference_images: 0,
          enable_safety_checker: true,
        });
        await db
          .prepare(
            `UPDATE generation_jobs SET status='queued',remote_id=?,updated_at=? WHERE id=? AND owner=? AND status='submitting'`,
          )
          .bind(remote, new Date().toISOString(), id, owner)
          .run();
      } catch (error) {
        const status = error instanceof SubmissionRejected ? "failed" : "unknown";
        await db
          .prepare(
            `UPDATE generation_jobs SET status=?,error=?,updated_at=? WHERE id=? AND owner=? AND status='submitting'`,
          )
          .bind(
            status,
            status === "unknown"
              ? "Submission outcome is uncertain. Inspect provider history; do not resubmit."
              : "fal rejected these inputs. No automatic retry was made.",
            new Date().toISOString(),
            id,
            owner,
          )
          .run();
      }
      return view(await get(owner, id));
    },
    async refresh(owner: string, id: string) {
      const row = await get(owner, id);
      if (!row.remote_id || !["queued", "running"].includes(row.status)) return view(row);
      const now = Date.now(),
        leaseUntil = now + 120_000,
        lease = await db
          .prepare(
            `UPDATE generation_jobs SET poll_after=? WHERE id=? AND owner=? AND poll_after<? AND status IN ('queued','running')`,
          )
          .bind(leaseUntil, id, owner, now)
          .run();
      if (!lease.meta.changes) return view(await get(owner, id));
      try {
        if (!config.FAL_KEY) throw new GenerationError("Provider credentials are unavailable.");
        const provider = falQueue(config.FAL_KEY, fetchImpl),
          status = await provider.status(row.remote_id);
        if (status.status === "COMPLETED" && !status.error) {
          const bytes = await provider.result(row.remote_id),
            key = "generations/" + id + "/result.mp4";
          await bucket.put(key, bytes, { httpMetadata: { contentType: "video/mp4" } });
          const input = JSON.parse(row.input) as Input,
            updated = new Date().toISOString();
          const processingMs = Number.isFinite(status.metrics?.inference_time)
            ? Math.round(status.metrics!.inference_time! * 1000)
            : null;
          await db.batch([
            db
              .prepare(
                `UPDATE generation_jobs SET status='completed',result_key=?,processing_ms=?,updated_at=? WHERE id=? AND owner=? AND remote_id=? AND poll_after=? AND status IN ('queued','running')`,
              )
              .bind(key, processingMs, updated, id, owner, row.remote_id, leaseUntil),
            db
              .prepare(
                `UPDATE workflows SET status='completed',result_key=?,revision=?,updated_at=? WHERE id=? AND owner=? AND generation_id=? AND source_hash=?
            AND EXISTS(SELECT 1 FROM generation_jobs WHERE id=? AND owner=? AND status='completed')`,
              )
              .bind(
                key,
                crypto.randomUUID(),
                updated,
                row.workflow_id,
                owner,
                id,
                input.sourceHash,
                id,
                owner,
              ),
            db
              .prepare(
                `INSERT INTO usage_events (id,owner,kind,payload,created_at)
            SELECT ?,?,'generation.completed',?,? FROM generation_jobs WHERE id=? AND owner=? AND status='completed' ON CONFLICT(id) DO NOTHING`,
              )
              .bind(
                id,
                owner,
                JSON.stringify({
                  model: input.model,
                  duration_ms: row.duration_ms,
                  resolution: input.resolution,
                  reference_count: input.referenceKeys.length,
                  ...(processingMs === null ? {} : { processing_ms: processingMs }),
                  provider_request_id: row.remote_id,
                }),
                updated,
                id,
                owner,
              ),
          ]);
        } else {
          const next = ["COMPLETED", "FAILED"].includes(status.status)
            ? "failed"
            : status.status === "IN_PROGRESS"
              ? "running"
              : "queued";
          await db
            .prepare(
              `UPDATE generation_jobs SET status=?,error=?,updated_at=? WHERE id=? AND owner=? AND poll_after=? AND status IN ('queued','running')`,
            )
            .bind(
              next,
              next === "failed" ? "The provider could not complete this generation." : null,
              new Date().toISOString(),
              id,
              owner,
              leaseUntil,
            )
            .run();
        }
      } finally {
        await db
          .prepare(
            `UPDATE generation_jobs SET poll_after=? WHERE id=? AND owner=? AND poll_after=? AND status IN ('queued','running')`,
          )
          .bind(Date.now() + 3000, id, owner, leaseUntil)
          .run();
      }
      return view(await get(owner, id));
    },
  };
}
