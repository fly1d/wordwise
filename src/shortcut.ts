export type SelectionShortcutSettings = {
  enabled: boolean;
  accelerator: string;
};

export type ShortcutKeyEvent = {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export type ShortcutCapture = {
  accelerator?: string;
  error?: string;
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export const SELECTION_SHORTCUT_STORAGE_KEY = "wordwise-selection-shortcut";
export const DEFAULT_SELECTION_SHORTCUT: SelectionShortcutSettings = {
  enabled: true,
  accelerator: "Alt+K",
};

const MODIFIER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

const MODIFIER_ORDER = ["Command", "Control", "Alt", "Shift"] as const;
const RESERVED_SHORTCUTS = new Set([
  "Command+A",
  "Command+F",
  "Command+H",
  "Command+M",
  "Command+N",
  "Command+O",
  "Command+P",
  "Command+Q",
  "Command+S",
  "Command+V",
  "Command+W",
  "Command+X",
  "Command+Z",
  "Command+Shift+Z",
  "Command+Space",
  "Control+C",
  "Control+Space",
]);

const SPECIAL_KEYS: Record<string, string> = {
  Backquote: "Backquote",
  Backslash: "Backslash",
  BracketLeft: "BracketLeft",
  BracketRight: "BracketRight",
  Comma: "Comma",
  Equal: "Equal",
  Minus: "Minus",
  Period: "Period",
  Quote: "Quote",
  Semicolon: "Semicolon",
  Slash: "Slash",
  Space: "Space",
};

const DISPLAY_KEYS: Record<string, string> = {
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Equal: "=",
  Minus: "-",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
  Space: "Space",
};

export function readSelectionShortcutSettings(
  storage?: StorageReader,
): SelectionShortcutSettings {
  try {
    const target = storage ?? localStorage;
    const saved = JSON.parse(
      target.getItem(SELECTION_SHORTCUT_STORAGE_KEY) ?? "{}",
    ) as Partial<SelectionShortcutSettings>;
    const accelerator = typeof saved.accelerator === "string"
      ? validateSelectionShortcut(saved.accelerator).accelerator
      : undefined;

    return {
      enabled: typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_SELECTION_SHORTCUT.enabled,
      accelerator: accelerator ?? DEFAULT_SELECTION_SHORTCUT.accelerator,
    };
  } catch {
    return { ...DEFAULT_SELECTION_SHORTCUT };
  }
}

export function saveSelectionShortcutSettings(
  settings: SelectionShortcutSettings,
  storage?: StorageWriter,
) {
  (storage ?? localStorage).setItem(
    SELECTION_SHORTCUT_STORAGE_KEY,
    JSON.stringify(settings),
  );
}

export function shortcutFromKeyboardEvent(event: ShortcutKeyEvent): ShortcutCapture {
  if (MODIFIER_CODES.has(event.code)) return {};

  const key = keyFromCode(event.code);
  if (!key) return { error: "这个按键不能用于全局快捷键" };

  const modifiers = [
    event.metaKey ? "Command" : "",
    event.ctrlKey ? "Control" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
  ].filter(Boolean);

  return validateSelectionShortcut([...modifiers, key].join("+"));
}

export function validateSelectionShortcut(accelerator: string): ShortcutCapture {
  const tokens = accelerator.split("+").map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) return { error: "请按下一个快捷键" };

  const key = tokens.at(-1) ?? "";
  const modifiers = tokens.slice(0, -1);
  const allowedModifiers = new Set<string>(MODIFIER_ORDER);
  const uniqueModifiers = new Set(modifiers);
  const normalizedKey = normalizeKey(key);

  if (
    uniqueModifiers.size !== modifiers.length
    || modifiers.some((modifier) => !allowedModifiers.has(modifier))
    || !normalizedKey
  ) {
    return { error: "这个快捷键格式无效" };
  }

  const allowsBareFunctionKey = /^F(?:1[3-9]|20)$/.test(normalizedKey);
  const hasPrimaryModifier = modifiers.some((modifier) => (
    modifier === "Command" || modifier === "Control" || modifier === "Alt"
  ));
  if (!allowsBareFunctionKey && !hasPrimaryModifier) {
    return { error: "文字键和 F1-F12 必须搭配 Command、Control 或 Option" };
  }

  const normalizedModifiers = MODIFIER_ORDER.filter((modifier) => (
    uniqueModifiers.has(modifier)
  ));
  const normalizedAccelerator = [...normalizedModifiers, normalizedKey].join("+");
  if (
    (normalizedKey === "C" && uniqueModifiers.has("Command"))
    || RESERVED_SHORTCUTS.has(normalizedAccelerator)
  ) {
    return { error: "这个组合键用于系统或常用操作，请选择其他快捷键" };
  }

  return { accelerator: normalizedAccelerator };
}

export function formatSelectionShortcut(accelerator: string) {
  const symbols: Record<string, string> = {
    Command: "⌘",
    Control: "⌃",
    Alt: "⌥",
    Shift: "⇧",
  };
  return accelerator
    .split("+")
    .map((token) => symbols[token] ?? DISPLAY_KEYS[token] ?? token)
    .join(" ");
}

function keyFromCode(code: string) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1\d|20)$/.test(code)) return code;
  return SPECIAL_KEYS[code];
}

function normalizeKey(key: string) {
  if (/^[A-Za-z]$/.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (/^F(?:[1-9]|1\d|20)$/.test(key.toUpperCase())) return key.toUpperCase();
  return Object.hasOwn(SPECIAL_KEYS, key) ? key : undefined;
}
