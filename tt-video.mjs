#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { performance } from "node:perf_hooks";

export const BASE = "https://console.tenstorrent.com/v1/video/jobs";
const helper = fileURLToPath(new URL("./scripts/keychain.swift", import.meta.url));

export function keychain(action, secret, provider = "tenstorrent") {
  return new Promise((resolve, reject) => {
    // Secret travels over stdin; never shell text, argv, or environment.
    const child = spawn("/usr/bin/xcrun", ["swift", helper, action, provider], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.resume();
    child.on("error", reject);
    child.stdin.on("error", () => {});
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks).toString())
        : reject(
            new Error(
              "Keychain operation failed. Check macOS access permissions and Xcode Command Line Tools.",
            ),
          ),
    );
    child.stdin.end(secret ?? "");
  });
}

async function hiddenKey(provider = "tenstorrent") {
  if (!process.stdin.isTTY) throw new Error("Enter the key in an interactive Terminal.");
  process.stdout.write(`${provider === "fal" ? "fal" : "Tenstorrent"} API key (hidden): `);
  const input = process.stdin;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    function finish(error) {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      error ? reject(error) : resolve(value);
    }
    function onData(chunk) {
      for (const c of chunk.toString()) {
        if (c === "\u0003" || c === "\u0004") return finish(new Error("Key entry cancelled."));
        if (c === "\r" || c === "\n") return finish();
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    }
    input.on("data", onData);
  });
}

export async function request(url, key, { payload, fetchImpl = fetch } = {}) {
  let current = url;
  let authorization = true;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const target = new URL(current);
    if (target.protocol !== "https:" || target.username || target.password)
      throw new Error("Unsafe URL refused.");
    const response = await fetchImpl(current, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        ...(authorization ? { Authorization: `Bearer ${key}` } : {}),
        ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      if (payload !== undefined)
        throw new Error("Submission redirect refused. Check Console before resubmitting.");
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect has no location.");
      const next = new URL(location, current);
      if (next.origin !== target.origin) authorization = false;
      current = next.href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status}; request was not retried.`);
    }
    return response;
  }
  throw new Error("Too many redirects.");
}

export function validateId(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id ?? "")) throw new Error("Supply a valid job ID.");
  return id;
}
const writeJson = (file, value) =>
  fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });

export async function submit(payload, key, directory, fetchImpl = fetch) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const run = await fs.mkdtemp(path.join(directory, "run-"));
  await writeJson(path.join(run, "request.json"), payload);
  const started = new Date().toISOString();
  await writeJson(path.join(run, "submission.json"), { state: "attempting", started });
  console.log(`Run record: ${run}`);
  const start = performance.now();
  let result;
  try {
    result = await (await request(BASE, key, { payload, fetchImpl })).json();
  } catch (error) {
    await writeJson(path.join(run, "submission.json"), {
      state: "unknown",
      started,
      elapsedSeconds: (performance.now() - start) / 1000,
      note: "Check Console before resubmitting; the job may have been accepted.",
    });
    throw error;
  }
  await writeJson(path.join(run, "response.json"), result);
  await writeJson(path.join(run, "submission.json"), {
    state: "response_received",
    started,
    submissionSeconds: (performance.now() - start) / 1000,
  });
  return result;
}

export async function download(id, key, output, fetchImpl = fetch) {
  try {
    await fs.access(output);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // Exclusive final reservation prevents overwriting a concurrently created output.
  const reservation = await fs.open(output, "wx", 0o600);
  let partial;
  try {
    partial = await fs.open(output + ".part", "wx", 0o600);
    const response = await request(`${BASE}/${validateId(id)}/download`, key, { fetchImpl });
    const reader = response.body.getReader();
    let prefix = Buffer.alloc(0);
    let validated = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        if (!validated) {
          prefix = Buffer.concat([prefix, chunk]);
          if (prefix.length < 64) continue;
          if (!prefix.subarray(0, 64).includes(Buffer.from("ftyp")))
            throw new Error("Response does not look like an MP4.");
          await partial.writeFile(prefix);
          validated = true;
        } else await partial.writeFile(chunk);
      }
      if (!validated) throw new Error("Empty or truncated MP4 response.");
    } finally {
      await reader.cancel().catch(() => {});
    }
    await partial.close();
    partial = undefined;
    await reservation.close();
    await fs.rename(output + ".part", output);
  } catch (error) {
    await partial?.close();
    await reservation.close().catch(() => {});
    await fs.unlink(output).catch(() => {});
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  process.umask(0o077);
  const { values: opts, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      provider: { type: "string", default: "tenstorrent" },
      model: { type: "string" },
      prompt: { type: "string" },
      duration: { type: "string" },
      seed: { type: "string" },
      image: { type: "string" },
      "dry-run": { type: "boolean" },
      "confirm-submit": { type: "boolean" },
      "runs-dir": { type: "string", default: "runs" },
      timeout: { type: "string", default: "600" },
      interval: { type: "string", default: "5" },
      output: { type: "string" },
      help: { type: "boolean" },
    },
  });
  const [command, id] = positionals;
  if (opts.help || !command) {
    console.log(
      "Commands: key set|check [--provider tenstorrent|fal]; submit --model ID --prompt TEXT [--duration N --seed N --image FILE] --dry-run|--confirm-submit; status JOB_ID; wait JOB_ID [--timeout 600 --interval 5]; download JOB_ID --output video.mp4",
    );
    return;
  }
  if (command === "key") {
    if (!["tenstorrent", "fal"].includes(opts.provider))
      throw new Error("Provider must be tenstorrent or fal.");
    if (id === "set") {
      const secret = await hiddenKey(opts.provider);
      if (!secret || /\s/.test(secret))
        throw new Error("Key must be nonempty and contain no whitespace.");
      await keychain("set", secret, opts.provider);
      console.log("Stored in macOS Keychain.");
    } else if (id === "check") {
      await keychain("get", undefined, opts.provider);
      console.log("Key is accessible; no network request made.");
    } else throw new Error("Use key set or key check.");
    return;
  }
  if (command === "submit") {
    if (!opts.model || !opts.prompt) throw new Error("--model and --prompt are required.");
    const payload = { model: opts.model, prompt: opts.prompt };
    for (const name of ["seed", "duration"])
      if (opts[name] !== undefined) {
        const value = Number(opts[name]);
        if (!Number.isSafeInteger(value) || (name === "duration" && value <= 0))
          throw new Error(`Invalid ${name}.`);
        payload[name] = value;
      }
    if (opts.image) {
      const mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      }[path.extname(opts.image).toLowerCase()];
      if (!mime || (await fs.stat(opts.image)).size > 7_500_000)
        throw new Error("Use PNG/JPEG/WebP within the encoded 10 MB limit.");
      payload.image = `data:${mime};base64,${(await fs.readFile(opts.image)).toString("base64")}`;
      if (Buffer.byteLength(payload.image) > 10_000_000)
        throw new Error("Encoded image exceeds 10 MB.");
    }
    if (opts["dry-run"]) {
      console.log(
        JSON.stringify(
          {
            url: BASE,
            payload: {
              ...payload,
              ...(payload.image ? { image: `<data URI: ${payload.image.length} bytes>` } : {}),
            },
          },
          null,
          2,
        ),
      );
      return;
    }
    if (!opts["confirm-submit"])
      throw new Error(
        "Review with --dry-run, then authorize one potentially billable job with --confirm-submit.",
      );
    console.log(
      JSON.stringify(await submit(payload, await keychain("get"), opts["runs-dir"]), null, 2),
    );
    return;
  }
  if (!["status", "wait", "download"].includes(command))
    throw new Error("Unknown command. Use --help.");
  validateId(id);
  if (command === "download" && !opts.output) throw new Error("--output is required.");
  const timeout = Number(opts.timeout),
    interval = Number(opts.interval);
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(interval) || interval < 1)
    throw new Error("Invalid timeout or interval.");
  const key = await keychain("get");
  if (command === "download") {
    await download(id, key, opts.output);
    console.log(`Saved ${opts.output}`);
    return;
  }
  const start = performance.now();
  do {
    const result = await (await request(`${BASE}/${id}`, key)).json();
    console.log(JSON.stringify(result));
    if (command === "status" || result.status === "completed") return;
    if (["failed", "cancelled", "canceled", "error"].includes(result.status))
      throw new Error("Job ended without completing.");
    if (performance.now() - start >= timeout * 1000)
      throw new Error("Polling timed out; remote job may still run. Resume with wait/status.");
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(interval * 1000, timeout * 1000 - (performance.now() - start))),
    );
  } while (true);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
