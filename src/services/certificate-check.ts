import { getContainer } from "@cloudflare/containers";
import { isCertificateExpiringSoon, type CheckRow, validateMonitorUrl } from "../lib/checks";
import { fetchCertificateSnapshot, snapshotToCheckFields, type CertProbeResponse } from "../lib/cert-probe";

export const CERT_EXPIRY_THRESHOLD_DAYS = 30;

export const probeCertificateSnapshot = async (env: Env, check: CheckRow): Promise<CertProbeResponse | null> => {
  const parsed = new URL(check.url);
  if (parsed.protocol !== "https:") return null;

  const port = parsed.port ? Number(parsed.port) : 443;
  const serverName = parsed.hostname;
  const containerBinding = env.CertProbeContainer;
  if (!containerBinding) return null;

  const container = getContainer(containerBinding);
  return fetchCertificateSnapshot(container, parsed.hostname, port, serverName);
};

export const refreshCertificateSnapshot = async (
  env: Env,
  check: CheckRow,
): Promise<{ ok: true; checkedAt: string; snapshot: CertProbeResponse } | { ok: false; status: number; error: string }> => {
  const validation = validateMonitorUrl(check.url);
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error };
  }
  if (validation.url.protocol !== "https:") {
    return { ok: false, status: 400, error: "証明書の再確認は https の監視対象のみ対応しています" };
  }

  let snapshot: CertProbeResponse | null;
  try {
    snapshot = await probeCertificateSnapshot(env, check);
  } catch (error) {
    console.warn(JSON.stringify({
      message: "certificate recheck probe failed",
      checkId: check.id,
      url: check.url,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { ok: false, status: 503, error: "証明書再確認の実行基盤の起動に失敗しました" };
  }
  if (!snapshot) {
    return { ok: false, status: 503, error: "証明書再確認の実行基盤が利用できません" };
  }

  const checkedAt = new Date().toISOString();
  const fields = snapshotToCheckFields(snapshot, checkedAt);
  await env["pulse-db"]
    .prepare(
      `
      UPDATE checks
      SET tls_last_checked_at = ?,
          tls_last_error = ?,
          tls_subject = COALESCE(?, tls_subject),
          tls_issuer = COALESCE(?, tls_issuer),
          tls_public_key_class = COALESCE(?, tls_public_key_class),
          tls_valid_from = COALESCE(?, tls_valid_from),
          tls_valid_to = COALESCE(?, tls_valid_to),
          tls_days_remaining = COALESCE(?, tls_days_remaining),
          tls_dns_names = COALESCE(?, tls_dns_names),
          updated_at = ?
      WHERE id = ?
    `,
    )
    .bind(
      fields.tls_last_checked_at,
      fields.tls_last_error,
      fields.tls_subject,
      fields.tls_issuer,
      fields.tls_public_key_class,
      fields.tls_valid_from,
      fields.tls_valid_to,
      fields.tls_days_remaining,
      fields.tls_dns_names,
      checkedAt,
      check.id,
    )
    .run();

  return { ok: true, checkedAt, snapshot };
};

export const describeCertificateAlert = (certificate: CertProbeResponse): { reason: string; error: string } | null => {
  if (certificate.daysRemaining === null) return null;
  if (certificate.daysRemaining < 0) {
    return {
      reason: "tls_expired",
      error: `certificate expired ${Math.abs(certificate.daysRemaining)} day${Math.abs(certificate.daysRemaining) === 1 ? "" : "s"} ago`,
    };
  }
  if (isCertificateExpiringSoon(certificate.daysRemaining, CERT_EXPIRY_THRESHOLD_DAYS)) {
    return {
      reason: "tls_expiring_soon",
      error: `certificate expires in ${certificate.daysRemaining} day${certificate.daysRemaining === 1 ? "" : "s"}`,
    };
  }
  return null;
};
