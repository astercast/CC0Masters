import type { Metadata } from "next";
import { IBM_Plex_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "cc0masters",
  description: "A leaderboard for cc0mons collectors.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${pressStart.variable} ${plexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
