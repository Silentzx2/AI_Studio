import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/lib/providers";
import { AppearanceProvider } from "@/components/AppearanceProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const geistMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI 3D Studio — Transform Ideas Into Stunning 3D Models",
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
    <html lang="en" suppressHydrationWarning className="dark scroll-smooth">
      <body
        className={`${inter.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground relative overflow-x-hidden`}
      >
        {/* Global app background (solid / gradient / wallpaper) — sits behind all UI */}
        <div
          className="fixed inset-0 pointer-events-none z-[-1]"
          style={{ background: "var(--app-background, transparent)" }}
          aria-hidden="true"
        />
        {/* Global ambient glow - Top Left Purple */}
        <div
          className="fixed top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[hsl(275_95%_65%/0.07)] blur-[180px] rounded-full pointer-events-none z-0"
          aria-hidden="true"
        />
        {/* Global ambient glow - Bottom Right Cyan */}
        <div
          className="fixed bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-[600px] h-[600px] bg-[hsl(190_100%_55%/0.05)] blur-[150px] rounded-full pointer-events-none z-0"
          aria-hidden="true"
        />
        {/* Subtle grid overlay */}
        <div
          className="fixed inset-0 pointer-events-none z-[1] opacity-[0.015] bg-[linear-gradient(hsl(275_95%_65%)_1px,transparent_1px),linear-gradient(90deg,hsl(275_95%_65%)_1px,transparent_1px)] bg-[size:4rem_4rem]"
          aria-hidden="true"
        />
        {/* Cinematic vignette */}
        <div
          className="fixed inset-0 pointer-events-none z-[2] [box-shadow:inset_0_0_150px_rgba(0,0,0,0.7)]"
          aria-hidden="true"
        />
        <AppearanceProvider>
          <Providers>
            <div className="relative z-10 min-h-screen flex flex-col">
              {children}
            </div>
          </Providers>
        </AppearanceProvider>
      </body>
    </html>
  );
}
