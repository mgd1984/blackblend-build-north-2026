"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
type Status = {
  mode: "disabled" | "sandbox";
  configured: boolean;
  commercialGenerationEnabled: false;
  usage: { pending: number; accepted: number; attentionRequired: number };
  notificationPending: number;
  lastAcceptedAt: string | null;
  reason: string | null;
};
export default function BillingStatus() {
  const [value, setValue] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh(signal?: AbortSignal) {
    if (!signal) setBusy(true);
    try {
      const response = await fetch("/api/billing", { cache: "no-store", signal });
      if (!response.ok)
        throw Error(
          response.status === 401 ? "Sign in to see billing." : "Billing status is unavailable.",
        );
      const data = (await response.json()) as Status;
      if (
        !["disabled", "sandbox"].includes(data.mode) ||
        data.commercialGenerationEnabled !== false ||
        typeof data.configured !== "boolean" ||
        !Number.isSafeInteger(data.usage?.pending) ||
        !Number.isSafeInteger(data.usage?.accepted)
      )
        throw Error("Billing status is unavailable.");
      if (!signal?.aborted) {
        setValue(data);
        setError("");
      }
    } catch (reason) {
      if (!signal?.aborted)
        setError(reason instanceof Error ? reason.message : "Billing status is unavailable.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => refresh(controller.signal));
    return () => controller.abort();
  }, []);
  return (
    <details className="billing-status comparison-tuning">
      <summary>
        Usage & billing <span>{value?.configured ? "Sandbox" : "Setup pending"}</span>
      </summary>
      {value && (
        <>
          <p>
            Usage delivery{" "}
            {value.configured ? "configured for sandbox." : "awaiting sandbox setup."}
          </p>
          <dl>
            <dt>Pending delivery</dt>
            <dd>{value.usage.pending}</dd>
            <dt>Accepted by meter</dt>
            <dd>{value.usage.accepted}</dd>
          </dl>
          {value.usage.attentionRequired > 0 && (
            <p role="status">{value.usage.attentionRequired} usage records need review.</p>
          )}
          <p>
            Accepted usage has not necessarily been invoiced or paid. Customer charging is disabled.
          </p>
        </>
      )}
      {error && <p role="status">{error}</p>}
      <button className="scene-secondary" disabled={busy} onClick={() => void refresh()}>
        <RefreshCw size={12} />
        {busy ? "Checking…" : "Refresh usage"}
      </button>
    </details>
  );
}
