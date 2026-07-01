import { describe, expect, it, vi } from "vitest";

vi.mock("@cloudflare/containers", () => ({
  getContainer: () => ({
    fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  }),
}));

import { describeCertificateAlert } from "../../src/services/certificate-check";

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
});
