import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI 3D Studio — 3D Models",
  description:
    "Generate production-ready 3D assets from text prompts or reference images with AI. Professional tools for game developers, artists, and creators.",
  keywords: [
    "AI 3D",
    "3D generation",
    "text to 3D",
    "image to 3D",
    "Blender",
    "Unreal Engine",
    "Unity",
    "Maya",
    "AI",
    "3D models",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark scroll-smooth" data-scroll-behavior="smooth">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground relative overflow-x-hidden`}
      >
        {/* Global app background (solid / gradient / wallpaper) — sits behind all UI */}
        <div
          className="fixed inset-0 pointer-events-none z-[-1]"
          style={{ background: "var(--app-background, transparent)" }}
          aria-hidden="true"
        />
        {/* Global ambient glow - Top Left Purple */}
        <div
          className="fixed top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[hsl(var(--neon-purple)/0.07)] blur-[180px] rounded-full pointer-events-none z-0"
          aria-hidden="true"
        />
        {/* Global ambient glow - Bottom Right Cyan */}
        <div
          className="fixed bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-[600px] h-[600px] bg-[hsl(var(--neon-cyan)/0.05)] blur-[150px] rounded-full pointer-events-none z-0"
          aria-hidden="true"
        />
        {/* Subtle grid overlay */}
        <div
          className="fixed inset-0 pointer-events-none z-[1] opacity-[0.015] bg-[linear-gradient(hsl(var(--neon-purple))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--neon-purple))_1px,transparent_1px)] bg-[size:4rem_4rem]"
          aria-hidden="true"
        />
        {/* Cinematic vignette */}
        <div
          className="fixed inset-0 pointer-events-none z-[2] [box-shadow:inset_0_0_150px_hsl(var(--surface-0))]"
          aria-hidden="true"
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
