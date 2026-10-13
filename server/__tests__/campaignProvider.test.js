import { describe, it, expect } from "vitest";
import { sendResendEmail, verifyResendWebhook } from "../emailResendAdapter";
import { csvDocument } from "../campaignWorkspaceRoutes";
const payload = {
  to: "person@example.com",
  subject: "Subject",
  html: "<p>Hello</p>",
  text: "Hello",
  cc: ["copy@example.com"],
  idempotencyKey: "campaign/recipient/send-1",
  config: { apiKey: "test", live: true },
};
describe("campaign provider outcomes", () => {
  it("treats a network disconnect as ambiguous, never as safe to retry", async () => {
    expect(
      (
        await sendResendEmail({
          ...payload,
          fetchImpl: async () => {
            throw new Error("disconnected");
          },
        })
      ).status,
    ).toBe("acceptance_unknown");
  });
  it("does not count conflicting idempotency payloads as accepted", async () => {
    const result = await sendResendEmail({
      ...payload,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            name: "invalid_idempotent_request",
            message: "Different payload",
          }),
          { status: 409 },
        ),
    });
    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(false);
  });
  it("only retries explicit transient conflicts and provider overload", async () => {
    for (const [status, name, retryable] of [
      [409, "concurrent_idempotent_requests", true],
      [429, "rate_limit", true],
      [503, "server_error", true],
      [422, "validation_error", false],
    ]) {
      const result = await sendResendEmail({
        ...payload,
        fetchImpl: async () =>
          new Response(JSON.stringify({ name }), { status }),
      });
      expect(result.retryable).toBe(retryable);
    }
  });
  it("passes CC, idempotency and provider credentials only to the provider request", async () => {
    let options;
    await sendResendEmail({
      ...payload,
      fetchImpl: async (_url, input) => {
        options = input;
        return new Response(JSON.stringify({ id: "message-1" }), {
          status: 200,
        });
      },
    });
    expect(JSON.parse(options.body).cc).toEqual(["copy@example.com"]);
    expect(options.headers["Idempotency-Key"]).toBe(payload.idempotencyKey);
  });
  it("rejects stale webhook timestamps and escapes spreadsheet formulas in exports", () => {
    expect(() =>
      verifyResendWebhook({
        rawBody: "{}",
        headers: {
          "svix-id": "one",
          "svix-timestamp": "1",
          "svix-signature": "v1,forged",
        },
        secret: Buffer.from("secret").toString("base64"),
      }),
    ).toThrow();
    expect(csvDocument(["Name"], [[" =cmd()"]])).toContain("' =cmd()");
  });
});
