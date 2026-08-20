import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import type { EngineSettings, ServerStatus, TranslationResult } from "./types";

export const isDesktopApp = isTauri();

type SelectionShortcutRegistration = {
  accelerator: string;
  onSelection: (text: string) => void | Promise<void>;
  onError: (message: string) => void;
};

export class SelectionShortcutConfigurationError extends Error {
  readonly activeAccelerator: string | null;

  constructor(activeAccelerator: string | null, cause: unknown) {
    const message = cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "全局快捷键配置失败";
    super(message, { cause });
    this.name = "SelectionShortcutConfigurationError";
    this.activeAccelerator = activeAccelerator;
  }
}

let activeSelectionShortcut: SelectionShortcutRegistration | null = null;
let selectionShortcutQueue = Promise.resolve();
let selectionCaptureInFlight = false;

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

export function configureSelectionShortcut(
  accelerator: string | null,
  onSelection: (text: string) => void | Promise<void>,
  onError: (message: string) => void,
) {
  if (!isDesktopApp) return Promise.resolve();

  const next = accelerator ? { accelerator, onSelection, onError } : null;
  const operation = selectionShortcutQueue.then(async () => {
    const previous = activeSelectionShortcut;
    if (previous?.accelerator === next?.accelerator) {
      activeSelectionShortcut = next;
      return;
    }

    try {
      if (previous) {
        await unregister(previous.accelerator);
        activeSelectionShortcut = null;
      }
      if (!next) return;

      await register(next.accelerator, createSelectionShortcutHandler(next.accelerator));
      activeSelectionShortcut = next;
    } catch (cause) {
      if (previous && activeSelectionShortcut === null) {
        try {
          await register(
            previous.accelerator,
            createSelectionShortcutHandler(previous.accelerator),
          );
          activeSelectionShortcut = previous;
        } catch {
          activeSelectionShortcut = null;
        }
      }
      throw new SelectionShortcutConfigurationError(
        activeSelectionShortcut?.accelerator ?? null,
        cause,
      );
    }
  });

  selectionShortcutQueue = operation.catch(() => undefined);
  return operation;
}

function createSelectionShortcutHandler(accelerator: string) {
  return async (event: { state: "Released" | "Pressed" }) => {
    if (event.state !== "Pressed" || selectionCaptureInFlight) return;
    const registration = activeSelectionShortcut;
    if (!registration || registration.accelerator !== accelerator) return;

    selectionCaptureInFlight = true;
    try {
      let selectedText: string;
      try {
        selectedText = await invoke<string>("capture_selected_text");
      } catch (error) {
        await showAndFocusAppWindow();
        reportSelectionError(
          registration,
          typeof error === "string" ? error : "无法读取选中的文字",
        );
        return;
      }

      const windowReady = await showAndFocusAppWindow();
      try {
        await registration.onSelection(selectedText);
      } catch {
        reportSelectionError(registration, "无法处理选中的文字");
      }
      if (!windowReady) {
        reportSelectionError(registration, "已读取选中文字，但无法打开逐词窗口");
      }
    } finally {
      selectionCaptureInFlight = false;
    }
  };
}

async function showAndFocusAppWindow() {
  try {
    const appWindow = getCurrentWindow();
    const shown = await appWindow.show().then(() => true).catch(() => false);
    const focused = await appWindow.setFocus().then(() => true).catch(() => false);
    return shown && focused;
  } catch {
    return false;
  }
}

function reportSelectionError(
  registration: SelectionShortcutRegistration,
  message: string,
) {
  try {
    registration.onError(message);
  } catch {
    // A UI callback must not leave the global shortcut channel rejected.
  }
}
