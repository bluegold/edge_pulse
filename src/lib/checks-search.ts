import type { CheckRow } from "./checks";

export type CheckSearchFilterNode =
  | {
      kind: "item";
      attr: string;
      op: "=" | ">=" | "<=";
      value: string;
    }
  | {
      kind: "and";
      children: CheckSearchFilterNode[];
    }
  | {
      kind: "or";
      children: CheckSearchFilterNode[];
    }
  | {
      kind: "not";
      child: CheckSearchFilterNode;
    };

export type CheckSearchAttributes = Record<string, string | number | boolean | null | undefined>;

export type CheckSearchQuery = {
  q: string;
  filter: string;
};

export type BuildChecksUrlParams = {
  page?: number | null;
  edit?: number | null;
  focus?: number | null;
  q?: string | null;
  filter?: string | null;
};

const textToComparable = (value: string): string => value.trim().toLowerCase();

const stringifyAttributeValue = (value: string | number | boolean | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
};

const normalizeComparableValue = (value: string): string => textToComparable(value);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isHexDigit = (value: string): boolean => /^[0-9a-fA-F]$/.test(value);

class FilterParser {
  private index = 0;

  constructor(private readonly input: string) {}

  parse(): CheckSearchFilterNode {
    this.skipWhitespace();
    const node = this.parseGroup();
    this.skipWhitespace();
    if (!this.isEnd()) {
      throw new Error("filter の形式が不正です");
    }
    return node;
  }

  private parseGroup(): CheckSearchFilterNode {
    this.expect("(");
    this.skipWhitespace();

    const operator = this.peek();
    if (operator === "&" || operator === "|") {
      this.index += 1;
      const children: CheckSearchFilterNode[] = [];
      while (true) {
        this.skipWhitespace();
        if (this.peek() === ")") break;
        children.push(this.parseGroup());
      }
      if (children.length === 0) {
        throw new Error("filter の形式が不正です");
      }
      this.expect(")");
      return operator === "&" ? { kind: "and", children } : { kind: "or", children };
    }

    if (operator === "!") {
      this.index += 1;
      this.skipWhitespace();
      const child = this.parseGroup();
      this.skipWhitespace();
      this.expect(")");
      return { kind: "not", child };
    }

    const attr = this.readAttribute();
    const op = this.readOperator();
    if (op === "~=") {
      throw new Error("approx 演算子 (~=) は未対応です");
    }

    const value = this.readValue();
    this.expect(")");
    return { kind: "item", attr, op, value };
  }

  private readAttribute(): string {
    const start = this.index;
    while (!this.isEnd()) {
      const character = this.peek();
      if (character === "=" || character === ">" || character === "<" || character === "~" || character === ")") {
        break;
      }
      this.index += 1;
    }

    const value = this.input.slice(start, this.index).trim();
    if (!value) {
      throw new Error("filter の形式が不正です");
    }

    return value;
  }

  private readOperator(): "=" | ">=" | "<=" {
    const character = this.peek();
    if (character === "=") {
      this.index += 1;
      return "=";
    }
    if (character === ">" && this.peek(1) === "=") {
      this.index += 2;
      return ">=";
    }
    if (character === "<" && this.peek(1) === "=") {
      this.index += 2;
      return "<=";
    }
    if (character === "~" && this.peek(1) === "=") {
      throw new Error("approx 演算子 (~=) は未対応です");
    }

    throw new Error("filter の形式が不正です");
  }

  private readValue(): string {
    let output = "";
    while (!this.isEnd()) {
      const character = this.peek();
      if (character === ")") break;
      if (character === "\\") {
        this.index += 1;
        if (this.isEnd()) {
          throw new Error("filter の形式が不正です");
        }

        const first = this.peek();
        const second = this.peek(1);
        if (first && second && isHexDigit(first) && isHexDigit(second)) {
          output += String.fromCharCode(Number.parseInt(`${first}${second}`, 16));
          this.index += 2;
          continue;
        }

        output += first;
        this.index += 1;
        continue;
      }

      output += character;
      this.index += 1;
    }

    return output;
  }

  private skipWhitespace(): void {
    while (!this.isEnd() && /\s/u.test(this.peek())) {
      this.index += 1;
    }
  }

  private expect(character: string): void {
    if (this.peek() !== character) {
      throw new Error("filter の形式が不正です");
    }
    this.index += 1;
  }

  private peek(offset = 0): string {
    return this.input[this.index + offset] ?? "";
  }

  private isEnd(): boolean {
    return this.index >= this.input.length;
  }
}

const compareComparableValues = (left: string, right: string): number => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return normalizeComparableValue(left).localeCompare(normalizeComparableValue(right));
};

const attributeMatches = (
  attributeValue: string | number | boolean | null | undefined,
  op: "=" | ">=" | "<=",
  expectedValue: string,
): boolean => {
  const actualValue = stringifyAttributeValue(attributeValue);
  if (actualValue === null) return false;

  if (op === "=") {
    if (expectedValue === "*") {
      return actualValue.length > 0;
    }

    if (expectedValue.includes("*")) {
      const pattern = `^${escapeRegExp(expectedValue).replaceAll("\\*", ".*")}$`;
      return new RegExp(pattern, "i").test(actualValue);
    }

    return normalizeComparableValue(actualValue) === normalizeComparableValue(expectedValue);
  }

  const comparison = compareComparableValues(actualValue, expectedValue);
  return op === ">=" ? comparison >= 0 : comparison <= 0;
};

export const parseCheckSearchFilter = (input: string): CheckSearchFilterNode | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return new FilterParser(trimmed).parse();
};

export const evaluateCheckSearchFilter = (node: CheckSearchFilterNode, attributes: CheckSearchAttributes): boolean => {
  switch (node.kind) {
    case "item":
      return attributeMatches(attributes[node.attr], node.op, node.value);
    case "and":
      return node.children.every((child) => evaluateCheckSearchFilter(child, attributes));
    case "or":
      return node.children.some((child) => evaluateCheckSearchFilter(child, attributes));
    case "not":
      return !evaluateCheckSearchFilter(node.child, attributes);
  }
};

export const matchesCheckTextQuery = (check: Pick<CheckRow, "name" | "url" | "method" | "last_state" | "last_error" | "last_status_code" | "last_latency_ms" | "interval_minutes" | "fail_threshold" | "recovery_threshold">, q: string): boolean => {
  const terms = q
    .trim()
    .split(/\s+/u)
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const haystack = [
    check.name,
    check.url,
    check.method,
    check.last_state,
    check.last_error,
    check.last_status_code === null ? null : String(check.last_status_code),
    check.last_latency_ms === null ? null : String(check.last_latency_ms),
    String(check.interval_minutes),
    String(check.fail_threshold),
    String(check.recovery_threshold),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
};

export const buildChecksUrl = ({
  page,
  edit,
  focus,
  q,
  filter,
}: BuildChecksUrlParams): string => {
  const params = new URLSearchParams();
  if (page !== undefined && page !== null) params.set("page", String(page));
  if (edit !== undefined && edit !== null) params.set("edit", String(edit));
  if (focus !== undefined && focus !== null) params.set("focus", String(focus));
  if (q !== undefined && q !== null && q !== "") params.set("q", q);
  if (filter !== undefined && filter !== null && filter !== "") params.set("filter", filter);

  const search = params.toString();
  return search ? `/checks?${search}` : "/checks";
};

export const buildCheckSearchAttributes = (
  check: CheckRow,
  recentIncident24h: boolean,
): CheckSearchAttributes => ({
  id: check.id,
  name: check.name,
  url: check.url,
  method: check.method,
  enabled: check.enabled,
  last_state: check.last_state,
  last_status_code: check.last_status_code,
  last_latency_ms: check.last_latency_ms,
  last_error: check.last_error,
  interval_minutes: check.interval_minutes,
  fail_threshold: check.fail_threshold,
  recovery_threshold: check.recovery_threshold,
  consecutive_failures: check.consecutive_failures,
  consecutive_successes: check.consecutive_successes,
  first_failure_at: check.first_failure_at,
  first_success_at: check.first_success_at,
  tls_last_error: check.tls_last_error ?? null,
  tls_days_remaining: check.tls_days_remaining ?? null,
  tls_valid_to: check.tls_valid_to ?? null,
  cert_expiring_soon: typeof check.tls_days_remaining === "number" && check.tls_days_remaining <= 30,
  recent_incident_24h: recentIncident24h,
  created_at: check.created_at,
  updated_at: check.updated_at,
});
