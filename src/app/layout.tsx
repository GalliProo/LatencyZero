import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LatencyZero — Competitive Latency Observability Platform",
  description: "Professional diagnostic scanner for esports PCs. Real-time DPC/ISR, frametime, network, hardware, and input latency monitoring built for competitive players.",
  keywords: ["esports", "latency", "DPC", "ISR", "frametime", "competitive", "monitoring", "gaming", "Windows 11"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0f] text-gray-200`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}