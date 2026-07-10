"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Address, ContactDto } from "@novamail/shared";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { searchContacts } from "../api/compose.api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RecipientFieldProps {
  label: string;
  value: Address[];
  onChange: (next: Address[]) => void;
  autoFocus?: boolean;
  trailing?: React.ReactNode;
}

/** Chip input with contact autocomplete (Enter/Tab/comma to commit). */
export function RecipientField({
  label,
  value,
  onChange,
  autoFocus,
  trailing,
}: RecipientFieldProps) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<ContactDto[]>([]);
  const [highlight, setHighlight] = useState(0);
  const debounced = useDebouncedValue(input, 150);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (debounced.trim() === "") {
      setSuggestions([]);
      return;
    }
    void searchContacts(debounced).then((contacts) => {
      if (!cancelled) {
        setSuggestions(
          contacts.filter((c) => !value.some((v) => v.email === c.email)),
        );
        setHighlight(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, value]);

  const commit = (address: Address): void => {
    if (!EMAIL_RE.test(address.email)) return;
    if (value.some((v) => v.email === address.email)) return;
    onChange([...value, address]);
    setInput("");
    setSuggestions([]);
  };

  return (
    <div className="relative border-b border-border px-4 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-12 shrink-0 text-[13px] text-muted-foreground">
          {label}
        </span>
        {value.map((address) => (
          <span
            key={address.email}
            className="flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent"
          >
            {address.name ?? address.email}
            <button
              type="button"
              aria-label={`Remove ${address.email}`}
              onClick={() =>
                onChange(value.filter((v) => v.email !== address.email))
              }
              className="rounded-full p-0.5 hover:bg-accent/20"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          autoFocus={autoFocus}
          aria-label={`${label} recipients`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
              const chosen = suggestions[highlight];
              if (chosen !== undefined) {
                e.preventDefault();
                commit({ name: chosen.name, email: chosen.email });
              } else if (input.trim() !== "") {
                e.preventDefault();
                commit({ name: null, email: input.trim().toLowerCase() });
              }
            } else if (e.key === "Backspace" && input === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (EMAIL_RE.test(input.trim())) {
              commit({ name: null, email: input.trim().toLowerCase() });
            }
          }}
          className="min-w-28 flex-1 bg-transparent py-1 text-[13px] outline-none"
        />
        {trailing}
      </div>

      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Contact suggestions"
          className="absolute left-14 top-full z-10 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          {suggestions.map((contact, i) => (
            <li key={contact.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit({ name: contact.name, email: contact.email });
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex w-full flex-col px-3 py-2 text-left",
                  i === highlight && "bg-accent-soft",
                )}
              >
                <span className="text-[13px] font-medium">
                  {contact.name ?? contact.email}
                </span>
                {contact.name !== null && (
                  <span className="text-[11px] text-muted-foreground">
                    {contact.email}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
