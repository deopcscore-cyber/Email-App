import type { Address } from "@novamail/shared";
import type { OutgoingMessage } from "./provider.interface";

function formatAddress(a: Address): string {
  const name = a.name ?? null;
  return name !== null && name !== ""
    ? `"${name.replace(/"/g, "'")}" <${a.email}>`
    : a.email;
}

function encodeHeaderText(value: string): string {
  // RFC 2047 encoded-word for non-ASCII subjects.
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Builds an RFC 822 message (Gmail's raw send format). */
export function buildMime(from: Address, message: OutgoingMessage): string {
  const boundary = `novamail-${Date.now().toString(36)}`;
  const lines: string[] = [
    `From: ${formatAddress(from)}`,
    `To: ${message.to.map(formatAddress).join(", ")}`,
  ];
  if (message.cc.length > 0) {
    lines.push(`Cc: ${message.cc.map(formatAddress).join(", ")}`);
  }
  if (message.bcc.length > 0) {
    lines.push(`Bcc: ${message.bcc.map(formatAddress).join(", ")}`);
  }
  lines.push(`Subject: ${encodeHeaderText(message.subject)}`);
  if (message.inReplyTo !== undefined) {
    lines.push(`In-Reply-To: ${message.inReplyTo}`);
    lines.push(`References: ${message.inReplyTo}`);
  }
  lines.push("MIME-Version: 1.0");

  const htmlPart = [
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(message.bodyHtml, "utf8").toString("base64"),
  ].join("\r\n");

  if (message.attachments.length === 0) {
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(Buffer.from(message.bodyHtml, "utf8").toString("base64"));
    return lines.join("\r\n");
  }

  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push(htmlPart);
  for (const att of message.attachments) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
    lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(att.content.toString("base64"));
  }
  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}
