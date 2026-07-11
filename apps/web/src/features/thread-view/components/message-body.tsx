"use client";

import { useCallback, useEffect, useRef, useState } from "react";

let linkHookInstalled = false;

/**
 * Renders bodyHtml in a sandboxed, sanitized iframe -- the plain-text
 * fallback this used to render unconditionally strips all formatting,
 * images, and links from real HTML mail, which is most of what a real
 * inbox receives. `allow-same-origin` (no `allow-scripts`) keeps the frame
 * fully inert while still letting us read its height for auto-sizing;
 * `allow-popups` lets links open in a new tab.
 */
function buildSrcDoc(sanitizedHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body{margin:0;padding:0;background:#fff;color:#1a1a1a;}
  body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.6;word-wrap:break-word;overflow-wrap:anywhere;}
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
}: {
  bodyHtml: string | null;
  bodyText: string | null;
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
      setSrcDoc(buildSrcDoc(DOMPurify.sanitize(bodyHtml)));
    });
    return () => {
      cancelled = true;
    };
  }, [bodyHtml]);

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
      className="w-full rounded-lg border-0"
    />
  );
}
