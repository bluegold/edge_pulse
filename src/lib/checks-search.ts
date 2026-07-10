import { calculateCertificateDaysRemaining, type CheckRow } from "./checks";
import { toErrorMessage } from "./error-message";

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
  order: string;
};

export type BuildChecksUrlParams = {
  page?: number | null;
  edit?: number | null;
  focus?: number | null;
  q?: string | null;
  filter?: string | null;
  order?: string | null;
};

export type CheckOrderDirection = "asc" | "desc";

export type CheckOrderTerm = {
  key: "checked_at" | "certificate_remain" | "name";
  direction: CheckOrderDirection;
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

const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, "\\$&");

const CHECK_SEARCH_TEXT_COLUMNS = [
  "name",
  "url",
  "method",
  "last_state",
  "last_error",
  "CAST(last_status_code AS TEXT)",
  "CAST(last_latency_ms AS TEXT)",
  "CAST(interval_minutes AS TEXT)",
  "CAST(fail_threshold AS TEXT)",
  "CAST(recovery_threshold AS TEXT)",
] as const;

const CERTIFICATE_DAYS_REMAINING_SQL = "CAST((julianday(c.tls_valid_to) - julianday('now')) AS INTEGER)";

const CHECK_FILTER_FIELD_SPECS: Record<
  string,
  {
    expression: string;
    kind: "text" | "numeric" | "boolean";
  }
> = {
  id: { expression: "c.id", kind: "numeric" },
  name: { expression: "c.name", kind: "text" },
  url: { expression: "c.url", kind: "text" },
  method: { expression: "c.method", kind: "text" },
  enabled: { expression: "c.enabled", kind: "boolean" },
  last_state: { expression: "c.last_state", kind: "text" },
  last_status_code: { expression: "c.last_status_code", kind: "numeric" },
  last_latency_ms: { expression: "c.last_latency_ms", kind: "numeric" },
  last_error: { expression: "c.last_error", kind: "text" },
  interval_minutes: { expression: "c.interval_minutes", kind: "numeric" },
  fail_threshold: { expression: "c.fail_threshold", kind: "numeric" },
  recovery_threshold: { expression: "c.recovery_threshold", kind: "numeric" },
  consecutive_failures: { expression: "c.consecutive_failures", kind: "numeric" },
  consecutive_successes: { expression: "c.consecutive_successes", kind: "numeric" },
  first_failure_at: { expression: "c.first_failure_at", kind: "text" },
  first_success_at: { expression: "c.first_success_at", kind: "text" },
  tls_last_error: { expression: "c.tls_last_error", kind: "text" },
  tls_days_remaining: { expression: CERTIFICATE_DAYS_REMAINING_SQL, kind: "numeric" },
  tls_valid_to: { expression: "c.tls_valid_to", kind: "text" },
  cert_expiring_soon: {
    expression: `(CASE WHEN c.tls_valid_to IS NOT NULL AND ${CERTIFICATE_DAYS_REMAINING_SQL} <= 30 THEN 1 ELSE 0 END)`,
    kind: "boolean",
  },
  recent_incident_24h: {
    expression: "(CASE WHEN EXISTS (SELECT 1 FROM incidents i WHERE i.check_id = c.id AND i.started_at >= ?) THEN 1 ELSE 0 END)",
    kind: "boolean",
  },
  created_at: { expression: "c.created_at", kind: "text" },
  updated_at: { expression: "c.updated_at", kind: "text" },
  maintenance_enabled: { expression: "COALESCE(c.maintenance_enabled, 0)", kind: "boolean" },
};

const CHECK_ORDER_COLUMNS: Record<CheckOrderTerm["key"], string> = {
  checked_at: "c.last_checked_at",
  certificate_remain: "c.tls_valid_to",
  name: "c.name",
};

const CHECK_ORDER_ALIASES: Record<string, CheckOrderTerm["key"]> = {
  checked_at: "checked_at",
  last_checked_at: "checked_at",
  certificate_remain: "certificate_remain",
  certificate_remaining: "certificate_remain",
  tls_days_remaining: "certificate_remain",
  name: "name",
};

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

const buildCheckSearchTextClause = (q: string): { sql: string; params: unknown[] } => {
  const terms = q
    .trim()
    .split(/\s+/u)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length === 0) {
    return { sql: "", params: [] };
  }

  const columnSql = CHECK_SEARCH_TEXT_COLUMNS.map((column) => `LOWER(COALESCE(${column}, '')) LIKE ? ESCAPE '\\'`).join(" OR ");
  const sql = terms.map(() => `(${columnSql})`).join(" AND ");
  const params = terms.flatMap((term) => {
    const escaped = `%${escapeLikePattern(term.toLowerCase())}%`;
    return CHECK_SEARCH_TEXT_COLUMNS.map(() => escaped);
  });
  return { sql, params };
};

const buildCheckFilterItemClause = (node: Extract<CheckSearchFilterNode, { kind: "item" }>, recentIncidentAt: string): { sql: string; params: unknown[] } => {
  if (node.attr === "recent_incident_24h") {
    const existsSql = "EXISTS (SELECT 1 FROM incidents i WHERE i.check_id = c.id AND i.started_at >= ?)";
    if (node.op === "=") {
      if (node.value === "*") {
        return { sql: `COALESCE(CAST(${existsSql} AS TEXT), '') <> ''`, params: [recentIncidentAt] };
      }

      return {
        sql: `CAST(CASE WHEN ${existsSql} THEN 1 ELSE 0 END AS NUMERIC) = CAST(? AS NUMERIC)`,
        params: [recentIncidentAt, node.value],
      };
    }

    return {
      sql: `CAST(CASE WHEN ${existsSql} THEN 1 ELSE 0 END AS NUMERIC) ${node.op} CAST(? AS NUMERIC)`,
      params: [recentIncidentAt, node.value],
    };
  }

  const spec = CHECK_FILTER_FIELD_SPECS[node.attr];
  if (!spec) {
    return { sql: "0", params: [] };
  }

  const comparisonValue = node.value;
  const expression = spec.expression;

  if (node.op === "=") {
    if (comparisonValue === "*") {
      return { sql: `COALESCE(CAST(${expression} AS TEXT), '') <> ''`, params: [] };
    }

    if (comparisonValue.includes("*")) {
      const escaped = escapeLikePattern(comparisonValue.toLowerCase()).replaceAll("*", "%");
      return {
        sql: `LOWER(COALESCE(CAST(${expression} AS TEXT), '')) LIKE ? ESCAPE '\\'`,
        params: [escaped],
      };
    }

    if (spec.kind === "numeric" || spec.kind === "boolean") {
      return {
        sql: `CAST(${expression} AS NUMERIC) = CAST(? AS NUMERIC)`,
        params: [comparisonValue],
      };
    }

    return {
      sql: `LOWER(COALESCE(CAST(${expression} AS TEXT), '')) = LOWER(?)`,
      params: [comparisonValue],
    };
  }

  if (spec.kind === "numeric" || spec.kind === "boolean") {
    return {
      sql: `CAST(${expression} AS NUMERIC) ${node.op} CAST(? AS NUMERIC)`,
      params: [comparisonValue],
    };
  }

  return {
    sql: `LOWER(COALESCE(CAST(${expression} AS TEXT), '')) ${node.op} LOWER(?)`,
    params: [comparisonValue],
  };
};

const buildCheckFilterClause = (
  node: CheckSearchFilterNode,
  recentIncidentAt: string,
): { sql: string; params: unknown[] } => {
  switch (node.kind) {
    case "item":
      return buildCheckFilterItemClause(node, recentIncidentAt);
    case "and": {
      const children = node.children.map((child) => buildCheckFilterClause(child, recentIncidentAt));
      return {
        sql: `(${children.map((child) => child.sql).join(" AND ")})`,
        params: children.flatMap((child) => child.params),
      };
    }
    case "or": {
      const children = node.children.map((child) => buildCheckFilterClause(child, recentIncidentAt));
      return {
        sql: `(${children.map((child) => child.sql).join(" OR ")})`,
        params: children.flatMap((child) => child.params),
      };
    }
    case "not": {
      const child = buildCheckFilterClause(node.child, recentIncidentAt);
      return {
        sql: `(NOT ${child.sql})`,
        params: child.params,
      };
    }
  }
};

export const buildChecksSearchWhereClause = (
  q: string,
  filter: string,
  recentIncidentAt: string,
): { sql: string; params: unknown[]; searchError: string | null } => {
  const parts: string[] = [];
  const params: unknown[] = [];

  const textClause = buildCheckSearchTextClause(q);
  if (textClause.sql) {
    parts.push(`(${textClause.sql})`);
    params.push(...textClause.params);
  }

  const normalizedFilter = filter.trim();
  if (normalizedFilter) {
    try {
      const filterAst = new FilterParser(normalizedFilter).parse();
      const filterClause = buildCheckFilterClause(filterAst, recentIncidentAt);
      parts.push(`(${filterClause.sql})`);
      params.push(...filterClause.params);
    } catch (error) {
      return {
        sql: "0",
        params: [],
        searchError: error instanceof Error ? toErrorMessage(error) : "filter の形式が不正です",
      };
    }
  }

  return {
    sql: parts.join(" AND "),
    params,
    searchError: null,
  };
};

export const parseCheckOrder = (input: string): CheckOrderTerm[] => {
  return input
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .flatMap((token) => {
      const direction: CheckOrderDirection = token.startsWith("-") ? "desc" : "asc";
      const key = CHECK_ORDER_ALIASES[token.startsWith("-") ? token.slice(1) : token];
      if (!key) {
        return [];
      }

      return [{ key, direction }];
    });
};

export const getCheckOrderDirection = (order: string, key: CheckOrderTerm["key"]): CheckOrderDirection | null => {
  return parseCheckOrder(order).find((term) => term.key === key)?.direction ?? null;
};

export const buildCheckOrderWithTerm = (
  order: string,
  key: CheckOrderTerm["key"],
  direction: CheckOrderDirection | null,
): string => {
  const terms = parseCheckOrder(order).filter((term) => term.key !== key);
  if (direction) {
    terms.unshift({ key, direction });
  }

  return terms.map((term) => (term.direction === "desc" ? `-${term.key}` : term.key)).join(",");
};

export const buildCheckOrderByClause = (order: string): string => {
  const parsed = parseCheckOrder(order);
  if (parsed.length === 0) {
    return "c.name ASC NULLS LAST, c.id DESC";
  }

  const fragments = parsed.flatMap(({ key, direction }) => {
    const column = CHECK_ORDER_COLUMNS[key];
    return [`${column} ${direction.toUpperCase()} NULLS LAST`];
  });

  return `${fragments.join(", ")}, c.id DESC`;
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
  order,
}: BuildChecksUrlParams): string => {
  const params = new URLSearchParams();
  if (page !== undefined && page !== null) params.set("page", String(page));
  if (edit !== undefined && edit !== null) params.set("edit", String(edit));
  if (focus !== undefined && focus !== null) params.set("focus", String(focus));
  if (q !== undefined && q !== null && q !== "") params.set("q", q);
  if (filter !== undefined && filter !== null && filter !== "") params.set("filter", filter);
  if (order !== undefined && order !== null && order !== "") params.set("order", order);

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
  maintenance_enabled: check.maintenance_enabled ?? null,
  tls_last_error: check.tls_last_error ?? null,
  tls_days_remaining: check.tls_days_remaining ?? null,
  tls_valid_to: check.tls_valid_to ?? null,
  cert_expiring_soon: (() => {
    const daysRemaining = calculateCertificateDaysRemaining(check.tls_valid_to);
    return daysRemaining !== null && daysRemaining <= 30;
  })(),
  recent_incident_24h: recentIncident24h,
  created_at: check.created_at,
  updated_at: check.updated_at,
});
