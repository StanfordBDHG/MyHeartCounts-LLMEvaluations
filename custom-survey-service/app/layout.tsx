import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyHeartCounts Survey Service",
  description: "Custom evaluator survey for motivational nudges"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
