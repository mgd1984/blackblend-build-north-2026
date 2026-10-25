"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";

type Props = {
  compact?: boolean;
  workflowId: string;
  sourceHash: string | null;
  status: string;
  references: string[];
  onUpdated: () => Promise<unknown>;
  onUseSource: () => Promise<unknown>;
};
type Capabilities = {
  available: boolean;
  mode: "operator-preview";
  billing: "not-enabled";
  reason: string | null;
};
type Generation = {
  id: string;
  workflowId: string;
  inputHash: string;
  status:
    | "awaiting_approval"
    | "submitting"
    | "queued"
    | "running"
    | "unknown"
    | "failed"
    | "completed"
    | "cancelled";
  prompt: string;
  resolution: "480P" | "768P" | "1080P";
  model: string;
  durationMs: number;
  referenceCount: number;
  baseEstimateCents: number;
  estimateIncludesReferenceUsage: false;
  error: string | null;
  processingMs: number | null;
  createdAt: string;
  approvedAt: string | null;
  expiresAt: string;
  source: string;
  references: string[];
  result: string | null;
};
type Snapshot = { workflowId: string; capabilities: Capabilities; generation: Generation | null };
type Command =
  | {
      action: "prepare";
      workflowId: string;
      sourceHash: string;
      requestId: string;
      images: string[];
    }
  | { action: "approve"; id: string; inputHash: string; acceptProviderCharge: true }
  | { action: "cancel" | "refresh"; id: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash = /^[a-f0-9]{64}$/;
const states = new Set([
  "awaiting_approval",
  "submitting",
  "queued",
  "running",
  "unknown",
  "failed",
  "completed",
  "cancelled",
]);
const approvalStorageKey = (id: string) => "blackblend.generation.approval.v1." + id;
const storageKey = (workflowId: string) => "blackblend.generation.prepare.v1." + workflowId;
const seconds = (ms: number) => (ms / 1000).toFixed(1) + "s";
const panelStyle: CSSProperties = {
  border: "1px solid #ffffff14",
  borderRadius: 12,
  padding: 18,
  marginBlock: 0,
  background: "#19191e",
};
const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 10,
};
const fineStyle: CSSProperties = { fontSize: 12, color: "#a6a6b2", lineHeight: 1.6 };

function readGeneration(value: unknown, workflowId: string): Generation | null {
  if (value === null) return null;
  if (!value || typeof value !== "object")
    throw Error("Generation response incomplete. Refresh its saved status.");
  const item = value as Generation;
  const media = (kind: string) => "/api/generation-media?id=" + item.id + "&kind=" + kind;
  if (
    !uuid.test(item.id) ||
    item.workflowId !== workflowId ||
    !states.has(item.status) ||
    !hash.test(item.inputHash) ||
    typeof item.prompt !== "string" ||
    !["480P", "768P", "1080P"].includes(item.resolution) ||
    !Number.isFinite(item.durationMs) ||
    item.durationMs <= 0 ||
    !Number.isSafeInteger(item.baseEstimateCents) ||
    item.baseEstimateCents < 0 ||
    item.estimateIncludesReferenceUsage !== false ||
    !Number.isInteger(item.referenceCount) ||
    item.referenceCount < 0 ||
    item.referenceCount > 6 ||
    !Array.isArray(item.references) ||
    item.references.length !== item.referenceCount ||
    item.references.some((url, index) => url !== media("ref" + index)) ||
    item.source !== media("source") ||
    (item.result !== null && item.result !== media("result")) ||
    !Number.isFinite(Date.parse(item.expiresAt))
  ) {
    throw Error("Generation response incomplete. Refresh its saved status.");
  }
  return item;
}
async function json(url: string, options?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(options?.method === "POST" ? 150_000 : 15_000),
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    if (response.status === 401) throw Error("Sign in to use hosted generation.");
    throw Error(
      typeof data?.error === "string"
        ? data.error.slice(0, 300)
        : "Could not read generation status. Refresh before continuing.",
    );
  }
  if (!data || typeof data !== "object")
    throw Error("Generation response incomplete. Refresh its saved status.");
  return data;
}

export default function GenerationPanel({
  compact = false,
  workflowId,
  sourceHash,
  status,
  references,
  onUpdated,
  onUseSource,
}: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<Command["action"] | "read" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);
  const [uncertainApproval, setUncertainApproval] = useState<string | null>(null);
  const inFlight = useRef(false);
  const prepareRequest = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const current = snapshot?.workflowId === workflowId ? snapshot : null;
  const job = current?.generation ?? null;
  const capability = current?.capabilities;
  const uncertain = !!job && (job.status === "unknown" || uncertainApproval === job.id);
  const expired = !!job && Date.parse(job.expiresAt) <= checkedAt;
  const canPrepare =
    !!current &&
    !!capability?.available &&
    ["rendered", "reviewed"].includes(status) &&
    !!sourceHash &&
    hash.test(sourceHash) &&
    !job;

  function rememberApproval(id: string) {
    try {
      sessionStorage.setItem(approvalStorageKey(id), "uncertain");
    } catch {}
  }
  function reconcileApproval(job: Generation | null) {
    if (!job) return;
    try {
      if (["awaiting_approval", "submitting", "unknown"].includes(job.status)) {
        if (sessionStorage.getItem(approvalStorageKey(job.id))) setUncertainApproval(job.id);
      } else {
        sessionStorage.removeItem(approvalStorageKey(job.id));
        setUncertainApproval(null);
      }
    } catch {}
  }
  const readSnapshot = useCallback(
    async (signal?: AbortSignal): Promise<Snapshot> => {
      const [capabilities, saved] = await Promise.all([
        json("/api/generations", { signal }),
        json("/api/generations?workflowId=" + encodeURIComponent(workflowId), { signal }),
      ]);
      if (
        typeof capabilities.available !== "boolean" ||
        capabilities.mode !== "operator-preview" ||
        capabilities.billing !== "not-enabled"
      ) {
        throw Error("This generation configuration is unavailable. Refresh before continuing.");
      }
      return {
        workflowId,
        capabilities: capabilities as Capabilities,
        generation: readGeneration(saved.generation, workflowId),
      };
    },
    [workflowId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void readSnapshot(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setSnapshot(next);
          reconcileApproval(next.generation);
          setCheckedAt(Date.now());
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Could not load generation status.");
      });
    return () => controller.abort();
  }, [readSnapshot]);
  const updated = useCallback(async () => {
    try {
      await onUpdated();
    } catch {
      setNotice("Generation saved. Refresh the project to update its media.");
    }
  }, [onUpdated]);
  const post = useCallback(
    async (command: Command) => {
      const data = await json("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const next = readGeneration(data.generation, workflowId);
      setCheckedAt(Date.now());
      if (!next) throw Error("Generation response incomplete. Refresh its saved status.");
      setSnapshot((previous) =>
        previous?.workflowId === workflowId ? { ...previous, generation: next } : previous,
      );
      reconcileApproval(next);
      return next;
    },
    [workflowId],
  );
  const refreshProvider = useCallback(
    async (id: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy("refresh");
      try {
        const next = await post({ action: "refresh", id });
        setError("");
        if (["completed", "failed"].includes(next.status)) await updated();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not refresh generation status.");
      } finally {
        inFlight.current = false;
        setBusy(null);
      }
    },
    [post, updated],
  );
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const id = job.id;
    const timer = setInterval(() => {
      if (!document.hidden) void refreshProvider(id);
    }, 5000);
    return () => clearInterval(timer);
  }, [job, refreshProvider]);

  async function readSaved() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("read");
    try {
      const next = await readSnapshot();
      setSnapshot(next);
      reconcileApproval(next.generation);
      setCheckedAt(Date.now());
      setError("");
      if (
        next.generation &&
        !["awaiting_approval", "submitting", "unknown"].includes(next.generation.status)
      )
        setUncertainApproval(null);
      await updated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read generation status.");
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }
  async function act(action: "prepare" | "approve" | "cancel") {
    if (inFlight.current || (action === "prepare" && !canPrepare)) return;
    if (
      action !== "prepare" &&
      (!job || job.status !== "awaiting_approval" || (uncertain && action === "approve"))
    )
      return;
    if (
      action === "approve" &&
      (!capability?.available || Date.parse(job!.expiresAt) <= Date.now())
    )
      return;
    inFlight.current = true;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      if (action === "prepare") {
        if (
          references.length > 6 ||
          references.reduce((size, image) => size + image.length, 0) > 8_000_000
        )
          throw Error("Use up to six reference images totalling less than 6 MB.");
        const bytes = new TextEncoder().encode(
          JSON.stringify({ workflowId, sourceHash, references }),
        );
        const fingerprint = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (n) => n.toString(16).padStart(2, "0"),
        ).join("");
        let request = prepareRequest.current;
        if (request?.fingerprint !== fingerprint) {
          try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey(workflowId)) ?? "null");
            if (saved?.fingerprint === fingerprint && uuid.test(saved.requestId)) request = saved;
          } catch {}
          if (request?.fingerprint !== fingerprint)
            request = { fingerprint, requestId: crypto.randomUUID() };
          prepareRequest.current = request;
          // Save only the request ID and source hash for recovery, never reference photos.
          try {
            sessionStorage.setItem(storageKey(workflowId), JSON.stringify(request));
          } catch {}
        }
        if (status === "rendered") await onUseSource();
        await post({
          action,
          workflowId,
          sourceHash: sourceHash!,
          requestId: request!.requestId,
          images: references,
        });
        prepareRequest.current = null;
        try {
          sessionStorage.removeItem(storageKey(workflowId));
        } catch {}
      } else if (action === "approve") {
        rememberApproval(job!.id);
        setUncertainApproval(job!.id);
        await post({ action, id: job!.id, inputHash: job!.inputHash, acceptProviderCharge: true });
      } else {
        const cancelled = await post({ action, id: job!.id });
        if (cancelled.status === "cancelled") {
          prepareRequest.current = null;
          try {
            sessionStorage.removeItem(storageKey(workflowId));
          } catch {}
          setSnapshot((previous) =>
            previous?.workflowId === workflowId ? { ...previous, generation: null } : previous,
          );
          setNotice("Generation cancelled. Nothing was submitted.");
        }
      }
      await updated();
    } catch (reason) {
      setError(
        action === "approve"
          ? "The approval response was interrupted. Check saved status before continuing; do not submit another job."
          : reason instanceof Error
            ? reason.message
            : "The generation action could not be completed. Refresh its saved status.",
      );
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <section
      className={"generation-panel" + (compact ? " generation-compact" : "")}
      aria-label="Hosted generation"
      style={compact ? undefined : panelStyle}
    >
      {!compact && (
        <header style={rowStyle}>
          <h3 style={{ fontSize: 15, letterSpacing: -0.3 }}>Generate video</h3>
          <span
            style={{
              fontSize: 10,
              color: "#c3c7bc",
              border: "1px solid #d6edaa22",
              borderRadius: 4,
              padding: "4px 6px",
            }}
          >
            fal · H3 Max
          </span>
        </header>
      )}
      {!compact && <p style={{ ...fineStyle, marginTop: 9 }}>Uses your connected fal account.</p>}
      {!current && !error && (
        <p role="status" style={fineStyle}>
          Loading generation controls…
        </p>
      )}
      {capability &&
        !capability.available &&
        (compact && !job ? (
          <details className="generation-availability">
            <summary>Generation unavailable here</summary>
            <p style={{ ...fineStyle, marginTop: 8 }}>
              {capability.reason ?? "Hosted generation is unavailable for this account."}
            </p>
            <button className="scene-secondary" disabled={!!busy} onClick={() => void readSaved()}>
              Refresh status
            </button>
          </details>
        ) : (
          <p style={{ ...fineStyle, marginTop: 12 }}>
            {capability.reason ?? "Hosted generation is unavailable for this account."}
          </p>
        ))}
      {!job && current && capability?.available && (
        <div style={{ marginTop: 14 }}>
          {!compact && (
            <p style={fineStyle}>
              {canPrepare
                ? "Use this animation and your appearance references."
                : "Save a source animation to generate a video."}
            </p>
          )}
          <button
            className="button outline"
            style={{ marginTop: 10, padding: "10px 13px", fontSize: 12 }}
            disabled={!canPrepare || !!busy}
            onClick={() => void act("prepare")}
          >
            {busy === "prepare" ? "Preparing…" : "Generate video"}
          </button>
        </div>
      )}
      {job && (
        <>
          <div style={{ ...rowStyle, marginTop: 16 }}>
            <strong
              style={{
                fontSize: 12,
                fontWeight: 500,
                textTransform: "capitalize",
                color: "#d6edaa",
              }}
            >
              {job.status === "awaiting_approval"
                ? "Ready to generate"
                : job.status.replaceAll("_", " ")}
            </strong>
            {job.processingMs != null && (
              <span style={fineStyle}>Provider processing {seconds(job.processingMs)}</span>
            )}
          </div>
          {job.status === "awaiting_approval" && (
            <p style={{ ...fineStyle, marginTop: 9 }}>
              {seconds(job.durationMs)} · {job.resolution} · {job.referenceCount} appearance{" "}
              {job.referenceCount === 1 ? "image" : "images"}
            </p>
          )}
          <details style={{ marginTop: 12, fontSize: 12 }}>
            <summary>Job details</summary>
            <video
              src={job.source}
              controls
              playsInline
              preload="metadata"
              aria-label="Frozen source animation"
              style={{
                display: "block",
                width: "100%",
                maxHeight: 260,
                background: "#080b09",
                borderRadius: 5,
                marginTop: 12,
              }}
            />
            {!!job.references.length && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {job.references.map((url, index) => (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    key={url}
                    title={"Frozen appearance reference " + (index + 1)}
                  >
                    <img
                      src={url}
                      alt={"Frozen appearance reference " + (index + 1)}
                      style={{
                        width: 64,
                        height: 64,
                        objectFit: "cover",
                        border: "1px solid #ffffff16",
                        borderRadius: 4,
                      }}
                    />
                  </a>
                ))}
              </div>
            )}
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                columnGap: 18,
                rowGap: 8,
                marginTop: 14,
                color: "#a9b39f",
                fontSize: 12,
              }}
            >
              <dt>Output</dt>
              <dd style={{ margin: 0 }}>
                {job.resolution} · {seconds(job.durationMs)}
              </dd>
              <dt>References</dt>
              <dd style={{ margin: 0 }}>{job.referenceCount}</dd>
              <dt>Base estimate</dt>
              <dd style={{ margin: 0 }}>USD {(job.baseEstimateCents / 100).toFixed(2)}</dd>
              <dt>Approval expires</dt>
              <dd style={{ margin: 0 }}>{new Date(job.expiresAt).toLocaleString()}</dd>
            </dl>
            <p
              style={{
                ...fineStyle,
                whiteSpace: "pre-wrap",
                borderLeft: "2px solid #d6edaa30",
                paddingLeft: 10,
                marginTop: 12,
              }}
            >
              {job.prompt}
            </p>

            <p
              style={{
                ...fineStyle,
                overflowWrap: "anywhere",
                fontFamily: "monospace",
                fontSize: 9,
                color: "#7e8a73",
                marginTop: 10,
              }}
            >
              INPUT SHA-256 / {job.inputHash}
            </p>
          </details>
          {job.status === "awaiting_approval" && !uncertain && (
            <div style={{ marginTop: 16 }}>
              {expired && (
                <p style={fineStyle}>
                  This approval expired. Cancel it and prepare current inputs.
                </p>
              )}
              <p style={fineStyle}>
                USD {(job.baseEstimateCents / 100).toFixed(2)} output base, plus input-video and
                image processing. Clicking Generate authorizes these fal charges.
              </p>
              <div className="flow-actions generation-submit">
                <button
                  className="button"
                  disabled={!!busy || expired || !capability?.available}
                  onClick={() => void act("approve")}
                >
                  <Sparkles size={14} />{" "}
                  {busy === "approve"
                    ? "Starting…"
                    : "Generate · $" + (job.baseEstimateCents / 100).toFixed(2) + " base"}
                </button>
              </div>
            </div>
          )}
          {job.status === "awaiting_approval" && (
            <button
              className="button outline"
              style={{ marginTop: 12 }}
              disabled={!!busy}
              onClick={() => void act("cancel")}
            >
              Cancel
            </button>
          )}
          {uncertain && (
            <p role="alert" style={{ ...fineStyle, color: "#e4bc91", marginTop: 14 }}>
              Submission is uncertain. Inspect provider history before continuing. This take is
              blocked; do not resubmit it.
            </p>
          )}
          {job.status === "submitting" && !uncertain && (
            <p role="status" style={{ ...fineStyle, marginTop: 12 }}>
              Submission is in progress. Read its saved status before taking another action.
            </p>
          )}
          {["queued", "running"].includes(job.status) && (
            <p role="status" style={{ ...fineStyle, marginTop: 12 }}>
              Checking this job every five seconds while this page is visible.
            </p>
          )}
          {job.status === "completed" && (
            <p style={{ ...fineStyle, marginTop: 12 }}>
              <Check size={12} style={{ display: "inline", marginRight: 5 }} />
              Result saved to this project.
              {job.result && (
                <>
                  {" "}
                  <a href={job.result} download>
                    Download MP4
                  </a>
                </>
              )}
            </p>
          )}
          {job.error && (
            <p style={{ ...fineStyle, color: "#e4bc91", marginTop: 12 }}>{job.error}</p>
          )}
        </>
      )}
      {error && (
        <p role="alert" style={{ ...fineStyle, color: "#e4bc91", marginTop: 12 }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={{ ...fineStyle, marginTop: 12 }}>
          {notice}
        </p>
      )}
      {(!compact || capability?.available || job || error) && (
        <button
          className="scene-secondary"
          style={{ marginTop: 14, fontSize: 10 }}
          disabled={!!busy}
          onClick={() =>
            void (["queued", "running"].includes(job?.status ?? "") && job
              ? refreshProvider(job.id)
              : readSaved())
          }
        >
          {busy === "read" || busy === "refresh" ? (
            <LoaderCircle size={12} className="scene-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          Refresh status
        </button>
      )}
    </section>
  );
}
