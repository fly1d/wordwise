#[cfg(target_os = "macos")]
mod macos {
    use core_foundation::{
        base::{CFGetTypeID, CFRelease, CFTypeRef, TCFType},
        string::{CFString, CFStringGetTypeID, CFStringRef},
    };
    use std::{ffi::c_void, process::Command};

    type AXUIElementRef = *const c_void;
    type AXError = i32;

    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXUIElementCreateSystemWide() -> AXUIElementRef;
        fn AXUIElementCopyAttributeValue(
            element: AXUIElementRef,
            attribute: CFStringRef,
            value: *mut CFTypeRef,
        ) -> AXError;
    }

    fn accessibility_selection() -> Option<String> {
        unsafe {
            let system = AXUIElementCreateSystemWide();
            if system.is_null() {
                return None;
            }

            let mut focused: CFTypeRef = std::ptr::null();
            let focused_attribute = CFString::new("AXFocusedUIElement");
            let focused_error = AXUIElementCopyAttributeValue(
                system,
                focused_attribute.as_concrete_TypeRef(),
                &mut focused,
            );
            CFRelease(system as CFTypeRef);
            if focused_error != 0 || focused.is_null() {
                return None;
            }

            let mut selected: CFTypeRef = std::ptr::null();
            let selected_attribute = CFString::new("AXSelectedText");
            let selected_error = AXUIElementCopyAttributeValue(
                focused as AXUIElementRef,
                selected_attribute.as_concrete_TypeRef(),
                &mut selected,
            );
            CFRelease(focused);
            if selected_error != 0 || selected.is_null() {
                return None;
            }
            if CFGetTypeID(selected) != CFStringGetTypeID() {
                CFRelease(selected);
                return None;
            }

            let value = CFString::wrap_under_create_rule(selected as CFStringRef).to_string();
            let trimmed = value.trim().to_owned();
            (!trimmed.is_empty()).then_some(trimmed)
        }
    }

    fn clipboard_fallback() -> Result<String, String> {
        let script = r#"
set previousClipboard to the clipboard
try
  tell application "System Events"
    keystroke "c" using command down
  end tell
  delay 0.18
  set selectedText to the clipboard as text
  set the clipboard to previousClipboard
  return selectedText
on error errorMessage number errorNumber
  try
    set the clipboard to previousClipboard
  end try
  error errorMessage number errorNumber
end try
"#;

        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|error| format!("无法启动系统选区读取：{error}"))?;

        if !output.status.success() {
            return Err(
                "无法读取选中文字。请在“系统设置 → 隐私与安全性 → 辅助功能”中允许逐词。".into(),
            );
        }

        let selected = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        if selected.is_empty() {
            Err("没有检测到选中的文字".into())
        } else {
            Ok(selected)
        }
    }

    pub fn capture() -> Result<String, String> {
        accessibility_selection().map_or_else(clipboard_fallback, Ok)
    }
}

#[tauri::command]
pub fn capture_selected_text() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        macos::capture()
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("当前 beta 版本仅支持 macOS 全局划词".into())
    }
}
