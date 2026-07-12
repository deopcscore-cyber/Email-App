import { effectiveThreadFolder } from "./sync.service";

describe("effectiveThreadFolder", () => {
  it("keeps a thread in Inbox even after your own reply syncs back as Sent", () => {
    // This is the core bug: an inbound message (INBOX) plus your own reply
    // (SENT) belong to the same thread, and it must not fall out of Inbox
    // just because the reply was the most recently synced message.
    expect(effectiveThreadFolder(["INBOX", "SENT"])).toBe("INBOX");
    expect(effectiveThreadFolder(["SENT", "INBOX"])).toBe("INBOX");
  });

  it("lets Trash/Spam override Inbox once the whole thread is relabeled", () => {
    expect(effectiveThreadFolder(["INBOX", "SENT", "TRASH"])).toBe("TRASH");
    expect(effectiveThreadFolder(["INBOX", "SPAM"])).toBe("SPAM");
  });

  it("falls back to Sent for an all-outgoing thread", () => {
    expect(effectiveThreadFolder(["SENT", "SENT"])).toBe("SENT");
  });

  it("ignores messages with no known provider folder yet", () => {
    expect(effectiveThreadFolder([null, "SENT", null])).toBe("SENT");
  });

  it("returns undefined when nothing is known yet", () => {
    expect(effectiveThreadFolder([null, null])).toBeUndefined();
    expect(effectiveThreadFolder([])).toBeUndefined();
  });
});
