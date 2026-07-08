import type { CheckRow } from "./checks";

export type CertProbeResponse = {
  host: string;
  port: number;
  serverName: string;
  subject: string | null;
  issuer: string | null;
  class: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  dnsNames: string[] | null;
  error: string | null;
};

type CertProbeApiResponse = {
  host?: string;
  port?: number;
  servername?: string;
  subject?: string;
  issuer?: string;
  class?: string;
  valid_from?: string;
  valid_to?: string;
  days_remaining?: number;
  dns_names?: string[];
  error?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_REFRESH_MS = DAY_MS;
const WEEKLY_REFRESH_MS = 7 * DAY_MS;

const addMilliseconds = (iso: string, ms: number): string | null => {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return new Date(time + ms).toISOString();
};

export const buildCertProbeUrl = (host: string, port: number, serverName: string): URL => {
  const url = new URL("http://cert-probe/probe");
  url.searchParams.set("host", host);
  url.searchParams.set("port", String(port));
  url.searchParams.set("servername", serverName);
  return url;
};

export const shouldProbeCertificateSnapshot = (
  check: Pick<CheckRow, "last_state" | "tls_last_checked_at" | "tls_last_error" | "tls_days_remaining">,
  checkedAt: string,
  latestRecoveryAt: string | null = null,
): boolean => {
  if (check.tls_last_error) {
    if (check.last_state !== "ok" || !latestRecoveryAt) {
      return false;
    }

    const recoveryAt = Date.parse(latestRecoveryAt);
    const lastCheckedAt = check.tls_last_checked_at ? Date.parse(check.tls_last_checked_at) : Number.NaN;
    const now = Date.parse(checkedAt);
    if (!Number.isFinite(recoveryAt) || !Number.isFinite(now)) return false;
    if (check.tls_last_checked_at && Number.isFinite(lastCheckedAt) && recoveryAt <= lastCheckedAt) {
      return false;
    }
    if (recoveryAt > now) return false;
    return true;
  }

  if (!check.tls_last_checked_at) return true;

  const lastCheckedAt = Date.parse(check.tls_last_checked_at);
  const now = Date.parse(checkedAt);
  if (!Number.isFinite(lastCheckedAt) || !Number.isFinite(now)) return true;

  const elapsed = now - lastCheckedAt;
  if (elapsed < 0) return true;

  const daysRemaining = check.tls_days_remaining ?? Number.POSITIVE_INFINITY;
  if (daysRemaining <= 30) {
    return elapsed >= DAILY_REFRESH_MS;
  }

  return elapsed >= WEEKLY_REFRESH_MS;
};

export const calculateNextCertificateProbeAt = (
  check: Pick<
    CheckRow,
    "enabled" | "interval_minutes" | "next_check_at" | "last_state" | "tls_last_checked_at" | "tls_last_error" | "tls_days_remaining"
  >,
  latestRecoveryAt: string | null = null,
): string | null => {
  if (!check.enabled || !check.next_check_at) return null;

  let eligibleAt: string | null = null;

  if (check.tls_last_error) {
    if (check.last_state !== "ok" || !latestRecoveryAt) {
      return null;
    }

    const recoveryAt = Date.parse(latestRecoveryAt);
    const lastCheckedAt = check.tls_last_checked_at ? Date.parse(check.tls_last_checked_at) : Number.NaN;
    if (!Number.isFinite(recoveryAt)) return null;
    if (check.tls_last_checked_at && Number.isFinite(lastCheckedAt) && recoveryAt <= lastCheckedAt) {
      return null;
    }

    eligibleAt = latestRecoveryAt;
  } else if (!check.tls_last_checked_at) {
    eligibleAt = check.next_check_at;
  } else {
    const refreshMs = (check.tls_days_remaining ?? Number.POSITIVE_INFINITY) <= 30 ? DAILY_REFRESH_MS : WEEKLY_REFRESH_MS;
    eligibleAt = addMilliseconds(check.tls_last_checked_at, refreshMs);
  }

  if (!eligibleAt) return null;

  const nextCheckAtMs = Date.parse(check.next_check_at);
  const eligibleAtMs = Date.parse(eligibleAt);
  if (!Number.isFinite(nextCheckAtMs) || !Number.isFinite(eligibleAtMs)) return null;
  if (nextCheckAtMs >= eligibleAtMs) return check.next_check_at;

  const intervalMs = check.interval_minutes * 60_000;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;

  const intervalsNeeded = Math.ceil((eligibleAtMs - nextCheckAtMs) / intervalMs);
  return new Date(nextCheckAtMs + intervalsNeeded * intervalMs).toISOString();
};

export const fetchCertificateSnapshot = async (
  fetcher: Pick<typeof globalThis, "fetch">,
  host: string,
  port: number,
  serverName: string,
  timeoutMs = 8_000,
): Promise<CertProbeResponse> => {
  try {
    const url = buildCertProbeUrl(host, port, serverName);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("cert_probe_timeout"), timeoutMs);

    try {
      const response = await fetcher.fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
        },
        signal: controller.signal,
      });

      const payload = (await response.json()) as CertProbeApiResponse;
      return {
        host: payload.host ?? host,
        port: payload.port ?? port,
        serverName: payload.servername ?? serverName,
        subject: payload.subject ?? null,
        issuer: payload.issuer ?? null,
        class: payload.class ?? null,
        validFrom: payload.valid_from ?? null,
        validTo: payload.valid_to ?? null,
        daysRemaining: typeof payload.days_remaining === "number" ? payload.days_remaining : null,
        dnsNames: Array.isArray(payload.dns_names) ? payload.dns_names : null,
        error: payload.error ?? (response.ok ? null : `cert probe failed with ${response.status}`),
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (cause) {
    return {
      host,
      port,
      serverName,
      subject: null,
      issuer: null,
      class: null,
      validFrom: null,
      validTo: null,
      daysRemaining: null,
      dnsNames: null,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
};

export const snapshotToCheckFields = (
  snapshot: CertProbeResponse,
  checkedAt: string,
): Record<string, string | number | null> => ({
  tls_last_checked_at: checkedAt,
  tls_last_error: snapshot.error,
  tls_subject: snapshot.subject,
  tls_issuer: snapshot.issuer,
  tls_public_key_class: snapshot.class,
  tls_valid_from: snapshot.validFrom,
  tls_valid_to: snapshot.validTo,
  tls_days_remaining: snapshot.daysRemaining,
  tls_dns_names: snapshot.dnsNames ? JSON.stringify(snapshot.dnsNames) : null,
});
