/** Read local job settings as JSON on stdin. Prepare approval without submitting a job. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk;
  if (raw.length > 100000) throw new Error("Input too large.");
}
const input = JSON.parse(raw),
  file = await fs.realpath(input.sourceFile),
  runs = await fs.realpath(path.join(root, "runs"));
if (!file.startsWith(runs + path.sep) || path.extname(file) !== ".mp4")
  throw new Error("Select an MP4 within the local runs directory.");
const bytes = await fs.readFile(file);
if (
  !/^[a-f0-9]{64}$/.test(input.expectedSourceHash ?? "") ||
  createHash("sha256").update(bytes).digest("hex") !== input.expectedSourceHash
)
  throw new Error("The local MP4 does not match the reviewed Site source.");
if (bytes.length > 25_000_000) throw new Error("Source exceeds 25 MB.");
const base = "http://127.0.0.1:4317",
  config = await (await fetch(base + "/api/config", { redirect: "error" })).json();
const images = [];
for (const filename of input.references ?? []) {
  const ref = await fs.realpath(filename);
  if (!ref.startsWith(runs + path.sep))
    throw new Error("References must be locally selected within runs.");
  const ext = path.extname(ref).slice(1),
    mime = { jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp" }[ext];
  const data = await fs.readFile(ref);
  if (!mime || data.length > 7_400_000) throw new Error("Invalid reference.");
  images.push("data:image/" + mime + ";base64," + data.toString("base64"));
}
const response = await fetch(base + "/api/workflows", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Local-Token": config.token },
  body: JSON.stringify({
    siteWorkflowId: input.siteWorkflowId,
    prompt: input.prompt,
    resolution: input.resolution ?? "480P",
    images,
    source: "data:video/mp4;base64," + bytes.toString("base64"),
  }),
  redirect: "error",
});
if (!response.ok) throw new Error("Could not prepare local approval.");
const proposal = await response.json();
console.log(
  JSON.stringify({ ...proposal, references: undefined, approvalUrl: base + proposal.approvalUrl }),
);
