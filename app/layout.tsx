import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Velocity Keys",
  description: "Real-time multiplayer typing races with skill-based matchmaking, ghost replay, practice, and analytics."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
