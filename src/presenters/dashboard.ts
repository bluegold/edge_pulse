import type { CheckRow } from "../lib/checks";

export const formatDuration = (startedAt: string, resolvedAt: string | null): string => {
  const start = new Date(startedAt).getTime();
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
};

export const describeRecentCheckState = (check: Pick<CheckRow, "enabled" | "last_state">): { label: string; className: string } => {
  if (!check.enabled) {
    return { label: "停止中", className: "border-white/15 bg-white/8 text-slate-100" };
  }
  if (check.last_state === "ok") {
    return { label: "OK", className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" };
  }
  if (check.last_state === "fail") {
    return { label: "障害中", className: "border-rose-400/30 bg-rose-500/10 text-rose-100" };
  }
  return { label: "未確認", className: "border-white/15 bg-white/8 text-slate-100" };
};

export const formatCertificateDays = (daysRemaining: number | null | undefined): string => {
  if (daysRemaining === null || daysRemaining === undefined) return "-";
  if (daysRemaining < 0) return `期限切れ ${Math.abs(daysRemaining)} 日前`;
  return `残り ${daysRemaining} 日`;
};

