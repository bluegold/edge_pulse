import ipaddr from "ipaddr.js";
import type { CheckInput } from "./types";

const TLS_ERROR_PATTERNS = [
  /certificate/i,
  /tls/i,
  /ssl/i,
  /x509/i,
  /handshake/i,
  /expired/i,
  /cert/i,
];

const DNS_ERROR_PATTERNS = [/dns/i, /nxdomain/i, /getaddrinfo/i, /enotfound/i, /eai_again/i];

const TIMEOUT_ERROR_PATTERNS = [/timeout/i, /timed out/i, /aborted/i, /abort/i];

const isSpecialUseHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  const withoutTrailingDot = normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
  const stripped =
    withoutTrailingDot.startsWith("[") && withoutTrailingDot.endsWith("]")
      ? withoutTrailingDot.slice(1, -1)
      : withoutTrailingDot;

  if (stripped === "localhost" || stripped.endsWith(".localhost")) {
    return true;
  }

  if (!ipaddr.isValid(stripped)) {
    return false;
  }

  const parsed = ipaddr.parse(stripped);
  if (parsed.kind() === "ipv4") {
    return parsed.range() !== "unicast";
  }

  const ipv6 = parsed as ipaddr.IPv6;
  if (ipv6.range() === "ipv4Mapped") {
    return ipv6.toIPv4Address().range() !== "unicast";
  }

  return ipv6.range() !== "unicast";
};

export const classifyCheckFailureReason = (statusCode: number | null, error: string | null): string => {
  if (statusCode === 526) return "tls_error";

  const message = `${statusCode ?? ""} ${error ?? ""}`;
  if (TLS_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return "tls_error";
  if (TIMEOUT_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return "timeout";
  if (DNS_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return "dns_error";
  return "fetch_error";
};

const normalizeHostname = (hostname: string): string => {
  const trimmed = hostname.trim().toLowerCase();
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
};

export const validateMonitorUrl = (
  input: string,
): { ok: true; url: URL } | { ok: false; error: string } => {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: "URL の形式が不正です" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "http: / https: のみ許可されています" };
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    return { ok: false, error: "ホスト名が空です" };
  }

  // これは URL 文字列ベースの検証であり、DNS rebinding を完全には防げません。
  if (isSpecialUseHost(hostname)) {
    return { ok: false, error: "special-use address は許可されていません" };
  }

  return { ok: true, url };
};

export const validateCheckInput = (input: CheckInput): { ok: true } | { ok: false; error: string } => {
  if (!input.name.trim()) return { ok: false, error: "名称を入力してください" };
  const urlValidation = validateMonitorUrl(input.url);
  if (!urlValidation.ok) return urlValidation;
  if (input.expectedStatusMin > input.expectedStatusMax) {
    return { ok: false, error: "期待ステータス範囲が不正です" };
  }
  if (input.timeoutMs < 1000 || input.timeoutMs > 120000) {
    return { ok: false, error: "timeout は 1000〜120000ms で設定してください" };
  }
  if (input.intervalMinutes < 1 || input.intervalMinutes > 1440) {
    return { ok: false, error: "interval_minutes は 1〜1440 で設定してください" };
  }
  if (input.failThreshold < 1 || input.recoveryThreshold < 1) {
    return { ok: false, error: "threshold は 1 以上で設定してください" };
  }
  return { ok: true };
};
