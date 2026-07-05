import { parseArgs } from "node:util";

const USAGE = `pulse

Usage:
  pulse list [--q <query>] [--filter <filter>]
  pulse show <id>
  pulse add --name <name> --url <url> [options]
  pulse update <id> [options]
  pulse alert [--title <title>] [--message <message>] [--severity good|danger]

Common options:
  --base-url <url>   default: PULSE_BASE_URL or http://127.0.0.1:8787
  --token <token>    default: PULSE_API_TOKEN or ADMIN_API_TOKEN

Add/update options:
  --method <GET|HEAD>               default: GET
  --enabled <true|false|1|0>        default: true
  --expected-status-min <number>    default: 200
  --expected-status-max <number>    default: 399
  --timeout-ms <number>             default: 10000
  --interval-minutes <number>       default: 5
  --fail-threshold <number>         default: 2
  --recovery-threshold <number>     default: 1
`;

const parseBoolean = (value, fallback) => {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return fallback;
};

const parseNumber = (value, fallback) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("id は正の整数で指定してください");
  }
  return parsed;
};

const getBaseUrl = (value) => new URL(value ?? process.env.PULSE_BASE_URL ?? "http://127.0.0.1:8787");
const getToken = (value) => value ?? process.env.PULSE_API_TOKEN ?? process.env.ADMIN_API_TOKEN ?? "";

const requestJson = async (baseUrl, token, path, init = {}) => {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? body.error : text || response.statusText;
    throw new Error(`${response.status} ${message}`);
  }

  return body;
};

const printJson = (value) => {
  console.log(JSON.stringify(value, null, 2));
};

const printChecks = (payload) => {
  const checks = Array.isArray(payload?.checks) ? payload.checks : [];
  if (checks.length === 0) {
    console.log("no checks");
    return;
  }

  const rows = checks.map((check) => ({
    id: check.id,
    name: check.name,
    state: check.last_state,
    enabled: check.enabled ? "on" : "off",
    url: check.url,
  }));
  console.table(rows);
};

const main = async () => {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "-h" || command === "--help") {
    console.log(USAGE);
    return;
  }

  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      "base-url": { type: "string" },
      token: { type: "string" },
      q: { type: "string" },
      filter: { type: "string" },
      name: { type: "string" },
      url: { type: "string" },
      method: { type: "string" },
      enabled: { type: "string" },
      "expected-status-min": { type: "string" },
      "expected-status-max": { type: "string" },
      "timeout-ms": { type: "string" },
      "interval-minutes": { type: "string" },
      "fail-threshold": { type: "string" },
      "recovery-threshold": { type: "string" },
      title: { type: "string" },
      message: { type: "string" },
      severity: { type: "string" },
    },
  });

  const baseUrl = getBaseUrl(values["base-url"]);
  const token = getToken(values.token);
  if (!token) {
    throw new Error("API token がありません。PULSE_API_TOKEN か ADMIN_API_TOKEN を設定してください");
  }

  try {
    if (command === "list") {
      const url = new URL("/api/checks", baseUrl);
      if (values.q) url.searchParams.set("q", values.q);
      if (values.filter) url.searchParams.set("filter", values.filter);
      const payload = await requestJson(baseUrl, token, `${url.pathname}${url.search}`);
      printChecks(payload);
      return;
    }

    if (command === "show") {
      const id = parseId(positionals[0] ?? values.id);
      const payload = await requestJson(baseUrl, token, `/api/checks/${id}`);
      printJson(payload);
      return;
    }

    if (command === "add" || command === "update") {
      const id = command === "update" ? parseId(positionals[0] ?? values.id) : null;
      const name = values.name ?? "";
      const url = values.url ?? "";

      if (command === "add" && (!name || !url)) {
        throw new Error("add には --name と --url が必要です");
      }

      const payload = {
        name,
        url,
        method: (values.method ?? "GET").toUpperCase(),
        enabled: parseBoolean(values.enabled, true),
        expected_status_min: parseNumber(values["expected-status-min"], 200),
        expected_status_max: parseNumber(values["expected-status-max"], 399),
        timeout_ms: parseNumber(values["timeout-ms"], 10_000),
        interval_minutes: parseNumber(values["interval-minutes"], 5),
        fail_threshold: parseNumber(values["fail-threshold"], 2),
        recovery_threshold: parseNumber(values["recovery-threshold"], 1),
      };

      const response = await requestJson(
        baseUrl,
        token,
        command === "add" ? "/api/checks" : `/api/checks/${id}`,
        {
          method: command === "add" ? "POST" : "PATCH",
          body: JSON.stringify(payload),
        },
      );
      printJson(response);
      return;
    }

    if (command === "alert") {
      const payload = {
        title: values.title ?? "通知テスト",
        message: values.message ?? "edge-pulse notification test",
        severity: values.severity === "danger" ? "danger" : "good",
      };
      const response = await requestJson(baseUrl, token, "/api/notifications/test", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      printJson(response);
      return;
    }

    throw new Error(`unknown command: ${command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
};

await main();
