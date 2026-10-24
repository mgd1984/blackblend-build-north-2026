export class RequestBodyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Bound actual bytes, including requests without (or with a false) Content-Length. */
export async function readBodyBounded(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) {
    await request.body?.cancel().catch(() => {});
    throw new RequestBodyError("Request is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("Request body required.");
  const blocks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new RequestBodyError("Request is too large.", 413);
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
  return bytes;
}

export async function readJsonBounded(
  request: Request,
  limit: number,
  { requireJson = true } = {},
) {
  if (requireJson && !request.headers.get("content-type")?.startsWith("application/json"))
    throw new RequestBodyError("JSON input required.");
  return JSON.parse(new TextDecoder().decode(await readBodyBounded(request, limit))) as unknown;
}
