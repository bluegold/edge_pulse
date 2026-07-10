import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCertificateSnapshot } from "../../src/lib/cert-probe";

vi.mock("@cloudflare/containers", () => ({
  getContainer: () => ({
    fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  }),
}));

import { describeCertificateAlert, probeCertificateSnapshot } from "../../src/services/certificate-check";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("certificate check service", () => {
  it("describes expiry alerts", () => {
    expect(
      describeCertificateAlert({
        host: "api.example.com",
        port: 443,
        serverName: "api.example.com",
        subject: null,
        issuer: null,
        class: null,
        validFrom: null,
        validTo: null,
        daysRemaining: -2,
        dnsNames: null,
        error: null,
      }),
    ).toEqual({
      reason: "tls_expired",
      error: "certificate expired 2 days ago",
    });

    expect(
      describeCertificateAlert({
        host: "api.example.com",
        port: 443,
        serverName: "api.example.com",
        subject: null,
        issuer: null,
        class: null,
        validFrom: null,
        validTo: null,
        daysRemaining: 10,
        dnsNames: null,
        error: null,
      }),
    ).toEqual({
      reason: "tls_expiring_soon",
      error: "certificate expires in 10 days",
    });

    expect(
      describeCertificateAlert({
        host: "api.example.com",
        port: 443,
        serverName: "api.example.com",
        subject: null,
        issuer: null,
        class: null,
        validFrom: null,
        validTo: null,
        daysRemaining: 90,
        dnsNames: null,
        error: null,
      }),
    ).toBeNull();
  });

  it("treats oversized cert probe responses as an error result", async () => {
    const oversizedJson = JSON.stringify({ payload: "x".repeat(20_000) });

    const snapshot = await fetchCertificateSnapshot(
      {
        fetch: async () =>
          new Response(oversizedJson, {
            status: 200,
            headers: {
              "content-type": "application/json",
              "content-length": String(oversizedJson.length),
            },
          }),
      },
      "api.example.com",
      443,
      "api.example.com",
    );

    expect(snapshot.error).toBe("request_too_large");
    expect(snapshot.subject).toBeNull();
  });

  it("prefers CERT_PROBE_URL over the container binding", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          host: "api.example.com",
          port: 443,
          servername: "api.example.com",
          subject: "CN=api.example.com",
          issuer: "CN=Example CA",
          class: "RSA",
          valid_from: "2026-06-01T00:00:00.000Z",
          valid_to: "2026-09-01T00:00:00.000Z",
          days_remaining: 60,
          dns_names: ["api.example.com"],
          error: null,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const snapshot = await probeCertificateSnapshot(
      {
        CERT_PROBE_URL: "https://cert-probe.example.com/probe",
        CertProbeContainer: {} as never,
      } as Pick<Env, "CERT_PROBE_URL" | "CertProbeContainer"> as Env,
      {
        id: 1,
        name: "api",
        url: "https://api.example.com",
        method: "GET",
        enabled: 1,
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 10_000,
        interval_minutes: 5,
        next_check_at: null,
        last_enqueued_at: null,
        last_checked_at: null,
        last_state: "ok",
        last_status_code: 200,
        last_latency_ms: 10,
        last_error: null,
        fail_threshold: 2,
        recovery_threshold: 1,
        consecutive_failures: 0,
        consecutive_successes: 0,
        first_failure_at: null,
        first_success_at: null,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
      },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("https://cert-probe.example.com/probe");
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("host=api.example.com");
    expect(snapshot?.subject).toBe("CN=api.example.com");
  });
});
