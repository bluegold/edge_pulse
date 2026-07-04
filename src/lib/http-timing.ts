export type ServerTimingEntry = {
  name: string;
  description: string | null;
  durationMs: number | null;
  parameters: Record<string, string | number | boolean>;
};

const splitHeaderSegments = (value: string, separator: string): string[] => {
  const segments: string[] = [];
  let current = "";
  let inQuotes = false;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\" && inQuotes) {
      current += character;
      escaped = true;
      continue;
    }

    if (character === "\"") {
      current += character;
      inQuotes = !inQuotes;
      continue;
    }

    if (character === separator && !inQuotes) {
      const trimmed = current.trim();
      if (trimmed) segments.push(trimmed);
      current = "";
      continue;
    }

    current += character;
  }

  const trimmed = current.trim();
  if (trimmed) segments.push(trimmed);
  return segments;
};

const unquoteHeaderValue = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length < 2 || !trimmed.startsWith("\"") || !trimmed.endsWith("\"")) {
    return trimmed;
  }

  let output = "";
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const character = trimmed[index];
    if (character === "\\" && index + 1 < trimmed.length - 1) {
      index += 1;
      output += trimmed[index];
      continue;
    }
    output += character;
  }

  return output;
};

const parseNumericHeaderValue = (value: string): number | null => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseXRuntimeHeader = (value: string | null | undefined): number | null => {
  const input = value?.trim();
  if (!input) return null;

  const lower = input.toLowerCase();
  const numericValue = lower.endsWith("ms") ? input.slice(0, -2) : lower.endsWith("s") ? input.slice(0, -1) : input;
  const parsed = parseNumericHeaderValue(numericValue);
  if (parsed === null) return null;

  if (lower.endsWith("ms")) {
    return parsed;
  }

  if (lower.endsWith("s") || input.includes(".")) {
    return parsed * 1000;
  }

  return parsed;
};

export const parseServerTimingHeader = (value: string | null | undefined): ServerTimingEntry[] | null => {
  const input = value?.trim();
  if (!input) return null;

  const entries = splitHeaderSegments(input, ",")
    .map((segment) => {
      const parts = splitHeaderSegments(segment, ";");
      const [rawName, ...rawParams] = parts;
      const name = rawName?.trim();
      if (!name) return null;

      const parameters: Record<string, string | number | boolean> = {};
      let description: string | null = null;
      let durationMs: number | null = null;

      for (const rawParam of rawParams) {
        const separatorIndex = rawParam.indexOf("=");
        if (separatorIndex === -1) {
          parameters[rawParam.trim()] = true;
          continue;
        }

        const key = rawParam.slice(0, separatorIndex).trim();
        const rawValue = rawParam.slice(separatorIndex + 1).trim();
        if (!key) continue;

        const valueText = rawValue.startsWith("\"") ? unquoteHeaderValue(rawValue) : rawValue;
        const numericValue = parseNumericHeaderValue(valueText);

        if (key === "desc") {
          description = valueText;
          parameters[key] = valueText;
          continue;
        }

        if (key === "dur") {
          durationMs = numericValue;
          parameters[key] = numericValue ?? valueText;
          continue;
        }

        parameters[key] = numericValue ?? valueText;
      }

      return { name, description, durationMs, parameters };
    })
    .filter((entry): entry is ServerTimingEntry => entry !== null);

  return entries.length > 0 ? entries : null;
};

export const resolveXRuntimeMs = (
  xRuntimeHeader: string | null | undefined,
  serverTiming: ServerTimingEntry[] | null | undefined,
): number | null => {
  const xRuntimeMs = parseXRuntimeHeader(xRuntimeHeader);
  if (xRuntimeMs !== null) {
    return xRuntimeMs;
  }

  if (!serverTiming || serverTiming.length === 0) {
    return null;
  }

  const totalEntry = serverTiming.find((entry) => entry.name === "total" && entry.durationMs !== null);
  if (totalEntry) {
    return totalEntry.durationMs;
  }

  if (serverTiming.length === 1 && serverTiming[0].durationMs !== null) {
    return serverTiming[0].durationMs;
  }

  return null;
};
