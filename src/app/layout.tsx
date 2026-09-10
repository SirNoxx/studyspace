import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./enhancements.css";
import "@/components/social/community.css";
import "katex/dist/katex.min.css";
export const metadata: Metadata = {
  title: "Studyspace — A place for understanding",
  description: "Your notes, connected to a deeper understanding.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
