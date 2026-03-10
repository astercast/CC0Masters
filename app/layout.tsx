import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CC0MASTERS — Who Will Catch Them All?",
  description: "Live leaderboard tracking which collectors are closest to completing the full CC0mon set on Ethereum.",
  openGraph: {
    title: "CC0MASTERS",
    description: "Who will catch all 260 CC0mon? Live on-chain Ethereum leaderboard.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
