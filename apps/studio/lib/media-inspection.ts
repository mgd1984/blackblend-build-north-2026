export function inspectMp4(bytes: Uint8Array, maxBytes = 25_000_000) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const name = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  let duration: number | undefined,
    hasType = false,
    hasVideo = false,
    hasData = false;
  function scan(start: number, end: number, depth: number) {
    if (depth > 3) throw Error("Invalid movie structure.");
    for (let offset = start; offset + 8 <= end;) {
      let size = view.getUint32(offset),
        header = 8;
      if (size === 1) {
        if (offset + 16 > end) throw Error("Invalid movie box.");
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      }
      if (size === 0) size = end - offset;
      if (!Number.isSafeInteger(size) || size < header || offset + size > end)
        throw Error("Invalid movie box.");
      const type = name(offset + 4),
        body = offset + header,
        limit = offset + size;
      if (type === "ftyp" && depth === 0) hasType = true;
      if (["moov", "trak", "mdia"].includes(type)) scan(body, limit, depth + 1);
      if (type === "mdat" && depth === 0 && limit > body) hasData = true;
      if (type === "hdlr" && depth === 3 && body + 12 <= limit && name(body + 8) === "vide")
        hasVideo = true;
      if (type === "mvhd") {
        const version = bytes[body],
          scaleAt = body + (version === 1 ? 20 : 12),
          durationAt = scaleAt + 4;
        if (![0, 1].includes(version) || durationAt + (version === 1 ? 8 : 4) > limit)
          throw Error("Invalid movie timing.");
        const scale = view.getUint32(scaleAt),
          ticks =
            version === 1 ? Number(view.getBigUint64(durationAt)) : view.getUint32(durationAt);
        duration = ticks / scale;
      }
      offset = limit;
    }
  }
  if (bytes.byteLength < 32 || bytes.byteLength > maxBytes) throw Error("Invalid MP4 file size.");
  scan(0, bytes.byteLength, 0);
  if (
    !hasType ||
    !hasVideo ||
    !hasData ||
    !Number.isFinite(duration) ||
    !duration ||
    duration <= 0 ||
    duration > 15
  )
    throw Error("Use a finalized MP4 of 15 seconds or less.");
  return { durationMs: Math.round(duration * 1000) };
}
export async function digest(bytes: BufferSource) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function imageBytes(uri: string) {
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(uri) || uri.length > 10_000_000)
    throw Error("Use PNG, JPEG or WebP references under 7 MB.");
  const [header, encoded] = uri.split(","),
    mime = header.slice(5, header.indexOf(";"));
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const head = String.fromCharCode(...bytes.subarray(0, 12));
  const valid =
    mime === "image/png"
      ? bytes[0] === 137 && head.slice(1, 4) === "PNG"
      : mime === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216
        : head.startsWith("RIFF") && head.slice(8) === "WEBP";
  if (!valid || bytes.length > 7_000_000) throw Error("Invalid appearance image.");
  return { bytes, mime };
}
