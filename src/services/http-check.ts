import { classifyCheckFailureReason } from "../lib/checks";
import type { describeCertificateAlert } from "./certificate-check";

const CHECK_USER_AGENT = "edge-pulse-check/1.0";

export const determineResultState = (
  response: Response | null,
  error: string | null,
  inRange: boolean,
  certificateAlert: ReturnType<typeof describeCertificateAlert>
) => {
  const certificateFailure = Boolean(certificateAlert);
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
  
  const resultReason = certificateAlert?.reason ?? responseReason;
  const resultError = certificateAlert?.error ?? (response?.status === 526 ? "invalid SSL certificate" : response ? null : error ?? "request failed");

  return { shouldFail, resultReason, resultError };
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
    error = cause instanceof Error ? cause.message : String(cause);
  } finally {
    clearTimeout(timeout);
  }
  
  const latencyMs = Math.max(0, Math.round(performance.now() - started));
  return { response, error, latencyMs };
};
