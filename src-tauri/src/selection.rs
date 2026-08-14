#[cfg(target_os = "macos")]
mod macos {
    use core_foundation::{
        base::{CFGetTypeID, CFRelease, CFTypeRef, TCFType},
        string::{CFString, CFStringGetTypeID, CFStringRef},
    };
    use std::{ffi::c_void, process::Command};

    type AXUIElementRef = *const c_void;
    type AXError = i32;
    const NO_SELECTION_MARKER: &str = "__WORDWISE_NO_SELECTION_5E715CF9__";

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
        // Seed the clipboard so a no-op copy cannot return stale user content.
        let script = format!(
            r#"
set previousClipboard to the clipboard
set sentinel to "{NO_SELECTION_MARKER}"
try
  set the clipboard to sentinel
  tell application "System Events"
    keystroke "c" using command down
  end tell
  set selectedText to sentinel
  repeat 10 times
    delay 0.05
    try
      set selectedText to the clipboard as text
    on error
      set selectedText to sentinel
    end try
    if selectedText is not sentinel then exit repeat
  end repeat
  set the clipboard to previousClipboard
  if selectedText is sentinel then return sentinel
  return selectedText
on error errorMessage number errorNumber
  try
    set the clipboard to previousClipboard
  end try
  error errorMessage number errorNumber
end try
"#
        );

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|error| format!("无法启动系统选区读取：{error}"))?;

        if !output.status.success() {
            return Err(
                "无法读取选中文字。请在“系统设置 → 隐私与安全性 → 辅助功能”中允许逐词。".into(),
            );
        }

        parse_clipboard_output(&output.stdout)
    }

    fn parse_clipboard_output(stdout: &[u8]) -> Result<String, String> {
        let selected = String::from_utf8_lossy(stdout).trim().to_owned();
        if selected == NO_SELECTION_MARKER {
            return Err("没有检测到选中的文字".into());
        }
        if selected.is_empty() {
            Err("没有检测到选中的文字".into())
        } else {
            Ok(selected)
        }
    }

    pub fn capture() -> Result<String, String> {
        accessibility_selection().map_or_else(clipboard_fallback, Ok)
    }

    #[cfg(test)]
    mod tests {
        use super::{parse_clipboard_output, NO_SELECTION_MARKER};

        #[test]
        fn rejects_unchanged_clipboard_marker() {
            assert_eq!(
                parse_clipboard_output(NO_SELECTION_MARKER.as_bytes()).unwrap_err(),
                "没有检测到选中的文字"
            );
        }

        #[test]
        fn trims_copied_selection() {
            assert_eq!(
                parse_clipboard_output(b"  underlying code\n").unwrap(),
                "underlying code"
            );
        }

        #[test]
        fn rejects_empty_clipboard_output() {
            assert_eq!(
                parse_clipboard_output(b" \n").unwrap_err(),
                "没有检测到选中的文字"
            );
        }
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
