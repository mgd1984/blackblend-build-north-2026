import { sceneAgentInput, sceneAgentReply } from "./scene-agent.ts";
import { createSceneAgent, DEFAULT_SCENE_MODEL } from "./scene-agent-runner.ts";
import { digest } from "./media-inspection.ts";
import {
  geometryAvailable,
  hostedWindowExecutor,
  runOpenaiGeometryJob,
  type GeometryRow,
  type NativeDispatch,
  type GeometryConfig,
} from "./hosted-geometry.ts";
export type AgentConfig = GeometryConfig & {
  DB?: D1Database;
  OPENAI_API_KEY?: string;
  BLACKBLEND_AGENT_MODEL?: string;
  BLACKBLEND_AGENT_TRACING?: string;
  AGENT_ALLOWED_OWNERS?: string;
  GENERATION_ALLOWED_OWNERS?: string;
};
type Saved = {
  id: string;
  owner: string;
  request_id: string;
  input_hash: string;
  status: string;
  reply: string | null;
  error: string | null;
  created_at: string;
};
export function hostedAgentOwner(config: AgentConfig, owner: string) {
  return (config.AGENT_ALLOWED_OWNERS ?? config.GENERATION_ALLOWED_OWNERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(owner);
}
export function hostedAgentAvailable(config: AgentConfig, owner: string) {
  return !!config.DB && !!config.OPENAI_API_KEY && hostedAgentOwner(config, owner);
}
export function hostedSceneAgent(
  config: AgentConfig,
  fetchImpl = fetch,
  nativeDispatch?: NativeDispatch,
) {
  const db = config.DB!;
  async function expire(owner: string) {
    const now = new Date().toISOString(),
      cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await db
      .prepare(
        `UPDATE agent_requests SET status='unknown',error='The request outcome is uncertain. No automatic retry was made.',updated_at=? WHERE owner=? AND status='pending' AND created_at<?`,
      )
      .bind(now, owner, cutoff)
      .run();
  }
  async function read(owner: string, requestId: string) {
    if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw Error("Invalid agent request.");
    return db
      .prepare("SELECT * FROM agent_requests WHERE owner=? AND request_id=?")
      .bind(owner, requestId)
      .first<Saved>();
  }
  return {
    async status(owner: string, requestId: string) {
      await expire(owner);
      let saved = await read(owner, requestId);
      if (!saved) throw Error("Request not found.");
      if (saved.status === "unknown" && geometryAvailable(config, owner)) {
        let native = await db
          .prepare("SELECT * FROM native_geometry WHERE owner=? AND request_id=?")
          .bind(owner, requestId)
          .first<GeometryRow>();
        if (native && ["running", "unknown"].includes(native.status) && native.provider_receipt) {
          try {
            await runOpenaiGeometryJob(config, native.id, fetchImpl);
          } catch {
            /* Existing background result only; never a replacement request. */
          }
          native = await db
            .prepare("SELECT * FROM native_geometry WHERE owner=? AND request_id=?")
            .bind(owner, requestId)
            .first<GeometryRow>();
        }
        if (native?.status === "completed" && native.document) {
          const source = JSON.parse(native.input),
            reply = sceneAgentReply.parse({
              message:
                "Recovered the verified native window candidate. Review it before applying. The final chat response was interrupted.",
              scene: {
                ...JSON.parse(native.document),
                revision: source.baseRevision ?? source.scene.revision,
              },
            });
          await db
            .prepare(
              "UPDATE agent_requests SET status='completed',reply=?,error=NULL,updated_at=? WHERE id=? AND owner=? AND status='unknown'",
            )
            .bind(JSON.stringify(reply), new Date().toISOString(), saved.id, owner)
            .run();
          saved = (await read(owner, requestId))!;
        }
      }
      return {
        status: saved.status,
        error: saved.error,
        reply: saved.reply ? sceneAgentReply.parse(JSON.parse(saved.reply)) : null,
      };
    },
    async run(owner: string, raw: unknown) {
      if (!hostedAgentAvailable(config, owner))
        throw Error("The scene agent is not enabled for this account.");
      await expire(owner);
      const input = sceneAgentInput.parse(raw),
        hash = await digest(new TextEncoder().encode(JSON.stringify(input)));
      let saved = await read(owner, input.requestId);
      const model = config.BLACKBLEND_AGENT_MODEL || DEFAULT_SCENE_MODEL;
      if (!saved) {
        const now = new Date().toISOString(),
          since = new Date(Date.now() - 86400000).toISOString();
        const id = crypto.randomUUID();
        await db
          .prepare(
            `INSERT INTO agent_requests (id,owner,request_id,input_hash,status,created_at,updated_at)
          SELECT ?,?,?,?,'pending',?,? WHERE
          (SELECT COUNT(*) FROM agent_requests WHERE owner=? AND created_at>?)<50
          AND NOT EXISTS(SELECT 1 FROM agent_requests WHERE owner=? AND status='pending')
          ON CONFLICT(owner,request_id) DO NOTHING`,
          )
          .bind(id, owner, input.requestId, hash, now, now, owner, since, owner)
          .run();
        saved = await read(owner, input.requestId);
        if (!saved)
          throw Error("Another agent request is pending, or the daily message limit was reached.");
        if (saved.id !== id) {
          if (saved.input_hash !== hash) throw Error("Request inputs changed.");
          if (saved.status === "completed" && saved.reply)
            return sceneAgentReply.parse(JSON.parse(saved.reply));
          throw Error(saved.error ?? "The existing request is still pending. Do not resend it.");
        }
      } else {
        if (saved.input_hash !== hash) throw Error("Request inputs changed.");
        if (saved.status === "completed" && saved.reply)
          return sceneAgentReply.parse(JSON.parse(saved.reply));
        throw Error(saved.error ?? "The existing request is still pending. Do not resend it.");
      }
      const consumption: {
        usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number } | null;
      } = { usage: null };
      const trackedFetch = (async (url: URL | RequestInfo, options?: RequestInit) => {
        const response = await fetchImpl(url, options);
        if (response.ok) {
          try {
            const body = (await response.clone().json()) as {
              usage?: {
                input_tokens?: number;
                output_tokens?: number;
                input_tokens_details?: { cached_tokens?: number };
              };
            };
            const input = body.usage?.input_tokens,
              output = body.usage?.output_tokens,
              cached = body.usage?.input_tokens_details?.cached_tokens ?? 0;
            if (
              Number.isSafeInteger(input) &&
              Number.isSafeInteger(output) &&
              Number.isSafeInteger(cached) &&
              input! >= 0 &&
              output! >= 0 &&
              cached >= 0 &&
              cached <= input!
            )
              consumption.usage = {
                input_tokens: (consumption.usage?.input_tokens ?? 0) + input!,
                cached_input_tokens: (consumption.usage?.cached_input_tokens ?? 0) + cached,
                output_tokens: (consumption.usage?.output_tokens ?? 0) + output!,
              };
          } catch {
            /* Missing usage must not become fabricated billable quantities. */
          }
        }
        return response;
      }) as typeof fetch;
      try {
        const reply = await createSceneAgent({
          getKey: async () => config.OPENAI_API_KEY!,
          fetchImpl: trackedFetch,
          model,
          tracing: config.BLACKBLEND_AGENT_TRACING !== "off",
          timeoutMs: geometryAvailable(config, owner) ? 300000 : 180000,
          cutWindow: geometryAvailable(config, owner)
            ? hostedWindowExecutor(config, owner, input.requestId, {
                dispatch: nativeDispatch,
                fetchImpl,
                baseRevision: input.scene.revision,
              })
            : undefined,
        })(input);
        const native = await db
          .prepare("SELECT * FROM native_geometry WHERE owner=? AND request_id=?")
          .bind(owner, input.requestId)
          .first<GeometryRow>();
        if (native && (native.status !== "completed" || reply.scene.geometry?.id !== native.id))
          throw Error(
            "The native edit needs reconciliation. Check this saved request; no automatic retry was made.",
          );
        const now = new Date().toISOString();
        const writes = [
          db
            .prepare(
              `UPDATE agent_requests SET status='completed',reply=?,updated_at=? WHERE id=? AND owner=? AND status='pending'`,
            )
            .bind(JSON.stringify(reply), now, saved.id, owner),
        ];
        if (consumption.usage)
          writes.push(
            db
              .prepare(
                `INSERT INTO usage_events (id,owner,kind,payload,created_at) VALUES (?,?,'agent.completed',?,?) ON CONFLICT(id) DO NOTHING`,
              )
              .bind(saved.id, owner, JSON.stringify({ model, ...consumption.usage }), now),
          );
        await db.batch(writes);
        return reply;
      } catch (error) {
        const message =
          error instanceof Error && error.name !== "ZodError"
            ? error.message
            : "The agent response could not be validated.";
        const now = new Date().toISOString();
        const writes = [
          db
            .prepare(
              `UPDATE agent_requests SET status='unknown',error=?,updated_at=? WHERE id=? AND owner=? AND status='pending'`,
            )
            .bind(message, now, saved.id, owner),
        ];
        if (consumption.usage)
          writes.push(
            db
              .prepare(
                `INSERT INTO usage_events (id,owner,kind,payload,created_at) VALUES (?,?,'agent.completed',?,?) ON CONFLICT(id) DO NOTHING`,
              )
              .bind(saved.id, owner, JSON.stringify({ model, ...consumption.usage }), now),
          );
        await db.batch(writes);
        throw Error(message);
      }
    },
  };
}
