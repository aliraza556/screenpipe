"use client";

import { useToast } from "@/components/ui/use-toast";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { Progress } from "./ui/progress";
import { AlertCircle, Download } from "lucide-react";

export function ModelDownloadTracker() {
  const { toast, dismiss } = useToast();
  const [activeDownloads, setActiveDownloads] = useState<
    Record<string, boolean>
  >({});
  const [toastIds, setToastIds] = useState<Record<string, string>>({});

  useEffect(() => {
    // Patterns to look for in logs
    const downloadStartPatterns = [
      { regex: /downloading from (.*?)\/([^\/]+)/, group: 2 },
      { regex: /downloading (.*?) file/, group: 1 },
      { regex: /downloading ([^,]+)/, group: 1 },
      { regex: /downloading.*model.*?([\w-]+)/, group: 1 },
      { regex: /downloading model/, group: 1 },
    ];

    const downloadEndPatterns = [
      { regex: /Downloaded (.*?) to/, group: 1 },
      { regex: /successfully downloaded ([^,]+)/, group: 1 },
      { regex: /model ([\w-]+) downloaded/, group: 1 },
      { regex: /model ([\w-]+) downloaded/, group: 1 },
      { regex: /model downloaded/, group: 1 },
    ];

    // Function to extract model name from log line
    const getModelName = (
      line: string,
      patterns: { regex: RegExp; group: number }[]
    ) => {
      for (const pattern of patterns) {
        const match = line.match(pattern.regex);
        if (match && match[pattern.group]) {
          return match[pattern.group].trim();
        }
      }
      return null;
    };

    const unlisten = listen<string>("sidecar_log", (event) => {
      const line = event.payload.toLowerCase();

      // Skip lines that don't look like download related
      if (
        !line.includes("download") &&
        !line.includes("model") &&
        !line.includes("cache")
      ) {
        return;
      }

      // Check for download start
      const modelStarting = getModelName(line, downloadStartPatterns);
      if (modelStarting && !activeDownloads[modelStarting]) {
        console.log(`Detected model download starting: ${modelStarting}`);

        // Show toast for download start
        const id = toast({
          title: "downloading model",
          description: (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span>{modelStarting}</span>
              </div>
              <Progress value={33} className="h-1" />
            </div>
          ),
          duration: Infinity, // Will be manually closed when download completes
        }).id;

        // Store toast ID so we can update it later
        setToastIds((prev) => ({ ...prev, [modelStarting]: id }));
        setActiveDownloads((prev) => ({ ...prev, [modelStarting]: true }));
      }

      // Check for download completion
      const modelCompleted = getModelName(line, downloadEndPatterns);
      if (modelCompleted && activeDownloads[modelCompleted]) {
        console.log(`Detected model download completed: ${modelCompleted}`);

        // Close the "downloading" toast
        if (toastIds[modelCompleted]) {
          dismiss(toastIds[modelCompleted]);
        }

        // Show completion toast
        toast({
          title: "model downloaded",
          description: `${modelCompleted} is ready to use`,
          duration: 3000,
        });

        // Remove from active downloads
        setActiveDownloads((prev) => {
          const newState = { ...prev };
          delete newState[modelCompleted];
          return newState;
        });

        setToastIds((prev) => {
          const newState = { ...prev };
          delete newState[modelCompleted];
          return newState;
        });
      }

      // Also look for general download progress in the logs (may not be available)
      if (line.includes("download") && line.includes("%")) {
        const percentMatch = line.match(/(\d+)%/);
        if (percentMatch && percentMatch[1]) {
          const percent = parseInt(percentMatch[1], 10);
          console.log(`Download progress detected: ${percent}%`);
          // We could use this to update progress bars if we can associate it with a specific model
        }
      }

      // Look for download errors
      if (
        (line.includes("download") || line.includes("model")) &&
        (line.includes("error") ||
          line.includes("failed") ||
          line.includes("timeout"))
      ) {
        toast({
          title: "download error",
          description:
            "there was a problem downloading a model. check logs for details.",
          variant: "destructive",
          duration: 5000,
        });
      }
    });

    return () => {
      unlisten.then((unsubscribe) => unsubscribe());
    };
  }, [toast, dismiss, activeDownloads, toastIds]);

  return null; // This component doesn't render anything
}
