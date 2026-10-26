import { describe, it, expect } from "vitest";
import {
  allowedSenderDomains,
  campaignSendAllowance,
  classifySmtpError,
  clampHourlyLimit,
  sendSmtpEmail,
} from "../campaignMailer";
import { appendOpenPixel } from "../campaignInvitationService";
import { csvDocument } from "../campaignWorkspaceRoutes";

const config = {
  configured: true,
  live: true,
  hourlyLimit: 200,
  smtp: { host: "mail.example.org", port: 587, user: "grow@example.org", password: "x", fromEmail: "grow@example.org" },
};
const payload = {
  config,
  to: "person@example.com",
  subject: "Subject",
  html: "<p>Hello</p>",
  text: "Hello",
  fromName: "Mutale",
  fromEmail: "grow@example.org",
  cc: ["copy@example.com", "PERSON@example.com"],
};
const transportThat = (sendMail) => ({ sendMail });

describe("campaign SMTP outcomes", () => {
  it("records a message the server accepted", async () => {
    let message;
    const result = await sendSmtpEmail({
      ...payload,
      transport: transportThat(async (input) => {
        message = input;
        return { accepted: ["person@example.com"], messageId: "<m1@example.org>" };
      }),
    });
    expect(result).toEqual({ status: "accepted", providerMessageId: "<m1@example.org>" });
    expect(message.cc).toEqual(["copy@example.com"]);
    expect(message.from).toEqual({ name: "Mutale", address: "grow@example.org" });
  });

  it("fails without retrying when the server refuses the recipient", async () => {
    const result = await sendSmtpEmail({
      ...payload,
      transport: transportThat(async () => ({ accepted: [], rejected: ["person@example.com"], response: "550 No such user" })),
    });
    expect(result.status).toBe("failed");
    expect(result.retryable).toBe(false);
  });

  it("retries only failures that happened before the message was handed over", () => {
    expect(classifySmtpError({ responseCode: 421, response: "421 Try later" })).toMatchObject({ status: "failed", retryable: true });
    expect(classifySmtpError({ responseCode: 550, response: "550 Rejected" })).toMatchObject({ status: "failed", retryable: false });
    expect(classifySmtpError({ code: "EAUTH", message: "Invalid login" })).toMatchObject({ status: "failed", retryable: false });
    expect(classifySmtpError({ code: "ETIMEDOUT", command: "CONN" })).toMatchObject({ status: "failed", retryable: true });
  });

  it("treats a dropped connection during sending as unconfirmed, never as safe to retry", async () => {
    expect(classifySmtpError({ code: "ETIMEDOUT", command: "DATA" }).status).toBe("acceptance_unknown");
    const result = await sendSmtpEmail({
      ...payload,
      transport: transportThat(async () => {
        throw Object.assign(new Error("socket closed"), { code: "ESOCKET" });
      }),
    });
    expect(result.status).toBe("acceptance_unknown");
  });

  it("verifies senders on the SMTP account's domains only", () => {
    expect([...allowedSenderDomains({ user: "Grow@Mutalemubanga.org", fromEmail: "grow@mutalemubanga.org" })]).toEqual(["mutalemubanga.org"]);
    expect(allowedSenderDomains({ user: "apikey", fromEmail: "" }).size).toBe(0);
  });
});

describe("campaign send pacing", () => {
  const poolWithSent = (sent) => ({ query: async () => [[{ sent }]] });

  it("spreads the hourly limit across worker ticks and stops at the cap", async () => {
    expect(await campaignSendAllowance(poolWithSent(0), { hourlyLimit: 200 })).toBe(2);
    expect(await campaignSendAllowance(poolWithSent(199), { hourlyLimit: 200 })).toBe(1);
    expect(await campaignSendAllowance(poolWithSent(200), { hourlyLimit: 200 })).toBe(0);
    expect(await campaignSendAllowance(poolWithSent(0), { hourlyLimit: 5000 })).toBe(28);
  });

  it("keeps the hourly limit within a sensible range", () => {
    expect(clampHourlyLimit("abc")).toBe(200);
    expect(clampHourlyLimit(0)).toBe(200);
    expect(clampHourlyLimit(99999)).toBe(5000);
    expect(clampHourlyLimit(150)).toBe(150);
  });
});

describe("campaign tracking and exports", () => {
  it("adds one open-tracking image before the end of the email body", () => {
    const html = appendOpenPixel("<html><body><p>Hi</p></body></html>", { id: "c1" }, { id: "r1" });
    expect(html.match(/\/api\/email\/open\?token=/g)).toHaveLength(1);
    expect(html.indexOf("/api/email/open")).toBeLessThan(html.indexOf("</body>"));
  });

  it("escapes spreadsheet formulas in exports", () => {
    expect(csvDocument(["Name"], [[" =cmd()"]])).toContain("' =cmd()");
  });
});
