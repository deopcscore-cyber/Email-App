import { buildMime } from "./mime";
import type { OutgoingMessage } from "./provider.interface";

const baseMessage: OutgoingMessage = {
  to: [{ name: "Sarah Chen", email: "sarah@acme.com" }],
  cc: [],
  bcc: [],
  subject: "Q2 Campaign Strategy",
  bodyHtml: "<p>Hi Sarah,</p><p>Sounds good.</p>",
  attachments: [],
};

describe("buildMime", () => {
  it("includes From/To/Subject headers and a base64 HTML body", () => {
    const mime = buildMime({ name: "Dami Oladipo", email: "dami@novamail.dev" }, baseMessage);

    expect(mime).toContain('From: "Dami Oladipo" <dami@novamail.dev>');
    expect(mime).toContain('To: "Sarah Chen" <sarah@acme.com>');
    expect(mime).toContain("Subject: Q2 Campaign Strategy");
    expect(mime).toContain(
      Buffer.from(baseMessage.bodyHtml, "utf8").toString("base64"),
    );
  });

  it("encodes non-ASCII subjects as RFC 2047 encoded-words", () => {
    const mime = buildMime(
      { name: null, email: "dami@novamail.dev" },
      { ...baseMessage, subject: "Café ☕️ update" },
    );
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(mime).not.toContain("Café ☕️ update");
  });

  it("adds In-Reply-To/References headers for replies", () => {
    const mime = buildMime(
      { name: null, email: "dami@novamail.dev" },
      { ...baseMessage, inReplyTo: "<abc123@mail.gmail.com>" },
    );
    expect(mime).toContain("In-Reply-To: <abc123@mail.gmail.com>");
    expect(mime).toContain("References: <abc123@mail.gmail.com>");
  });

  it("builds a multipart/mixed message when attachments are present", () => {
    const mime = buildMime(
      { name: null, email: "dami@novamail.dev" },
      {
        ...baseMessage,
        attachments: [
          {
            filename: "plan.pdf",
            mimeType: "application/pdf",
            content: Buffer.from("fake-pdf-bytes"),
          },
        ],
      },
    );
    expect(mime).toContain('Content-Type: multipart/mixed; boundary="');
    expect(mime).toContain('filename="plan.pdf"');
    expect(mime).toContain(Buffer.from("fake-pdf-bytes").toString("base64"));
  });

  it("omits Cc/Bcc headers when there are no recipients", () => {
    const mime = buildMime({ name: null, email: "dami@novamail.dev" }, baseMessage);
    expect(mime).not.toContain("Cc:");
    expect(mime).not.toContain("Bcc:");
  });

  it("includes Cc/Bcc headers when recipients are present", () => {
    const mime = buildMime(
      { name: null, email: "dami@novamail.dev" },
      {
        ...baseMessage,
        cc: [{ name: null, email: "cc@acme.com" }],
        bcc: [{ name: null, email: "bcc@acme.com" }],
      },
    );
    expect(mime).toContain("Cc: cc@acme.com");
    expect(mime).toContain("Bcc: bcc@acme.com");
  });
});
