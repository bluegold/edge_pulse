import type { CheckRow } from "./checks";

export type ChecksSummary = {
  totalChecks: number;
  okChecks: number;
  failedChecks: number;
  stoppedChecks: number;
};

export const summarizeChecks = (checks: CheckRow[]): ChecksSummary => {
  const totalChecks = checks.length;
  const okChecks = checks.filter((check) => check.enabled === 1 && check.last_state === "ok").length;
  const failedChecks = checks.filter((check) => check.enabled === 1 && check.last_state === "fail").length;
  const stoppedChecks = checks.filter((check) => check.enabled === 0).length;

  return {
    totalChecks,
    okChecks,
    failedChecks,
    stoppedChecks,
  };
};
