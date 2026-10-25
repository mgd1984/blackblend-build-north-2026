import type { Plugin } from "vite";
import { randomBytes } from "node:crypto";
import { readFile, mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { keychain } from "../../../tt-video.mjs";
import { createSceneAgent, DEFAULT_SCENE_MODEL } from "../lib/scene-agent-runner";
import { prepareSceneApproval, readSceneExecution } from "../../../scene-execution.mjs";
import { readGeometryFile, cutNativeWindow } from "./native-window";
import { sceneExampleFile } from "../lib/scene-examples";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const assets = path.join(root, "runs", "scene-assets");
export default function sceneRuntime(): Plugin {
  const token = randomBytes(32).toString("hex");
  const agent = createSceneAgent({
    getKey: () => keychain("get", undefined, "openai"),
    model: process.env.BLACKBLEND_AGENT_MODEL || DEFAULT_SCENE_MODEL,
    cutWindow: cutNativeWindow,
    onReceipt: async (receipt) => {
      const directory = path.join(assets, "agent-receipts");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(directory, String(receipt.requestId) + ".json"),
        JSON.stringify(receipt),
        { mode: 0o600 },
      );
    },
  });
  let encoding = false;
  return {
    name: "blackblend-scene-runtime",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1:4331");
        if (
          ![
            "/api/scene-agent",
            "/api/scene-example",
            "/api/scene-geometry",
            "/api/scene-encode",
            "/api/scene-approval",
            "/api/scene-execution",
          ].includes(url.pathname)
        )
          return next();
        const json = (status: number, data: unknown) => {
          res.writeHead(status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(JSON.stringify(data));
        };
        if (
          req.headers.host !== "127.0.0.1:4331" ||
          req.headers["sec-fetch-site"] === "cross-site" ||
          (req.headers.origin && req.headers.origin !== "http://127.0.0.1:4331")
        )
          return json(403, { error: "Local Studio access only." });
        try {
          if (req.method === "GET" && url.pathname === "/api/scene-agent") {
            const available =
              (await keychain("has", undefined, "openai").catch(() => "")).trim() === "true";
            return json(200, {
              available,
              token,
              nativeGeometry: true,
              model: process.env.BLACKBLEND_AGENT_MODEL || DEFAULT_SCENE_MODEL,
              reason: available ? null : "Save your agent key in macOS Keychain to enable chat.",
            });
          }
          if (req.method === "GET" && url.pathname === "/api/scene-example") {
            const kind = url.searchParams.get("kind");
            const file = sceneExampleFile(url.searchParams.get("asset"), kind);
            if (!file) return json(400, { error: "Invalid example asset." });
            const bytes = await readFile(path.join(assets, file)).catch(() => null);
            if (!bytes)
              return json(404, { error: "Private example export is unavailable on this host." });
            res.writeHead(200, {
              "Content-Type": kind === "model" ? "model/gltf-binary" : "application/json",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            });
            res.end(bytes);
            return;
          }
          if (req.method === "GET" && url.pathname === "/api/scene-geometry") {
            const kind = url.searchParams.get("kind") ?? "model";
            const bytes = await readGeometryFile(url.searchParams.get("id") ?? "", kind).catch(
              () => null,
            );
            if (!bytes)
              return json(404, { error: "Native geometry revision unavailable on this host." });
            res.writeHead(200, {
              "Content-Type":
                kind === "model"
                  ? "model/gltf-binary"
                  : kind === "blend"
                    ? "application/octet-stream"
                    : "application/json",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
              ...(kind === "blend"
                ? { "Content-Disposition": 'attachment; filename="woodshed-window.blend"' }
                : {}),
            });
            res.end(bytes);
            return;
          }
          if (req.method === "GET" && url.pathname === "/api/scene-execution") {
            const kind = url.searchParams.get("kind") ?? "",
              id = url.searchParams.get("id") ?? "";
            const record = await readSceneExecution(kind, id);
            if (record instanceof Response) {
              if (!record.body) return json(502, { error: "The execution result is empty." });
              res.writeHead(200, { "Content-Type": "video/mp4", "Cache-Control": "no-store" });
              const reader = record.body.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(value);
                }
              } finally {
                reader.releaseLock();
              }
              res.end();
              return;
            }
            return json(200, record);
          }
          if (req.method !== "POST" || req.headers["x-scene-token"] !== token)
            return json(403, { error: "Invalid scene action." });
          let size = 0;
          const chunks: Buffer[] = [];
          const max =
            url.pathname === "/api/scene-encode"
              ? 25_000_000
              : url.pathname === "/api/scene-approval"
                ? 35_000_000
                : 9_000_000;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > max) return json(413, { error: "Input is too large." });
            chunks.push(chunk);
          }
          const bytes = Buffer.concat(chunks);
          if (url.pathname === "/api/scene-approval") {
            if (!req.headers["content-type"]?.startsWith("application/json"))
              return json(400, { error: "JSON input required." });
            return json(200, await prepareSceneApproval(JSON.parse(bytes.toString())));
          }
          if (url.pathname === "/api/scene-agent") {
            if (!req.headers["content-type"]?.startsWith("application/json"))
              return json(400, { error: "JSON input required." });
            try {
              return json(200, await agent(JSON.parse(bytes.toString())));
            } catch (error) {
              return json(400, {
                error:
                  error instanceof Error && error.name !== "ZodError"
                    ? error.message
                    : "Invalid scene request.",
              });
            }
          }
          if (url.pathname === "/api/scene-encode") {
            if (encoding) return json(409, { error: "An encode is already running." });
            if (
              req.headers["content-type"] !== "video/webm" ||
              bytes.subarray(0, 4).toString("hex") !== "1a45dfa3"
            )
              return json(400, { error: "A WebM recording is required." });
            encoding = true;
            let directory: string | undefined;
            try {
              directory = await mkdtemp(path.join(assets, "encode-"));
              const source = path.join(directory, "source.webm"),
                output = path.join(directory, "source.mp4");
              await writeFile(source, bytes, { mode: 0o600 });
              await promisify(execFile)(
                process.env.FFMPEG_PATH || "ffmpeg",
                [
                  "-hide_banner",
                  "-loglevel",
                  "error",
                  "-i",
                  source,
                  "-t",
                  "15",
                  "-an",
                  "-vf",
                  "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
                  "-c:v",
                  "libx264",
                  "-preset",
                  "fast",
                  "-crf",
                  "19",
                  "-pix_fmt",
                  "yuv420p",
                  "-movflags",
                  "+faststart",
                  output,
                ],
                { timeout: 60000, maxBuffer: 65536 },
              );
              const mp4 = await readFile(output);
              res.writeHead(200, {
                "Content-Type": "video/mp4",
                "Content-Length": mp4.length,
                "Cache-Control": "no-store",
              });
              res.end(mp4);
              return;
            } catch {
              return json(500, {
                error: "Could not encode the animation. Check that ffmpeg is installed.",
              });
            } finally {
              encoding = false;
              if (directory) await rm(directory, { recursive: true, force: true });
            }
          }
          return json(404, { error: "Unknown scene action." });
        } catch {
          return json(500, { error: "The local scene runtime is unavailable." });
        }
      });
    },
  };
}
