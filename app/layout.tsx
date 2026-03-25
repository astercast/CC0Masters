import type { Metadata } from "next";
import "./globals.css";

const BASE_URL = 'https://cc0masters.vercel.app';
// Version bump forces Discord/Twitter to re-fetch the OG image cache
const OG_IMAGE = `${BASE_URL}/og-image.png?v=35`;

export const metadata: Metadata = {
  title: "CC0MASTERS — Who Will Collect Them All?",
  description: "Live leaderboard tracking which wallets are closest to collecting all 260 CC0mon species on Ethereum. 9,999 on-chain NFTs. Updated hourly.",
  metadataBase: new URL(BASE_URL),
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: "CC0MASTERS — Who Will Collect Them All?",
    description: "Live leaderboard tracking which wallets are closest to collecting all 260 CC0mon species on Ethereum. 9,999 on-chain NFTs. Updated hourly.",
    siteName: "CC0MASTERS",
    url: BASE_URL,
    type: 'website',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'CC0MASTERS — Live CC0mon collector leaderboard on Ethereum',
        type: 'image/png',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "CC0MASTERS — Who Will Collect Them All?",
    description: "Live leaderboard for CC0mon collectors on Ethereum. 260 species. 9,999 on-chain NFTs. Who has the most?",
    images: [OG_IMAGE],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5"/>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=VT323&family=Silkscreen:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
      </head>
      <body>{children}</body>
    </html>
  );
}
