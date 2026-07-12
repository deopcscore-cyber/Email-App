import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ThreadListItemDto } from "@novamail/shared";
import { EmailRow } from "./email-row";

function makeThread(overrides: Partial<ThreadListItemDto> = {}): ThreadListItemDto {
  return {
    id: "thread-1",
    accountId: "acc-1",
    accountColor: "#6E56CF",
    subject: "Q2 Campaign Strategy",
    snippet: "Hi Dami, here's the plan for Q2.",
    folder: "INBOX",
    category: "PRIMARY",
    participants: [{ name: "Sarah Chen", email: "sarah@acme.com" }],
    messageCount: 1,
    unreadCount: 1,
    isStarred: false,
    isPinned: false,
    isPriority: false,
    hasAttachments: false,
    snoozedUntil: null,
    lastMessageAt: new Date("2026-07-11T09:00:00").toISOString(),
    labels: [],
    ...overrides,
  };
}

describe("EmailRow", () => {
  it("renders the sender, subject, and snippet", () => {
    render(
      <EmailRow
        thread={makeThread()}
        selected={false}
        focused={false}
        onSelect={vi.fn()}
        onToggleStar={vi.fn()}
        onArchive={vi.fn()}
        onTrash={vi.fn()}
      />,
    );
    expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
    expect(screen.getByText("Q2 Campaign Strategy")).toBeInTheDocument();
    expect(screen.getByText(/here's the plan for Q2/)).toBeInTheDocument();
  });

  it("shows the message count next to the sender for multi-message threads", () => {
    render(
      <EmailRow
        thread={makeThread({ messageCount: 4 })}
        selected={false}
        focused={false}
        onSelect={vi.fn()}
        onToggleStar={vi.fn()}
        onArchive={vi.fn()}
        onTrash={vi.fn()}
      />,
    );
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("omits the message count for single-message threads", () => {
    render(
      <EmailRow
        thread={makeThread({ messageCount: 1 })}
        selected={false}
        focused={false}
        onSelect={vi.fn()}
        onToggleStar={vi.fn()}
        onArchive={vi.fn()}
        onTrash={vi.fn()}
      />,
    );
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("calls onSelect with the thread id when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <EmailRow
        thread={makeThread()}
        selected={false}
        focused={false}
        onSelect={onSelect}
        onToggleStar={vi.fn()}
        onArchive={vi.fn()}
        onTrash={vi.fn()}
      />,
    );
    await user.click(screen.getByText("Q2 Campaign Strategy"));
    expect(onSelect).toHaveBeenCalledWith("thread-1");
  });

  it("toggles the star without triggering row selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onToggleStar = vi.fn();
    render(
      <EmailRow
        thread={makeThread({ isStarred: false })}
        selected={false}
        focused={false}
        onSelect={onSelect}
        onToggleStar={onToggleStar}
        onArchive={vi.fn()}
        onTrash={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Star" }));
    expect(onToggleStar).toHaveBeenCalledWith("thread-1", true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("offers 'Unstar' once a thread is starred", () => {
    render(
      <EmailRow
        thread={makeThread({ isStarred: true })}
        selected={false}
        focused={false}
        onSelect={vi.fn()}
        onToggleStar={vi.fn()}
        onArchive={vi.fn()}
        onTrash={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Unstar" })).toBeInTheDocument();
  });

  it("marks the row selected via aria-selected", () => {
    render(
      <EmailRow
        thread={makeThread()}
        selected
        focused={false}
        onSelect={vi.fn()}
        onToggleStar={vi.fn()}
        onArchive={vi.fn()}
        onTrash={vi.fn()}
      />,
    );
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
  });

  it("archives without triggering row selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onArchive = vi.fn();
    render(
      <EmailRow
        thread={makeThread()}
        selected={false}
        focused={false}
        onSelect={onSelect}
        onToggleStar={vi.fn()}
        onArchive={onArchive}
        onTrash={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalledWith("thread-1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("deletes without triggering row selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onTrash = vi.fn();
    render(
      <EmailRow
        thread={makeThread()}
        selected={false}
        focused={false}
        onSelect={onSelect}
        onToggleStar={vi.fn()}
        onArchive={vi.fn()}
        onTrash={onTrash}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onTrash).toHaveBeenCalledWith("thread-1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("falls back to the email local-part when the sender has no name", () => {
    render(
      <EmailRow
        thread={makeThread({
          participants: [{ name: null, email: "unknown@acme.com" }],
        })}
        selected={false}
        focused={false}
        onSelect={vi.fn()}
        onToggleStar={vi.fn()}
        onArchive={vi.fn()}
        onTrash={vi.fn()}
      />,
    );
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});
