"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentDto } from "@novamail/shared";
import { attachmentUrl } from "../lib/attachment-url";

let linkHookInstalled = false;

/** Gmail/Graph both leave inline images as `cid:` references pointing at
 * the message's own attachment parts -- not a resolvable URL in a browser,
 * so left alone they render as broken images. Swap each for the matching
 * attachment's inline download URL before sanitizing. */
function resolveCidReferences(html: string, attachments: AttachmentDto[]): string {
  const byContentId = new Map(
    attachments
      .filter((a): a is AttachmentDto & { contentId: string } => a.contentId !== null)
      .map((a) => [a.contentId, a.id]),
  );
  if (byContentId.size === 0) return html;
  return html.replace(
    /\b(src|background)(\s*=\s*)(["'])cid:([^"'>]+)\3/gi,
    (match: string, attr: string, eq: string, quote: string, cid: string) => {
      const id = byContentId.get(cid);
      return id === undefined
        ? match
        : `${attr}${eq}${quote}${attachmentUrl(id, "inline")}${quote}`;
    },
  );
}

/**
 * Renders bodyHtml in a sandboxed, sanitized iframe -- the plain-text
 * fallback this used to render unconditionally strips all formatting,
 * images, and links from real HTML mail, which is most of what a real
 * inbox receives. `allow-same-origin` (no `allow-scripts`) keeps the frame
 * fully inert while still letting us read its height for auto-sizing;
 * `allow-popups` lets links open in a new tab.
 *
 * Always renders on a light background regardless of app theme, same as
 * Gmail/Outlook/Apple Mail: real HTML mail sets its own colors assuming a
 * white page (a signature block might set dark gray text but never set a
 * background, trusting the browser default), so flipping the default to
 * dark makes that text vanish rather than adapt. Third-party HTML isn't
 * safe to theme -- the surrounding card chrome is dark, the message itself
 * stays a light "island", which is what every real client does here.
 */
function buildSrcDoc(sanitizedHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html{margin:0;padding:0;background:#fff;}
  body{margin:0;padding:20px;background:#fff;color:#1a1a1a;box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.6;word-wrap:break-word;overflow-wrap:anywhere;}
  img{max-width:100%;height:auto;}
  table{max-width:100%!important;}
  a{color:#6E56CF;}
  pre{white-space:pre-wrap;}
</style>
</head><body>${sanitizedHtml}</body></html>`;
}

export function MessageBody({
  bodyHtml,
  bodyText,
  attachments,
}: {
  bodyHtml: string | null;
  bodyText: string | null;
  attachments: AttachmentDto[];
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [height, setHeight] = useState(0);

  // DOMPurify needs a real DOM; loading it in an effect keeps it out of SSR
  // entirely (it isn't safe to import at module scope in a server-rendered
  // client component) and code-splits it out of the main bundle.
  useEffect(() => {
    if (bodyHtml === null) {
      setSrcDoc(null);
      return;
    }
    let cancelled = false;
    void import("dompurify").then(({ default: DOMPurify }) => {
      if (cancelled) return;
      if (!linkHookInstalled) {
        DOMPurify.addHook("afterSanitizeAttributes", (node) => {
          if (node.tagName === "A") {
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
          }
        });
        linkHookInstalled = true;
      }
      const withImages = resolveCidReferences(bodyHtml, attachments);
      setSrcDoc(buildSrcDoc(DOMPurify.sanitize(withImages)));
    });
    return () => {
      cancelled = true;
    };
  }, [bodyHtml, attachments]);

  const resize = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc?.documentElement) {
      setHeight(doc.documentElement.scrollHeight);
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe === null || srcDoc === null) return;
    const observer = new ResizeObserver(resize);
    const onLoad = (): void => {
      resize();
      if (iframe.contentDocument?.body) observer.observe(iframe.contentDocument.body);
    };
    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      observer.disconnect();
    };
  }, [srcDoc, resize]);

  if (bodyHtml === null || srcDoc === null) {
    return (
      <div className="whitespace-pre-wrap text-[13.5px] leading-6 text-foreground/90">
        {bodyHtml === null ? (bodyText ?? "") : ""}
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      title="Message content"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups"
      style={{ height }}
      className="w-full rounded-lg border border-black/10"
    />
  );
}
