const DEFAULT_JSON_BODY_LIMIT_BYTES = 16 * 1024;

export class JsonBodyError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "JsonBodyError";
    this.status = status;
  }
}

const getContentLength = (headers: Headers): number | null => {
  const raw = headers.get("content-length");
  if (!raw) return null;

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const readTextWithLimit = async (
  body: ReadableStream<Uint8Array> | null,
  limitBytes: number,
): Promise<string> => {
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > limitBytes) {
        throw new JsonBodyError("request_too_large", 413);
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
};

export const readJsonWithLimit = async <T>(
  requestOrResponse: Request | Response,
  limitBytes = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<T> => {
  const contentLength = getContentLength(requestOrResponse.headers);
  if (contentLength !== null && contentLength > limitBytes) {
    throw new JsonBodyError("request_too_large", 413);
  }

  const text = await readTextWithLimit(requestOrResponse.body, limitBytes);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new JsonBodyError("invalid_json", 400);
  }
};
