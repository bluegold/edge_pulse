import { getContainer } from "@cloudflare/containers";
import type { Bindings } from "../lib/bindings";
import { isCertificateExpiringSoon, type CheckRow } from "../lib/checks";
import { fetchCertificateSnapshot, type CertProbeResponse } from "../lib/cert-probe";

export const CERT_EXPIRY_THRESHOLD_DAYS = 30;

export const probeCertificateSnapshot = async (env: Bindings, check: CheckRow): Promise<CertProbeResponse | null> => {
  const parsed = new URL(check.url);
  if (parsed.protocol !== "https:") return null;

  const port = parsed.port ? Number(parsed.port) : 443;
  const serverName = parsed.hostname;
  const containerBinding = env.CertProbeContainer ?? env.CERT_PROBE_CONTAINER;
  if (!containerBinding) return null;

  const container = getContainer(containerBinding);
  return fetchCertificateSnapshot(container, parsed.hostname, port, serverName);
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

