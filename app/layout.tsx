import type { Metadata } from "next";
import "./globals.css";

const BASE_URL = 'https://cc0masters.vercel.app';

export const metadata: Metadata = {
  title: "CC0MASTERS — Who Will Collect Them All?",
  description: "Live leaderboard tracking which wallets are closest to collecting all 260 CC0mon species on Ethereum. 9,999 on-chain NFTs.",
  metadataBase: new URL(BASE_URL),
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: "CC0MASTERS — Who Will Collect Them All?",
    description: "Live leaderboard tracking which wallets are closest to collecting all 260 CC0mon species on Ethereum. 9,999 on-chain NFTs.",
    siteName: "CC0MASTERS",
    url: BASE_URL,
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CC0MASTERS — CC0mon collector leaderboard',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "CC0MASTERS — Who Will Collect Them All?",
    description: "Live leaderboard tracking which wallets are closest to collecting all 260 CC0mon species on Ethereum.",
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=VT323&family=Silkscreen:wght@400;700&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
      </head>
      <body>{children}</body>
    </html>
  );
}
