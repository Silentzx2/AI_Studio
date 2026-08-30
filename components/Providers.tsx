"use client";

import { ActivityLogger } from "@/components/ActivityLogger";
import { WorkspaceProvider } from "@/features/new-workspace/store/WorkspaceContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <ActivityLogger />
      <WorkspaceProvider>
        <div className="relative z-10 min-h-screen flex flex-col">
          {children}
        </div>
        <Toaster position="bottom-right" richColors />
      </WorkspaceProvider>
    </TooltipProvider>
  );
}
