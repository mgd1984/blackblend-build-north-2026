import { inspectMp4 } from "./media-inspection.ts";
export const VIDEO_MODEL = "minimax/h3-max/3d-to-video";
export type FalPayload = {
  video_url: string;
  prompt: string;
  resolution: string;
  reference_image_urls: string[];
  max_generated_reference_images: 0;
  enable_safety_checker: true;
};
const remoteId = (id: unknown) => {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(id))
    throw Error("Invalid provider receipt.");
  return id;
};
export class SubmissionUnknown extends Error {}
export class SubmissionRejected extends Error {}
export function falQueue(key: string, fetchImpl = fetch) {
  const headers = { Authorization: "Key " + key };
  return {
    async submit(input: FalPayload) {
      let response: Response;
      try {
        response = await fetchImpl("https://queue.fal.run/" + VIDEO_MODEL, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
            "X-Fal-No-Retry": "1",
            "x-app-fal-disable-fallback": "true",
            "X-Fal-Store-IO": "0",
            "X-Fal-Object-Lifecycle-Preference": JSON.stringify({
              expiration_duration_seconds: 86400,
            }),
          },
          body: JSON.stringify(input),
          redirect: "error",
          signal: AbortSignal.timeout(60000),
        });
      } catch {
        throw new SubmissionUnknown("Submission outcome is uncertain. Do not resubmit.");
      }
      if (!response.ok) {
        await response.body?.cancel();
        if ([400, 401, 403, 404, 422].includes(response.status))
          throw new SubmissionRejected("fal rejected the request.");
        throw new SubmissionUnknown("Submission outcome is uncertain. Do not resubmit.");
      }
      try {
        const data = (await response.json()) as { request_id: string };
        return remoteId(data.request_id);
      } catch {
        throw new SubmissionUnknown("No usable provider receipt was returned. Do not resubmit.");
      }
    },
    async status(id: string) {
      const r = await fetchImpl(
        `https://queue.fal.run/minimax/h3-max/requests/${remoteId(id)}/status`,
        { headers, redirect: "error", signal: AbortSignal.timeout(20000) },
      );
      if (!r.ok) throw Error("Provider status is temporarily unavailable.");
      return r.json() as Promise<{
        status: string;
        error?: string;
        queue_position?: number;
        metrics?: { inference_time?: number };
      }>;
    },
    async result(id: string) {
      const r = await fetchImpl(`https://queue.fal.run/minimax/h3-max/requests/${remoteId(id)}`, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw Error("Provider result is temporarily unavailable.");
      const result = (await r.json()) as { video?: { url?: string } };
      if (!result.video?.url) throw Error("The result has no video.");
      const url = new URL(result.video.url);
      if (
        url.protocol !== "https:" ||
        !url.hostname.endsWith(".fal.media") ||
        url.username ||
        url.password
      )
        throw Error("Unexpected result host.");
      const video = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(60000) });
      if (!video.ok || !video.body) throw Error("Could not download the result.");
      const reader = video.body.getReader();
      const blocks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 50_000_000) throw Error("Result exceeds the import limit.");
          blocks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const block of blocks) {
        bytes.set(block, offset);
        offset += block.length;
      }
      inspectMp4(bytes, 50_000_000);
      return bytes;
    },
  };
}
