import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Address } from "@novamail/shared";
import { RecipientField } from "./recipient-field";

vi.mock("../api/compose.api", () => ({
  searchContacts: vi.fn().mockResolvedValue([]),
}));

/** Controlled wrapper so we can assert the onChange contract like a consumer would. */
function ControlledField() {
  const [value, setValue] = useState<Address[]>([]);
  return <RecipientField label="To" value={value} onChange={setValue} />;
}

describe("RecipientField", () => {
  it("commits a typed email address as a chip on Enter", async () => {
    const user = userEvent.setup();
    render(<ControlledField />);

    const input = screen.getByLabelText("To recipients");
    await user.type(input, "sarah@acme.com");
    await user.keyboard("{Enter}");

    expect(screen.getByText("sarah@acme.com")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("ignores an invalid (non-email) value on Enter", async () => {
    const user = userEvent.setup();
    render(<ControlledField />);

    const input = screen.getByLabelText("To recipients");
    await user.type(input, "not-an-email");
    await user.keyboard("{Enter}");

    expect(screen.queryByText("not-an-email")).not.toBeInTheDocument();
  });

  it("removes the last chip on Backspace when the input is empty", async () => {
    const user = userEvent.setup();
    render(<ControlledField />);

    const input = screen.getByLabelText("To recipients");
    await user.type(input, "sarah@acme.com{Enter}");
    expect(screen.getByText("sarah@acme.com")).toBeInTheDocument();

    await user.keyboard("{Backspace}");
    // The chip has a framer-motion exit transition, so it may still be
    // mid-unmount (or, under fast/no-op timing, already gone) the instant
    // the handler returns — poll for absence rather than assert either state.
    await waitFor(() =>
      expect(screen.queryByText("sarah@acme.com")).not.toBeInTheDocument(),
    );
  });

  it("removes a chip via its own remove button", async () => {
    const user = userEvent.setup();
    render(<ControlledField />);

    const input = screen.getByLabelText("To recipients");
    await user.type(input, "sarah@acme.com{Enter}");
    await user.click(screen.getByLabelText("Remove sarah@acme.com"));

    // The chip has a framer-motion exit transition; wait for it to unmount
    // rather than asserting absence the instant the click handler returns.
    // The chip has a framer-motion exit transition, so it may still be
    // mid-unmount (or, under fast/no-op timing, already gone) the instant
    // the handler returns — poll for absence rather than assert either state.
    await waitFor(() =>
      expect(screen.queryByText("sarah@acme.com")).not.toBeInTheDocument(),
    );
  });

  it("does not add a duplicate chip for an already-added address", async () => {
    const user = userEvent.setup();
    render(<ControlledField />);

    const input = screen.getByLabelText("To recipients");
    await user.type(input, "sarah@acme.com{Enter}");
    await user.type(input, "sarah@acme.com{Enter}");

    expect(screen.getAllByText("sarah@acme.com")).toHaveLength(1);
  });
});
