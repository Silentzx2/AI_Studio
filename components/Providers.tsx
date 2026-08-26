"use client";

import { AppearanceProvider } from "@/components/AppearanceProvider";
import { ActivityLogger } from "@/components/ActivityLogger";
import { WorkspaceProvider } from "@/features/new-workspace/store/WorkspaceContext";
import { ThemeEffect } from "@/stores/useThemeStore";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppearanceProvider>
      <ActivityLogger />
      <ThemeEffect />
      <WorkspaceProvider>
        <div className="relative z-10 min-h-screen flex flex-col">
          {children}
        </div>
      </WorkspaceProvider>
    </AppearanceProvider>
  );
}
