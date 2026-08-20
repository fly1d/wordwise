import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SELECTION_SHORTCUT,
  formatSelectionShortcut,
  readSelectionShortcutSettings,
  saveSelectionShortcutSettings,
  SELECTION_SHORTCUT_STORAGE_KEY,
  shortcutFromKeyboardEvent,
  validateSelectionShortcut,
} from "./shortcut";

describe("selection shortcut settings", () => {
  it("uses the safe default when no preference is stored", () => {
    expect(readSelectionShortcutSettings({ getItem: () => null })).toEqual(
      DEFAULT_SELECTION_SHORTCUT,
    );
  });

  it("uses the safe default when storage cannot be read", () => {
    expect(readSelectionShortcutSettings({
      getItem: () => { throw new DOMException("blocked", "SecurityError"); },
    })).toEqual(DEFAULT_SELECTION_SHORTCUT);
  });

  it("keeps the enabled preference but rejects an unsafe stored key", () => {
    const storage = {
      getItem: () => JSON.stringify({ enabled: false, accelerator: "K" }),
    };

    expect(readSelectionShortcutSettings(storage)).toEqual({
      enabled: false,
      accelerator: "Alt+K",
    });
  });

  it("persists only the shortcut preference", () => {
    const setItem = vi.fn();
    saveSelectionShortcutSettings(
      { enabled: true, accelerator: "Command+Shift+J" },
      { setItem },
    );

    expect(setItem).toHaveBeenCalledWith(
      SELECTION_SHORTCUT_STORAGE_KEY,
      JSON.stringify({ enabled: true, accelerator: "Command+Shift+J" }),
    );
  });
});

describe("shortcut capture", () => {
  it("captures Option+K using the physical key code", () => {
    expect(shortcutFromKeyboardEvent({
      code: "KeyK",
      metaKey: false,
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
    })).toEqual({ accelerator: "Alt+K" });
  });

  it("waits while the user is holding only a modifier", () => {
    expect(shortcutFromKeyboardEvent({
      code: "AltLeft",
      metaKey: false,
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
    })).toEqual({});
  });

  it("rejects bare and Shift-only printable keys", () => {
    expect(validateSelectionShortcut("K").error).toContain("Option");
    expect(validateSelectionShortcut("Shift+K").error).toContain("Option");
  });

  it("rejects copy and other high-risk system shortcuts", () => {
    expect(validateSelectionShortcut("Command+C").error).toContain("系统");
    expect(validateSelectionShortcut("Alt+Command+C").error).toContain("系统");
    expect(validateSelectionShortcut("Command+Q").error).toContain("系统");
    expect(validateSelectionShortcut("Control+Space").error).toContain("系统");
  });

  it("normalizes modifier order", () => {
    expect(validateSelectionShortcut("Shift+Alt+J")).toEqual({
      accelerator: "Alt+Shift+J",
    });
  });

  it("allows a bare function key", () => {
    expect(validateSelectionShortcut("F13")).toEqual({ accelerator: "F13" });
  });

  it("requires a primary modifier for standard Mac function keys", () => {
    expect(validateSelectionShortcut("F5").error).toContain("F1-F12");
    expect(validateSelectionShortcut("Shift+F5").error).toContain("F1-F12");
    expect(validateSelectionShortcut("Alt+F5")).toEqual({ accelerator: "Alt+F5" });
  });

  it("formats macOS modifiers for display", () => {
    expect(formatSelectionShortcut("Command+Control+Alt+Shift+K")).toBe("⌘ ⌃ ⌥ ⇧ K");
  });
});
