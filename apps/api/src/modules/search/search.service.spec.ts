import { parseQuery } from "./search.service";

describe("parseQuery", () => {
  it("returns bare keywords when there are no operators", () => {
    expect(parseQuery("invoice campaign")).toEqual({
      keywords: "invoice campaign",
      operators: [],
    });
  });

  it("extracts known operators and strips them from keywords", () => {
    const result = parseQuery("invoice from:sarah has:attachment");
    expect(result.keywords).toBe("invoice");
    expect(result.operators).toEqual(
      expect.arrayContaining([
        { key: "from", value: "sarah" },
        { key: "has", value: "attachment" },
      ]),
    );
  });

  it("supports quoted operator values with spaces", () => {
    const result = parseQuery('from:"Sarah Chen" quarterly');
    expect(result.operators).toContainEqual({ key: "from", value: "sarah chen" });
    expect(result.keywords).toBe("quarterly");
  });

  it("leaves unknown operator-like tokens as keywords", () => {
    const result = parseQuery("re:launch plan");
    expect(result.operators).toEqual([]);
    expect(result.keywords).toBe("re:launch plan");
  });

  it("lower-cases operator values", () => {
    const result = parseQuery("label:Work in:INBOX");
    expect(result.operators).toContainEqual({ key: "label", value: "work" });
    expect(result.operators).toContainEqual({ key: "in", value: "inbox" });
  });

  it("handles multiple operators of different kinds with no keywords left", () => {
    const result = parseQuery("is:unread has:attachment before:2026-06-01");
    expect(result.keywords).toBe("");
    expect(result.operators).toHaveLength(3);
  });

  it("collapses extra whitespace left behind after stripping operators", () => {
    const result = parseQuery("  invoice   from:john   last month  ");
    expect(result.keywords).toBe("invoice last month");
  });

  it("returns empty output for an empty query", () => {
    expect(parseQuery("")).toEqual({ keywords: "", operators: [] });
  });
});
