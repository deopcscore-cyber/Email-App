"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
  onSubmit: () => void;
}

/** Tiptap rich-text editor with a minimal, Linear-flavored toolbar. */
export function Editor({ initialHtml, onChange, onSubmit }: EditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write your message…" }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class:
          "prose-sm min-h-44 max-h-[50vh] overflow-y-auto px-4 py-3 text-[13px] leading-6 outline-none " +
          "[&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 " +
          "[&_a]:text-accent [&_a]:underline",
        "aria-label": "Message body",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          onSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  if (editor === null) {
    return <div className="min-h-44 px-4 py-3" />;
  }

  const buttons = [
    {
      label: "Bold",
      icon: Bold,
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      icon: Italic,
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Bullet list",
      icon: List,
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      icon: ListOrdered,
      active: editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Link",
      icon: Link2,
      active: editor.isActive("link"),
      run: () => {
        const url = window.prompt("Link URL");
        if (url !== null && url !== "") {
          editor.chain().focus().setLink({ href: url }).run();
        } else {
          editor.chain().focus().unsetLink().run();
        }
      },
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-0.5 border-b border-border px-3 py-1.5">
        {buttons.map(({ label, icon: Icon, active, run }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={run}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              active
                ? "bg-accent-soft text-accent"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
    </div>
  );
}
