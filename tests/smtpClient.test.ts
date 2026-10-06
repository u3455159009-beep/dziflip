// Real SMTP client (Request E, item 3 / outreach) — never fakes a send.
import { describe, it, expect, afterEach, vi } from "vitest";

const sendMailMock = vi.fn();
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock }))
  }
}));

describe("sendEmail (src/lib/email/smtpClient.ts)", () => {
  const original = { ...process.env };

  afterEach(async () => {
    process.env = { ...original };
    sendMailMock.mockReset();
    const { resetSmtpTransporterCache } = await import("@/lib/email/smtpClient");
    resetSmtpTransporterCache();
  });

  it("without SMTP_HOST/SMTP_FROM, returns NOT_CONFIGURED and never calls the transporter", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    const { sendEmail, resetSmtpTransporterCache } = await import("@/lib/email/smtpClient");
    resetSmtpTransporterCache();
    const result = await sendEmail({ to: "simon@example.test", subject: "x", text: "y" });
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("with SMTP configured and a successful sendMail, returns SENT and passes through from/to/subject/text/html", async () => {
    process.env.SMTP_HOST = "smtp.test.local";
    process.env.SMTP_FROM = "dziflip@test.local";
    sendMailMock.mockResolvedValue({ messageId: "abc" });

    const { sendEmail, resetSmtpTransporterCache } = await import("@/lib/email/smtpClient");
    resetSmtpTransporterCache();
    const result = await sendEmail({ to: "simon@example.test", subject: "Test alert", text: "body text", html: "<p>body</p>" });

    expect(result.status).toBe("SENT");
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.from).toBe("dziflip@test.local");
    expect(call.to).toBe("simon@example.test");
    expect(call.subject).toBe("Test alert");
    expect(call.text).toBe("body text");
    expect(call.html).toBe("<p>body</p>");
  });

  it("when the real send genuinely fails, returns FAILED with the real error — never a fabricated SENT", async () => {
    process.env.SMTP_HOST = "smtp.test.local";
    process.env.SMTP_FROM = "dziflip@test.local";
    sendMailMock.mockRejectedValue(new Error("Connection refused"));

    const { sendEmail, resetSmtpTransporterCache } = await import("@/lib/email/smtpClient");
    resetSmtpTransporterCache();
    const result = await sendEmail({ to: "simon@example.test", subject: "x", text: "y" });

    expect(result.status).toBe("FAILED");
    expect(result.detail).toMatch(/Connection refused/);
  });
});
