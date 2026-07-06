import type { CheckRow } from "../lib/checks";
import { isMaintenanceWindowActive } from "../lib/checks";

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
  check: Pick<CheckRow, "tls_last_error" | "tls_days_remaining" | "tls_valid_to">,
): CertificateBadge => {
  if (check.tls_last_error) {
    return { label: "未取得", className: "cert-chip warn" };
  }
  if (typeof check.tls_days_remaining === "number" && check.tls_days_remaining <= 30) {
    return { label: `要確認・${formatCertificateDaysCompact(check.tls_days_remaining)}`, className: "cert-chip warn" };
  }
  if (check.tls_valid_to) {
    return { label: `OK・${formatCertificateDaysCompact(check.tls_days_remaining)}`, className: "cert-chip" };
  }
  return { label: "未取得", className: "cert-chip warn" };
};

export const describeMaintenanceBadge = (
  check: Pick<CheckRow, "maintenance_enabled">,
): MaintenanceBadge | null => {
  if (!isMaintenanceWindowActive(check.maintenance_enabled)) {
    return null;
  }

  return { label: "メンテ中", className: "status maintenance" };
};
