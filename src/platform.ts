import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import type { EngineSettings, ServerStatus, TranslationResult } from "./types";

const SELECTION_SHORTCUT = "Alt+T";

export const isDesktopApp = isTauri();

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "请求失败");
  return body;
}

export async function getEngineStatus(): Promise<ServerStatus> {
  if (isDesktopApp) return invoke<ServerStatus>("desktop_status");
  return parseResponse<ServerStatus>(await fetch("/api/status"));
}

export async function requestTranslation(text: string, settings: EngineSettings) {
  if (isDesktopApp) {
    return invoke<TranslationResult>("desktop_translate", {
      request: { text, settings },
    });
  }

  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, settings }),
  });
  return parseResponse<TranslationResult>(response);
}

export async function registerSelectionShortcut(
  onSelection: (text: string) => void | Promise<void>,
  onError: (message: string) => void,
) {
  if (!isDesktopApp) return () => undefined;

  await unregister(SELECTION_SHORTCUT).catch(() => undefined);
  await register(SELECTION_SHORTCUT, async (event) => {
    if (event.state !== "Pressed") return;
    try {
      const selectedText = await invoke<string>("capture_selected_text");
      const appWindow = getCurrentWindow();
      await appWindow.show();
      await appWindow.setFocus();
      await onSelection(selectedText);
    } catch (error) {
      const message = typeof error === "string" ? error : "无法读取选中的文字";
      onError(message);
    }
  });

  return () => {
    void unregister(SELECTION_SHORTCUT).catch(() => undefined);
  };
}
