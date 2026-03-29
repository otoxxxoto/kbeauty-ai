import type { NextConfig } from "next";

/**
 * 画像: 現状 `ProductDisplayImage` は `<img>` のため最適化パイプライン外。
 * `next/image` 利用時と将来の移行用に remotePatterns を定義。
 * 一時検証: `NEXT_IMAGE_UNOPTIMIZED=1 pnpm build` で images.unoptimized を有効化。
 */
const nextConfig: NextConfig = {
  images: {
    unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED === "1",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.oliveyoung.co.kr",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images-fe.ssl-images-amazon.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images-na.ssl-images-amazon.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
