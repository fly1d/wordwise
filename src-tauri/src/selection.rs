#[cfg(target_os = "macos")]
mod clipboard_policy;
#[cfg(target_os = "macos")]
mod macos_pasteboard;

#[cfg(target_os = "macos")]
mod macos {
    use super::macos_pasteboard::{PasteboardError, PasteboardSession};
    use core_foundation::{
        base::{CFGetTypeID, CFRelease, CFTypeRef, TCFType},
        string::{CFString, CFStringGetTypeID, CFStringRef},
    };
    use std::{
        cell::RefCell,
        ffi::c_void,
        os::unix::process::ExitStatusExt,
        process::{Child, Command, Stdio},
        sync::atomic::{AtomicBool, AtomicU64, Ordering},
        thread,
        time::{Duration, Instant},
    };

    type AXUIElementRef = *const c_void;
    type AXError = i32;
    static NEXT_TRANSACTION_ID: AtomicU64 = AtomicU64::new(1);
    static FALLBACK_QUARANTINED: AtomicBool = AtomicBool::new(false);
    const COPY_SCRIPT: &str =
        r#"tell application "System Events" to key code 8 using command down"#;
    const COPY_COMMAND_TIMEOUT: Duration = Duration::from_secs(15);
    const COPY_COMMAND_POLL_INTERVAL: Duration = Duration::from_millis(10);
    const COPY_FAILURE_SETTLE_INTERVAL: Duration = Duration::from_millis(100);

    thread_local! {
        static PENDING_FALLBACK: RefCell<Option<PendingFallback>> = const { RefCell::new(None) };
    }

    pub(super) enum CaptureStart {
        Selected(String),
        Fallback(FallbackCapture),
    }

    pub(super) struct FallbackCapture {
        transaction_id: u64,
        deadline: Instant,
        child: Option<Child>,
        cleanup_app: Option<tauri::AppHandle>,
    }

    pub(super) struct ReadyFallback {
        transaction_id: u64,
        command_result: Result<(), CopyCommandFailure>,
    }

    struct PendingFallback {
        transaction_id: u64,
        session: PasteboardSession,
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum CopyCommandFailure {
        SpawnFailed,
        Rejected,
        UnsafeTermination,
    }

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
            trimmed_selection(Some(value)).ok()
        }
    }

    impl FallbackCapture {
        pub(super) fn transaction_id(&self) -> u64 {
            self.transaction_id
        }

        pub(super) fn wait(mut self) -> ReadyFallback {
            let child = self
                .child
                .take()
                .expect("fallback child must exist until the watchdog starts");
            let _ = self.cleanup_app.take();
            ReadyFallback {
                transaction_id: self.transaction_id,
                command_result: wait_for_copy_command(child, self.deadline),
            }
        }
    }

    impl Drop for FallbackCapture {
        fn drop(&mut self) {
            let Some(child) = self.child.take() else {
                return;
            };

            terminate_and_reap(child);
            FALLBACK_QUARANTINED.store(true, Ordering::Release);
            if let Some(app) = self.cleanup_app.take() {
                let transaction_id = self.transaction_id;
                let _ = app.run_on_main_thread(move || {
                    quarantine_transaction(transaction_id);
                });
            }
        }
    }

    impl ReadyFallback {
        pub(super) fn finish(self) -> Result<String, String> {
            objc2::rc::autoreleasepool(|_| finish_fallback(self))
        }
    }

    fn begin_fallback(app: tauri::AppHandle) -> Result<CaptureStart, String> {
        if FALLBACK_QUARANTINED.load(Ordering::Acquire) {
            return Err(quarantined_fallback_message());
        }
        if pending_fallback_exists() {
            return Err("正在读取上一段选区，请稍后重试".into());
        }

        let session = PasteboardSession::begin().map_err(pasteboard_message)?;
        if !session.original_is_current().map_err(pasteboard_message)? {
            return Err(pasteboard_message(PasteboardError::SnapshotUnstable));
        }

        let child = match Command::new("/usr/bin/osascript")
            .arg("-e")
            .arg(COPY_SCRIPT)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => child,
            Err(_) => {
                return Err(copy_command_failure_message(
                    &session,
                    CopyCommandFailure::SpawnFailed,
                ))
            }
        };

        let transaction_id = NEXT_TRANSACTION_ID.fetch_add(1, Ordering::Relaxed);
        let deadline = Instant::now() + COPY_COMMAND_TIMEOUT;
        PENDING_FALLBACK.with(|pending| {
            *pending.borrow_mut() = Some(PendingFallback {
                transaction_id,
                session,
            });
        });

        Ok(CaptureStart::Fallback(FallbackCapture {
            transaction_id,
            deadline,
            child: Some(child),
            cleanup_app: Some(app),
        }))
    }

    fn finish_fallback(ready: ReadyFallback) -> Result<String, String> {
        let pending = take_pending_fallback(ready.transaction_id)?;
        if matches!(
            ready.command_result,
            Err(CopyCommandFailure::UnsafeTermination)
        ) {
            return Err(quarantine_after_dispatched_copy(
                "System Events 选区读取未能正常结束。".into(),
            ));
        }

        if let Err(failure) = ready.command_result {
            return Err(copy_command_failure_message(&pending.session, failure));
        }

        let candidate = match pending.session.wait_for_copy() {
            Ok(candidate) => candidate,
            Err(PasteboardError::NoSelection) => {
                return Err(quarantine_after_dispatched_copy(
                    "没有检测到选中的文字。".into(),
                ))
            }
            Err(error) => {
                return Err(quarantine_after_dispatched_copy(
                    pasteboard_quarantine_reason(error).into(),
                ))
            }
        };

        let text = pending.session.read_text(candidate);
        if matches!(text, Err(PasteboardError::ConcurrentChange)) {
            return Err(quarantine_after_dispatched_copy(
                pasteboard_quarantine_reason(PasteboardError::ConcurrentChange).into(),
            ));
        }

        if let Err(error) = pending.session.restore(candidate) {
            return Err(quarantine_after_dispatched_copy(
                pasteboard_quarantine_reason(error).into(),
            ));
        }

        match text {
            Ok(text) => trimmed_selection(text),
            Err(error) => Err(quarantine_after_dispatched_copy(
                pasteboard_quarantine_reason(error).into(),
            )),
        }
    }

    fn pending_fallback_exists() -> bool {
        PENDING_FALLBACK.with(|pending| pending.borrow().is_some())
    }

    fn take_pending_fallback(transaction_id: u64) -> Result<PendingFallback, String> {
        PENDING_FALLBACK.with(|pending| {
            let mut pending = pending.borrow_mut();
            match pending.as_ref() {
                Some(value) if value.transaction_id == transaction_id => {
                    Ok(pending.take().expect("matching transaction must exist"))
                }
                Some(_) => Err("选区读取事务已过期，未更改当前剪贴板，请重试".into()),
                None => Err("选区读取事务已结束，请重试".into()),
            }
        })
    }

    fn wait_for_copy_command(
        mut child: Child,
        deadline: Instant,
    ) -> Result<(), CopyCommandFailure> {
        loop {
            match child.try_wait() {
                Ok(Some(status)) if status.success() => return Ok(()),
                Ok(Some(status)) if status.signal().is_some() => {
                    return Err(CopyCommandFailure::UnsafeTermination)
                }
                Ok(Some(_)) => return Err(CopyCommandFailure::Rejected),
                Ok(None) => {
                    let remaining = deadline.saturating_duration_since(Instant::now());
                    if remaining.is_zero() {
                        terminate_and_reap(child);
                        thread::sleep(COPY_FAILURE_SETTLE_INTERVAL);
                        return Err(CopyCommandFailure::UnsafeTermination);
                    }
                    thread::sleep(remaining.min(COPY_COMMAND_POLL_INTERVAL));
                }
                Err(_) => {
                    terminate_and_reap(child);
                    thread::sleep(COPY_FAILURE_SETTLE_INTERVAL);
                    return Err(CopyCommandFailure::UnsafeTermination);
                }
            }
        }
    }

    fn terminate_and_reap(mut child: Child) {
        if child.kill().is_ok() {
            let _ = child.wait();
            return;
        }

        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }

        let _ = thread::Builder::new()
            .name("wordwise-osascript-reaper".into())
            .spawn(move || {
                let _ = child.kill();
                let _ = child.wait();
            });
    }

    fn copy_command_failure_message(
        session: &PasteboardSession,
        failure: CopyCommandFailure,
    ) -> String {
        match session.original_is_current() {
            Ok(false) => return pasteboard_message(PasteboardError::ConcurrentChange),
            Err(error) => return pasteboard_message(error),
            Ok(true) => {}
        }

        match failure {
            CopyCommandFailure::SpawnFailed => {
                "无法启动 System Events 选区读取，请重试"
            }
            CopyCommandFailure::Rejected => {
                "无法发送复制快捷键。请在“系统设置 → 隐私与安全性 → 自动化”中允许逐词控制 System Events。"
            }
            CopyCommandFailure::UnsafeTermination => return quarantined_fallback_message(),
        }
        .into()
    }

    fn quarantined_fallback_message() -> String {
        "无法确认 System Events 不会再发送复制事件。为避免影响下一次划词，本次运行已禁用复制回退；请检查当前剪贴板，然后退出并重新打开逐词。"
            .into()
    }

    fn quarantine_after_dispatched_copy(reason: String) -> String {
        FALLBACK_QUARANTINED.store(true, Ordering::Release);
        format!("{reason} {}", quarantined_fallback_message())
    }

    fn quarantine_transaction(transaction_id: u64) {
        FALLBACK_QUARANTINED.store(true, Ordering::Release);
        PENDING_FALLBACK.with(|pending| {
            let mut pending = pending.borrow_mut();
            if pending
                .as_ref()
                .is_some_and(|value| value.transaction_id == transaction_id)
            {
                pending.take();
            }
        });
    }

    fn trimmed_selection(value: Option<String>) -> Result<String, String> {
        let selected = value.unwrap_or_default().trim().to_owned();
        if selected.is_empty() {
            Err("没有检测到选中的文字".into())
        } else {
            Ok(selected)
        }
    }

    fn pasteboard_message(error: PasteboardError) -> String {
        match error {
            PasteboardError::SnapshotUnstable => {
                "剪贴板正在变化。为避免覆盖其他应用的新内容，本次划词已取消，请重试。"
            }
            PasteboardError::SnapshotIncomplete => {
                "无法安全保存当前剪贴板的全部格式，因此未执行复制。请稍后重试。"
            }
            PasteboardError::SnapshotTooLarge => {
                "当前剪贴板内容过大，无法安全执行复制回退。请清理剪贴板后重试。"
            }
            PasteboardError::NativeAccess => "无法安全访问系统剪贴板，本次划词已取消，请重试。",
            PasteboardError::NoSelection => "没有检测到选中的文字",
            PasteboardError::ConcurrentChange => {
                "检测到剪贴板发生额外或意外变化。为避免继续覆盖或翻译无关内容，本次划词已取消，请重试。"
            }
            PasteboardError::RestoreBuildFailed => {
                "无法准备完整的剪贴板恢复数据，因此未执行复制。请稍后重试。"
            }
            PasteboardError::RestoreFailed => {
                "无法完整恢复原剪贴板，本次选中文字不会用于翻译。请检查剪贴板内容后重试。"
            }
        }
        .into()
    }

    fn pasteboard_quarantine_reason(error: PasteboardError) -> &'static str {
        match error {
            PasteboardError::SnapshotUnstable => "剪贴板状态无法保持稳定。",
            PasteboardError::SnapshotIncomplete => "无法确认剪贴板快照仍然完整。",
            PasteboardError::SnapshotTooLarge => "剪贴板状态超出安全处理范围。",
            PasteboardError::NativeAccess => "无法安全访问系统剪贴板。",
            PasteboardError::NoSelection => "没有检测到选中的文字。",
            PasteboardError::ConcurrentChange => "检测到剪贴板发生额外或意外变化。",
            PasteboardError::RestoreBuildFailed => "无法准备完整的剪贴板恢复数据。",
            PasteboardError::RestoreFailed => "无法完整恢复原剪贴板。",
        }
    }

    pub(super) fn begin_capture(app: tauri::AppHandle) -> Result<CaptureStart, String> {
        if let Some(selection) = accessibility_selection() {
            return Ok(CaptureStart::Selected(selection));
        }

        objc2::rc::autoreleasepool(|_| begin_fallback(app))
    }

    pub(super) fn quarantine_fallback(transaction_id: u64) -> String {
        quarantine_transaction(transaction_id);
        quarantined_fallback_message()
    }

    #[cfg(test)]
    mod tests {
        use super::{
            pasteboard_message, pasteboard_quarantine_reason, trimmed_selection,
            wait_for_copy_command, CopyCommandFailure, PasteboardError,
        };
        use std::{
            process::Command,
            time::{Duration, Instant},
        };

        #[test]
        fn trims_copied_selection() {
            assert_eq!(
                trimmed_selection(Some("  underlying code\n".into())).unwrap(),
                "underlying code"
            );
        }

        #[test]
        fn rejects_missing_or_empty_selection() {
            assert_eq!(trimmed_selection(None).unwrap_err(), "没有检测到选中的文字");
            assert_eq!(
                trimmed_selection(Some(" \n".into())).unwrap_err(),
                "没有检测到选中的文字"
            );
        }

        #[test]
        fn concurrent_change_error_never_includes_clipboard_content() {
            let message = pasteboard_message(PasteboardError::ConcurrentChange);
            assert!(message.contains("剪贴板发生额外或意外变化"));
            assert!(!message.contains("underlying code"));
        }

        #[test]
        fn quarantine_reasons_never_tell_the_user_to_retry_in_place() {
            let errors = [
                PasteboardError::SnapshotUnstable,
                PasteboardError::SnapshotIncomplete,
                PasteboardError::SnapshotTooLarge,
                PasteboardError::NativeAccess,
                PasteboardError::NoSelection,
                PasteboardError::ConcurrentChange,
                PasteboardError::RestoreBuildFailed,
                PasteboardError::RestoreFailed,
            ];

            for error in errors {
                assert!(!pasteboard_quarantine_reason(error).contains("请重试"));
            }
        }

        #[test]
        fn command_watchdog_accepts_success_and_rejects_nonzero_exit() {
            let success = Command::new("/usr/bin/true").spawn().unwrap();
            assert_eq!(
                wait_for_copy_command(success, Instant::now() + Duration::from_secs(1)),
                Ok(())
            );

            let failure = Command::new("/usr/bin/false").spawn().unwrap();
            assert_eq!(
                wait_for_copy_command(failure, Instant::now() + Duration::from_secs(1)),
                Err(CopyCommandFailure::Rejected)
            );
        }

        #[test]
        fn command_watchdog_quarantines_a_signalled_process() {
            let mut child = Command::new("/bin/sleep").arg("1").spawn().unwrap();
            child.kill().unwrap();
            assert_eq!(
                wait_for_copy_command(child, Instant::now() + Duration::from_secs(1)),
                Err(CopyCommandFailure::UnsafeTermination)
            );
        }

        #[test]
        fn command_watchdog_terminates_a_hung_process() {
            let child = Command::new("/bin/sleep").arg("1").spawn().unwrap();
            assert_eq!(
                wait_for_copy_command(child, Instant::now() + Duration::from_millis(10)),
                Err(CopyCommandFailure::UnsafeTermination)
            );
        }
    }
}

#[cfg(target_os = "macos")]
async fn run_on_macos_main_thread<T>(
    app: &tauri::AppHandle,
    task: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String>
where
    T: Send + 'static,
{
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = sender.send(task());
    })
    .map_err(|_| "无法在 macOS 主线程读取系统选区，请重试".to_string())?;

    tauri::async_runtime::spawn_blocking(move || receiver.recv())
        .await
        .map_err(|_| "系统选区读取任务意外终止，请重试".to_string())?
        .map_err(|_| "macOS 主线程未返回选区读取结果，请重试".to_string())
}

#[cfg(target_os = "macos")]
async fn complete_macos_fallback(
    app: tauri::AppHandle,
    fallback: macos::FallbackCapture,
) -> Result<String, String> {
    let transaction_id = fallback.transaction_id();
    let ready = match tauri::async_runtime::spawn_blocking(move || fallback.wait()).await {
        Ok(ready) => ready,
        Err(_) => {
            let message =
                run_on_macos_main_thread(&app, move || macos::quarantine_fallback(transaction_id))
                    .await?;
            return Err(message);
        }
    };
    run_on_macos_main_thread(&app, move || ready.finish()).await?
}

#[tauri::command]
pub async fn capture_selected_text(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let capture_app = app.clone();
        let capture =
            run_on_macos_main_thread(&app, move || macos::begin_capture(capture_app)).await??;
        match capture {
            macos::CaptureStart::Selected(selection) => Ok(selection),
            macos::CaptureStart::Fallback(fallback) => {
                let (sender, receiver) = std::sync::mpsc::sync_channel(1);
                tauri::async_runtime::spawn(async move {
                    let result = complete_macos_fallback(app, fallback).await;
                    let _ = sender.send(result);
                });

                tauri::async_runtime::spawn_blocking(move || receiver.recv())
                    .await
                    .map_err(|_| "System Events 完成任务意外终止，请重试".to_string())?
                    .map_err(|_| "System Events 未返回选区读取结果，请重试".to_string())?
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("当前 beta 版本仅支持 macOS 全局划词".into())
    }
}
