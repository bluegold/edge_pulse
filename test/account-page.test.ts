import { describe, expect, it } from "vitest";
import { renderAccountPage, renderAccountPanel } from "../src/views/account-page.tsx";

describe("renderAccountPage", () => {
  it("shows the admin menu for superadmins", async () => {
    const response = await renderAccountPage([], {
      displayName: "Kaneko",
      email: "kaneko@example.com",
      audience: null,
      subject: "subject-1",
    }, true);
    const html = await response.text();

    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="/account"');
  });

  it("does not show the admin menu for members", async () => {
    const response = await renderAccountPage([], {
      displayName: "Kaneko",
      email: "kaneko@example.com",
      audience: null,
      subject: "subject-1",
    });
    const html = await response.text();

    expect(html).not.toContain('href="/admin"');
    expect(html).toContain('href="/account"');
  });

  it("renders copy and delete controls for a token", () => {
    const html = renderAccountPanel([{
      id: 4,
      name: "local development",
      expires_at: null,
      revoked_at: null,
      last_used_at: null,
      created_at: "2026-08-02T00:00:00.000Z",
    }], null, "ep_example");

    expect(html).toContain('id="account-new-token-copy"');
    expect(html).toContain('data-copy-target="account-new-token-value"');
    expect(html).toContain('action="/account/tokens/4/delete"');
    expect(html).toContain("削除");
  });
});
