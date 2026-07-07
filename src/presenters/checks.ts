import type { CheckRow } from "../lib/checks";
import { calculateCertificateDaysRemaining, isMaintenanceWindowActive } from "../lib/checks";

export type CheckStateBadge = {
  label: string;
  className: string;
};

export type CertificateBadge = {
  label: string;
  className: string;
};

export type MaintenanceBadge = {
  label: string;
  className: string;
};

const formatCertificateDaysCompact = (daysRemaining: number | null | undefined): string => {
  if (daysRemaining === null || daysRemaining === undefined) return "-";
  return `${Math.abs(daysRemaining)}日`;
};

export const describeCheckState = (enabled: number, state: CheckRow["last_state"]): CheckStateBadge => {
  if (!enabled) return { label: "停止中", className: "status off" };
  if (state === "ok") return { label: "OK", className: "status ok" };
  if (state === "fail") return { label: "障害中", className: "status off status-fail" };
  return { label: "未確認", className: "status off" };
};

export const describeCertificateBadge = (
  check: Pick<CheckRow, "tls_last_error" | "tls_valid_to">,
  now: Date | string = new Date(),
): CertificateBadge => {
  if (check.tls_last_error) {
    return { label: "未取得", className: "cert-chip warn" };
  }

  const daysRemaining = calculateCertificateDaysRemaining(check.tls_valid_to, now);
  if (daysRemaining === null) {
    return { label: "未取得", className: "cert-chip warn" };
  }
  if (daysRemaining !== null && daysRemaining <= 30) {
    return { label: `要確認・${formatCertificateDaysCompact(daysRemaining)}`, className: "cert-chip warn" };
  }

  return { label: `OK・${formatCertificateDaysCompact(daysRemaining)}`, className: "cert-chip" };
};

export const describeMaintenanceBadge = (
  check: Pick<CheckRow, "maintenance_enabled">,
): MaintenanceBadge | null => {
  if (!isMaintenanceWindowActive(check.maintenance_enabled)) {
    return null;
  }

  return { label: "メンテ中", className: "status maintenance" };
};
