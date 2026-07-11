import { API_PREFIX } from "@novamail/shared";

/** Same-origin URL for an attachment's bytes — safe to use directly in
 * <a href>/<img src>/<iframe src> since GET is exempt from CSRF and the
 * session cookie rides along automatically. */
export function attachmentUrl(
  id: string,
  disposition: "inline" | "attachment",
): string {
  return `${API_PREFIX}/attachments/${id}/download?disposition=${disposition}`;
}
