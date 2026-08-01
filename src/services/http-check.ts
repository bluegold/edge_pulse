import { classifyCheckFailureReason } from "../lib/checks";
import { toErrorMessage } from "../lib/error-message";
import type { CheckResult } from "../lib/checks";
import type { describeCertificateAlert } from "./certificate-check";

const CHECK_USER_AGENT = "edge-pulse-check/1.0";

export const determineResultState = (
  response: Response | null,
  error: string | null,
  inRange: boolean,
  certificateAlert: ReturnType<typeof describeCertificateAlert>
) => {
  const certificateFailure = certificateAlert?.reason === "tls_expired";
  const certificateWarning = certificateAlert?.reason === "tls_expiring_soon";
  const shouldFail = certificateFailure || !inRange;
  
  let responseReason: string;
  if (response) {
    if (response.status === 526) {
      responseReason = "tls_error";
    } else if (inRange) {
      responseReason = "http_ok";
    } else {
      responseReason = "http_status";
    }
  } else {
    responseReason = classifyCheckFailureReason(null, error);
  }
  
  const resultReason = certificateFailure
    ? certificateAlert.reason
    : responseReason === "http_ok" && certificateWarning
      ? certificateAlert.reason
      : responseReason;
  const resultError = certificateFailure
    ? certificateAlert.error
    : responseReason === "http_ok" && certificateWarning
      ? certificateAlert.error
      : (response?.status === 526 ? "invalid SSL certificate" : response ? null : error ?? "request failed");

  const state: CheckResult["state"] = shouldFail ? "fail" : certificateWarning ? "warning" : "ok";

  return {
    shouldFail,
    state,
    resultReason,
    resultError,
  };
};

export const performHttpCheck = async (url: string, method: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const started = performance.now();

  let response: Response | null = null;
  let error: string | null = null;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "user-agent": CHECK_USER_AGENT,
      },
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (cause) {
    error = toErrorMessage(cause);
  } finally {
    clearTimeout(timeout);
  }
  
  const latencyMs = Math.max(0, Math.round(performance.now() - started));
  return { response, error, latencyMs };
};
