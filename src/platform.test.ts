import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: { state: "Released" | "Pressed" }) => Promise<void>>(),
  invoke: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  show: vi.fn(),
  setFocus: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ show: mocks.show, setFocus: mocks.setFocus }),
}));

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: mocks.register,
  unregister: mocks.unregister,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.handlers.clear();
  mocks.invoke.mockReset();
  mocks.register.mockReset();
  mocks.unregister.mockReset();
  mocks.show.mockReset().mockResolvedValue(undefined);
  mocks.setFocus.mockReset().mockResolvedValue(undefined);
  mocks.unregister.mockImplementation(async (shortcut: string) => {
    mocks.handlers.delete(shortcut);
  });
  mocks.register.mockImplementation(async (
    shortcut: string,
    handler: (event: { state: "Released" | "Pressed" }) => Promise<void>,
  ) => {
    mocks.handlers.set(shortcut, handler);
  });
});

describe("selection shortcut registration", () => {
  it("serially replaces and disables the active shortcut", async () => {
    const { configureSelectionShortcut } = await import("./platform");
    const onSelection = vi.fn();
    const onError = vi.fn();

    await configureSelectionShortcut("Alt+K", onSelection, onError);
    await configureSelectionShortcut("Alt+J", onSelection, onError);
    await configureSelectionShortcut(null, onSelection, onError);

    expect(mocks.register.mock.calls.map(([shortcut]) => shortcut)).toEqual([
      "Alt+K",
      "Alt+J",
    ]);
    expect(mocks.unregister.mock.calls.map(([shortcut]) => shortcut)).toEqual([
      "Alt+K",
      "Alt+J",
    ]);
  });

  it("restores the previous shortcut when a replacement fails", async () => {
    const { configureSelectionShortcut } = await import("./platform");
    const onSelection = vi.fn();
    const onError = vi.fn();
    mocks.register.mockImplementation(async (
      shortcut: string,
      handler: (event: { state: "Released" | "Pressed" }) => Promise<void>,
    ) => {
      if (shortcut === "Alt+J") throw new Error("occupied");
      mocks.handlers.set(shortcut, handler);
    });

    await configureSelectionShortcut("Alt+K", onSelection, onError);
    await expect(
      configureSelectionShortcut("Alt+J", onSelection, onError),
    ).rejects.toThrow("occupied");

    expect(mocks.register.mock.calls.map(([shortcut]) => shortcut)).toEqual([
      "Alt+K",
      "Alt+J",
      "Alt+K",
    ]);

    mocks.invoke.mockResolvedValue("restored shortcut");
    await mocks.handlers.get("Alt+K")?.({ state: "Pressed" });
    expect(onSelection).toHaveBeenCalledWith("restored shortcut");
  });

  it("reports when both replacement and rollback registration fail", async () => {
    const {
      configureSelectionShortcut,
      SelectionShortcutConfigurationError,
    } = await import("./platform");
    const onSelection = vi.fn();
    const onError = vi.fn();
    let initialRegistrationDone = false;
    mocks.register.mockImplementation(async (
      shortcut: string,
      handler: (event: { state: "Released" | "Pressed" }) => Promise<void>,
    ) => {
      if (shortcut === "Alt+K" && !initialRegistrationDone) {
        initialRegistrationDone = true;
        mocks.handlers.set(shortcut, handler);
        return;
      }
      throw new Error("registration unavailable");
    });

    await configureSelectionShortcut("Alt+K", onSelection, onError);
    const replacement = configureSelectionShortcut("Alt+J", onSelection, onError);

    await expect(replacement).rejects.toBeInstanceOf(SelectionShortcutConfigurationError);
    await expect(replacement).rejects.toMatchObject({ activeAccelerator: null });
  });

  it("captures selected text only for the pressed event", async () => {
    const { configureSelectionShortcut } = await import("./platform");
    const onSelection = vi.fn();
    const onError = vi.fn();
    mocks.invoke.mockResolvedValue("Selected API documentation");

    await configureSelectionShortcut("Alt+K", onSelection, onError);
    const handler = mocks.handlers.get("Alt+K");
    await handler?.({ state: "Released" });
    await handler?.({ state: "Pressed" });

    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.setFocus).toHaveBeenCalledOnce();
    expect(onSelection).toHaveBeenCalledWith("Selected API documentation");
    expect(onError).not.toHaveBeenCalled();
  });

  it("shows the app before reporting a selection error", async () => {
    const { configureSelectionShortcut } = await import("./platform");
    const onSelection = vi.fn();
    const onError = vi.fn();
    mocks.invoke.mockRejectedValue("没有检测到选中的文字");

    await configureSelectionShortcut("Alt+K", onSelection, onError);
    await mocks.handlers.get("Alt+K")?.({ state: "Pressed" });

    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.setFocus).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith("没有检测到选中的文字");
    expect(onSelection).not.toHaveBeenCalled();
  });

  it("prevents concurrent selection capture and translation", async () => {
    const { configureSelectionShortcut } = await import("./platform");
    const onSelection = vi.fn();
    const onError = vi.fn();
    let resolveCapture: (text: string) => void = () => undefined;
    mocks.invoke.mockImplementation(() => new Promise<string>((resolve) => {
      resolveCapture = resolve;
    }));

    await configureSelectionShortcut("Alt+K", onSelection, onError);
    const handler = mocks.handlers.get("Alt+K");
    const firstPress = handler?.({ state: "Pressed" });
    const secondPress = handler?.({ state: "Pressed" });

    expect(mocks.invoke).toHaveBeenCalledOnce();
    resolveCapture("one selection");
    await Promise.all([firstPress, secondPress]);
    expect(onSelection).toHaveBeenCalledOnce();
    expect(onSelection).toHaveBeenCalledWith("one selection");
  });

  it("continues translation and reports when the app window cannot open", async () => {
    const { configureSelectionShortcut } = await import("./platform");
    const onSelection = vi.fn();
    const onError = vi.fn();
    mocks.invoke.mockResolvedValue("Selected API documentation");
    mocks.show.mockRejectedValue(new Error("window unavailable"));

    await configureSelectionShortcut("Alt+K", onSelection, onError);
    await mocks.handlers.get("Alt+K")?.({ state: "Pressed" });

    expect(mocks.setFocus).toHaveBeenCalledOnce();
    expect(onSelection).toHaveBeenCalledWith("Selected API documentation");
    expect(onError).toHaveBeenCalledWith("已读取选中文字，但无法打开逐词窗口");
  });

  it("converts selection callback failures into a visible error", async () => {
    const { configureSelectionShortcut } = await import("./platform");
    const onSelection = vi.fn().mockRejectedValue(new Error("render failed"));
    const onError = vi.fn();
    mocks.invoke.mockResolvedValue("Selected API documentation");

    await configureSelectionShortcut("Alt+K", onSelection, onError);
    await mocks.handlers.get("Alt+K")?.({ state: "Pressed" });

    expect(onError).toHaveBeenCalledWith("无法处理选中的文字");
  });
});
