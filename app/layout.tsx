import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CC0MASTERS — Who Will Collect Them All?",
  description: "Live leaderboard tracking which wallets are closest to collecting all 260 CC0mon species on Ethereum.",
  openGraph: {
    title: "CC0MASTERS",
    description: "Who will collect all 260 CC0mon species?",
    siteName: "CC0MASTERS",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Syne+Mono&family=Press+Start+2P&display=swap" rel="stylesheet"/>
      </head>
      <body>{children}</body>
    </html>
  );
}
