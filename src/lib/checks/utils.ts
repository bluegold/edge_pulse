export const isCertificateExpiringSoon = (daysRemaining: number | null, thresholdDays = 30): boolean => {
  return daysRemaining !== null && daysRemaining <= thresholdDays;
};

export const calculateCertificateDaysRemaining = (validTo: string | null | undefined, now: Date | string = new Date()): number | null => {
  if (!validTo) return null;

  const validToTime = Date.parse(validTo);
  const nowTime = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (!Number.isFinite(validToTime) || !Number.isFinite(nowTime)) return null;

  const days = (validToTime - nowTime) / 86_400_000;
  // Use elapsed calendar-day semantics: after the date boundary, a partial
  // future day counts as the current remaining day. This makes a certificate
  // expiring on Aug 31 show 30 days from Aug 1 00:00 UTC.
  return Math.floor(days);
};

export const isMaintenanceWindowActive = (maintenanceEnabled: number | boolean | null | undefined): boolean => {
  return Boolean(maintenanceEnabled);
};

export const scheduleNextCheckAt = (nowIso: string, intervalMinutes: number): string => {
  const baseMs = intervalMinutes * 60_000;
  // Jitter of ±10% to prevent thundering herds and scatter execution times
  const jitterMs = Math.floor((Math.random() - 0.5) * 0.2 * baseMs);
  return new Date(new Date(nowIso).getTime() + baseMs + jitterMs).toISOString();
};

export const formatCheckUrlForDisplay = (value: string): string => value;
