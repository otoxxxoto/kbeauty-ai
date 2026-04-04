import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Footer } from "@/components/Footer";
import { GaPageViewTracker } from "@/components/GaPageViewTracker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "韓国コスメラボ";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} | Olive Young 人気ランキング・韓国コスメ`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "韓国オリーブヤングの人気ランキングや商品情報を日本語で紹介します。カテゴリ・ブランドから韓国コスメを探せます。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {gaId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                gtag('js', new Date());
                gtag('config', '${gaId}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
            <GaPageViewTracker />
          </>
        ) : null}
        <div className="flex min-h-screen flex-col">
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
