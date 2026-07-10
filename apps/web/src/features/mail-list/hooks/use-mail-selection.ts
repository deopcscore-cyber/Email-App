"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Selected thread lives in the URL (?t=<id>) so it survives refresh and is
 * shareable, while the three-column layout never remounts.
 */
export function useMailSelection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("t");

  const select = useCallback(
    (id: string) => {
      const qs = new URLSearchParams(searchParams);
      qs.set("t", id);
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const close = useCallback(() => {
    const qs = new URLSearchParams(searchParams);
    qs.delete("t");
    const rest = qs.toString();
    router.replace(rest === "" ? pathname : `${pathname}?${rest}`, {
      scroll: false,
    });
  }, [router, pathname, searchParams]);

  return { selectedId, select, close };
}
