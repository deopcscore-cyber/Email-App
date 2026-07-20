/** Matches the exact `cid:` embedding forms MessageBody resolves in the
 * rendered HTML -- kept as the single source of truth so an attachment can
 * never be excluded from the downloadable list without actually having
 * been rendered inline. */
export const CID_REFERENCE_PATTERN = /\b(?:src|background)\s*=\s*(["'])cid:([^"'>]+)\1/gi;

/** Content-IDs actually embedded in the HTML via a matched cid: reference. */
export function referencedContentIds(html: string): Set<string> {
  const ids = new Set<string>();
  for (const match of html.matchAll(CID_REFERENCE_PATTERN)) {
    const cid = match[2];
    if (cid !== undefined) ids.add(cid);
  }
  return ids;
}
