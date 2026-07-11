import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { KeyboardProvider } from "./keyboard-provider";
import { useOverlayScope, useShortcut } from "./use-shortcut";

/**
 * A minimal app surface exercising the real hooks: a "mail" scope archive
 * shortcut, a text input (so we can verify editable-target suppression),
 * and a togglable overlay whose own shortcut should take priority while open.
 */
function TestHarness({
  onArchive,
  onOverlayAction,
  onSequence,
}: {
  onArchive: () => void;
  onOverlayAction: () => void;
  onSequence: () => void;
}) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  useShortcut("e", onArchive);
  useShortcut("g i", onSequence);
  useOverlayScope(overlayOpen);
  useShortcut("o", onOverlayAction, { scope: "overlay", enabled: overlayOpen });

  return (
    <div>
      <button onClick={() => setOverlayOpen(true)}>Open overlay</button>
      <input aria-label="compose-body" />
    </div>
  );
}

function setup(overrides: Partial<Parameters<typeof TestHarness>[0]> = {}) {
  const onArchive = vi.fn();
  const onOverlayAction = vi.fn();
  const onSequence = vi.fn();
  render(
    <KeyboardProvider>
      <TestHarness
        onArchive={overrides.onArchive ?? onArchive}
        onOverlayAction={overrides.onOverlayAction ?? onOverlayAction}
        onSequence={overrides.onSequence ?? onSequence}
      />
    </KeyboardProvider>,
  );
  return { onArchive, onOverlayAction, onSequence };
}

describe("KeyboardProvider + useShortcut", () => {
  it("fires a single-key mail-scope shortcut", async () => {
    const user = userEvent.setup();
    const { onArchive } = setup();
    await user.keyboard("e");
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("does not fire a plain single-key shortcut while a text input is focused", async () => {
    const user = userEvent.setup();
    const { onArchive } = setup();
    await user.click(screen.getByLabelText("compose-body"));
    await user.keyboard("e");
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("fires a two-step sequence shortcut (g then i)", async () => {
    const user = userEvent.setup();
    const { onSequence } = setup();
    await user.keyboard("gi");
    expect(onSequence).toHaveBeenCalledTimes(1);
  });

  it("does not fire an overlay-scoped shortcut while the overlay is closed", async () => {
    const user = userEvent.setup();
    const { onOverlayAction } = setup();
    await user.keyboard("o");
    expect(onOverlayAction).not.toHaveBeenCalled();
  });

  it("fires the overlay shortcut, and suppresses the mail shortcut, once the overlay opens", async () => {
    const user = userEvent.setup();
    const { onArchive, onOverlayAction } = setup();

    await user.click(screen.getByText("Open overlay"));
    await user.keyboard("o");
    expect(onOverlayAction).toHaveBeenCalledTimes(1);

    // "e" is a "mail"-scope binding; it must not fire while the overlay owns
    // keyboard focus, even though the DOM element isn't itself editable.
    await user.keyboard("e");
    expect(onArchive).not.toHaveBeenCalled();
  });
});
