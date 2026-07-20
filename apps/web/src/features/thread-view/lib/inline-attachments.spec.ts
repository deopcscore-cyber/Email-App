import { describe, expect, it } from "vitest";
import { referencedContentIds } from "./inline-attachments";

describe("referencedContentIds", () => {
  it("finds a cid: reference in a src attribute", () => {
    const html = '<img src="cid:logo123">';
    expect(referencedContentIds(html)).toEqual(new Set(["logo123"]));
  });

  it("finds a cid: reference in a background attribute with single quotes", () => {
    const html = "<body background='cid:banner456'>";
    expect(referencedContentIds(html)).toEqual(new Set(["banner456"]));
  });

  it("returns an empty set when nothing is embedded", () => {
    const html = "<p>Hi Dami, here's the plan.</p>";
    expect(referencedContentIds(html)).toEqual(new Set());
  });

  it("does not treat a Content-ID on a real attachment as referenced when the body never embeds it", () => {
    // This is the exact bug: a sender's file attachment can carry a
    // Content-ID header without the HTML ever actually using cid: to
    // embed it -- such an attachment must not be reported as referenced,
    // so callers fall back to showing it as a downloadable chip.
    const html = "<p>See the attached report.</p>";
    expect(referencedContentIds(html).has("report789")).toBe(false);
  });

  it("finds multiple distinct references", () => {
    const html = '<img src="cid:a1"><img src="cid:a2">';
    expect(referencedContentIds(html)).toEqual(new Set(["a1", "a2"]));
  });
});
