import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; polyfill it so useMediaQuery (and
// anything that reads viewport breakpoints) doesn't crash in tests.
if (typeof window !== "undefined" && window.matchMedia === undefined) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
