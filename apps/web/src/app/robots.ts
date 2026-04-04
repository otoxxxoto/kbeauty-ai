import type { MetadataRoute } from "next";
import { getPublicSiteBaseUrl } from "@/lib/public-site-base-url";

const BASE_URL = getPublicSiteBaseUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
