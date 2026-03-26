"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function GaPageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname]);

  return null;
}
