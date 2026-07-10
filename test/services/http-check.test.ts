import { describe, expect, it, vi } from "vitest";
import { determineResultState, performHttpCheck } from "../../src/services/http-check";

describe("http-check service", () => {
  describe("determineResultState", () => {
    it("returns ok when HTTP is in range and no certificate alert", () => {
      const response = new Response("ok", { status: 200 });
      const result = determineResultState(response, null, true, null);
      expect(result).toEqual({
        shouldFail: false,
        resultReason: "http_ok",
        resultError: null,
      });
    });

    it("returns fail when HTTP status is out of range", () => {
      const response = new Response("error", { status: 500 });
      const result = determineResultState(response, null, false, null);
      expect(result).toEqual({
        shouldFail: true,
        resultReason: "http_status",
        resultError: null,
      });
    });

    it("returns tls_error on Cloudflare 526", () => {
      const response = new Response("tls error", { status: 526 });
      const result = determineResultState(response, null, false, null);
      expect(result).toEqual({
        shouldFail: true,
        resultReason: "tls_error",
        resultError: "invalid SSL certificate",
      });
    });

    it("returns fail when fetch throws an error", () => {
      const result = determineResultState(null, "fetch failed", false, null);
      expect(result.shouldFail).toBe(true);
      expect(result.resultError).toBe("fetch failed");
    });
  });

  describe("performHttpCheck", () => {
    it("calls fetch and measures latency", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
      
      const { response, error, latencyMs } = await performHttpCheck("https://example.com", "GET", 5000);
      
      expect(fetchSpy).toHaveBeenCalled();
      expect(response?.status).toBe(200);
      expect(error).toBeNull();
      expect(typeof latencyMs).toBe("number");
      
      fetchSpy.mockRestore();
    });

    it("handles fetch errors", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network Error"));
      
      const { response, error } = await performHttpCheck("https://example.com", "GET", 5000);
      
      expect(fetchSpy).toHaveBeenCalled();
      expect(response).toBeNull();
      expect(error).toBe("Network Error");
      
      fetchSpy.mockRestore();
    });

    it("keeps nested cause details from platform fetch errors", async () => {
      const platformError = new Error("internal error; reference = 8hhlv3j7nkub91vknpj2id86");
      (platformError as Error & { cause?: unknown }).cause = new Error("DNS lookup failed.");
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(platformError);

      const { response, error } = await performHttpCheck("https://example.com", "GET", 5000);

      expect(fetchSpy).toHaveBeenCalled();
      expect(response).toBeNull();
      expect(error).toBe("internal error; reference = 8hhlv3j7nkub91vknpj2id86 | DNS lookup failed.");

      fetchSpy.mockRestore();
    });

    it("extracts nested object fields from workerd fetch errors", async () => {
      const platformError = {
        message: "internal error; reference = 3s1is5f41irf7r0f7cq7nq77",
        e: "kj/async-io-unix.c++:1293: failed: DNS lookup failed.; params.host = unknown.example.com; params.service = ; gai_strerror(status) = Name or service not known",
        params: {
          host: "unknown.example.com",
          service: "",
        },
        stack: "/path/to/workerd",
      };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(platformError);

      const { response, error } = await performHttpCheck("https://example.com", "GET", 5000);

      expect(fetchSpy).toHaveBeenCalled();
      expect(response).toBeNull();
      expect(error).toContain("internal error; reference = 3s1is5f41irf7r0f7cq7nq77");
      expect(error).toContain("e: kj/async-io-unix.c++:1293: failed: DNS lookup failed.");
      expect(error).toContain("host: unknown.example.com");

      fetchSpy.mockRestore();
    });
  });
});
