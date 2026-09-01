import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Velocity Keys",
  description: "Real-time multiplayer typing races with ELO matchmaking, ghost replay, practice, and analytics."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
