import { notFound } from "next/navigation";
import { Suspense } from "react";
import { mailViewSchema } from "@novamail/shared";
import { MailPage } from "./mail-page";

/** /inbox · /priority · /snoozed · /starred · /sent · /drafts · /spam · /trash */
export default async function FolderPage({
  params,
}: {
  params: Promise<{ folder: string }>;
}) {
  const { folder } = await params;
  const view = mailViewSchema.safeParse(folder);
  if (!view.success) {
    notFound();
  }
  return (
    <Suspense>
      <MailPage view={view.data} />
    </Suspense>
  );
}
