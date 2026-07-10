const appendPart = (parts: string[], seen: Set<string>, value: unknown): void => {
  if (typeof value !== "string") return;
  const normalized = value.trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  parts.push(normalized);
};

const getObjectEntries = (value: object): Array<[string, unknown]> => {
  return Object.entries(value);
};

const collectErrorParts = (
  error: unknown,
  parts: string[],
  seen: Set<string>,
  visited: WeakSet<object>,
  label?: string,
): void => {
  if (error instanceof Error) {
    appendPart(parts, seen, error.message);

    if ("cause" in error) {
      collectErrorParts((error as Error & { cause?: unknown }).cause, parts, seen, visited);
    }

    for (const [key, value] of getObjectEntries(error)) {
      if (key === "message" || key === "name" || key === "stack" || key === "cause") continue;
      collectErrorParts(value, parts, seen, visited, key);
    }
    return;
  }

  if (typeof error === "string") {
    appendPart(parts, seen, label ? `${label}: ${error}` : error);
    return;
  }

  if (error && typeof error === "object") {
    if (visited.has(error)) return;
    visited.add(error);

    if (Array.isArray(error)) {
      for (const value of error) {
        collectErrorParts(value, parts, seen, visited, label);
      }
      return;
    }

    for (const [key, value] of getObjectEntries(error)) {
      if (key === "stack" || key === "name") continue;
      collectErrorParts(value, parts, seen, visited, key);
    }
    return;
  }

  appendPart(parts, seen, label ? `${label}: ${String(error)}` : String(error));
};

export const toErrorMessage = (error: unknown): string => {
  const parts: string[] = [];
  const seen = new Set<string>();
  collectErrorParts(error, parts, seen, new WeakSet<object>());
  if (parts.length === 0) return "unknown error";
  return parts.join(" | ");
};
