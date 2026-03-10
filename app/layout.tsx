import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CC0MASTERS — Who Will Catch Them All?",
  description: "Live leaderboard tracking which collectors are closest to completing the full CC0mon set on Ethereum.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, background: '#070f07' }}>
        {children}
      </body>
    </html>
  );
}
