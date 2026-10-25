/** Save local generation inputs for approval. This module never calls a provider. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function createWorkflowStore({ root, submit }) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const locks = new Set();
  const file = (id) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid workflow ID.");
    return path.join(root, id + ".json");
  };
  const read = async (id) => JSON.parse(await fs.readFile(file(id), "utf8"));
  const write = async (record) => {
    const target = file(record.id),
      tmp = target + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(record), { mode: 0o600 });
    await fs.rename(tmp, target);
  };
  async function source(record) {
    const data = await fs.readFile(path.join(root, record.id + ".mp4"));
    if (digest(data) !== record.sourceHash)
      throw new Error("Source changed. Prepare a new proposal.");
    return data;
  }
  return {
    async prepare(input) {
      if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 12000)
        throw new Error("A prompt is required.");
      if (!["480P", "768P", "1080P"].includes(input.resolution))
        throw new Error("Invalid quality.");
      if (typeof input.source !== "string" || !input.source.startsWith("data:video/mp4;base64,"))
        throw new Error("MP4 source required.");
      const bytes = Buffer.from(input.source.split(",")[1], "base64");
      if (!bytes.length || bytes.length > 25_000_000)
        throw new Error("Source must be under 25 MB.");
      const images = input.images ?? [];
      if (
        !Array.isArray(images) ||
        images.length > 6 ||
        images.some(
          (image) =>
            typeof image !== "string" ||
            !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image) ||
            image.length > 10_000_000,
        )
      )
        throw new Error("Invalid references.");
      const id = randomUUID();
      const record = {
        id,
        requestId: randomUUID(),
        prompt: input.prompt.trim(),
        resolution: input.resolution,
        images,
        sourceHash: digest(bytes),
        createdAt: new Date().toISOString(),
        status: "awaiting_approval",
        siteWorkflowId:
          typeof input.siteWorkflowId === "string" && /^[a-f0-9-]{36}$/.test(input.siteWorkflowId)
            ? input.siteWorkflowId
            : null,
      };
      record.inputHash = digest(
        Buffer.from(
          JSON.stringify({
            sourceHash: record.sourceHash,
            prompt: record.prompt,
            resolution: record.resolution,
            images,
          }),
        ),
      );
      await fs.writeFile(path.join(root, id + ".mp4"), bytes, { mode: 0o600 });
      await write(record);
      return this.view(record);
    },
    async get(id) {
      return this.view(await read(id));
    },
    view(record) {
      const { images, ...publicRecord } = record;
      return {
        ...publicRecord,
        referenceCount: images.length,
        source: "/api/workflows/" + record.id + "/source",
        references: images,
        approvalUrl: "/workflow.html?id=" + record.id,
      };
    },
    async source(id) {
      return source(await read(id));
    },
    async approve(id, inputHash) {
      if (locks.has(id)) throw new Error("Submission in progress. Do not retry.");
      locks.add(id);
      try {
        const record = await read(id);
        if (record.status !== "awaiting_approval") return this.view(record);
        if (record.inputHash !== inputHash) throw new Error("Inputs changed. Review again.");
        const bytes = await source(record);
        record.status = "submitting";
        record.approvedAt = new Date().toISOString();
        await write(record);
        try {
          const result = await submit({
            requestId: record.requestId,
            prompt: record.prompt,
            resolution: record.resolution,
            images: record.images,
            maxGeneratedReferenceImages: 0,
            animation: "data:video/mp4;base64," + bytes.toString("base64"),
          });
          record.jobId = result.id;
          record.status = "submitted";
          await write(record);
        } catch {
          record.status = "unknown";
          record.error =
            "Submission outcome is uncertain. Inspect provider history; never automatically resubmit.";
          await write(record);
        }
        return this.view(record);
      } finally {
        locks.delete(id);
      }
    },
  };
}
