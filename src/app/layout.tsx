import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Raid Planner",
  description: "Raid & Absence Planner",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
