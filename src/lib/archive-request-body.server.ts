export class ArchiveRequestTooLargeError extends Error {
  constructor() {
    super("Archive request body exceeds the configured limit");
    this.name = "ArchiveRequestTooLargeError";
  }
}

export async function readArchiveRequestBody(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ArchiveRequestTooLargeError();
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new ArchiveRequestTooLargeError();
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}
