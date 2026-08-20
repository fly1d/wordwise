use super::clipboard_policy::{
    generation_is_current, generation_is_next, observe_copy, ClipboardGeneration, CopyObservation,
};
use objc2::{exception, rc::Retained, runtime::ProtocolObject};
use objc2_app_kit::{
    NSPasteboard, NSPasteboardContentsOptions, NSPasteboardItem, NSPasteboardTypeString,
    NSPasteboardWriting,
};
use objc2_foundation::{NSArray, NSData, NSString};
use std::{
    panic::AssertUnwindSafe,
    thread,
    time::{Duration, Instant},
};

const MAX_PASTEBOARD_ITEMS: usize = 256;
const MAX_TYPES_PER_ITEM: usize = 256;
const MAX_SNAPSHOT_BYTES: usize = 128 * 1024 * 1024;
const SNAPSHOT_ATTEMPTS: usize = 3;
const COPY_TIMEOUT: Duration = Duration::from_millis(500);
const COPY_POLL_INTERVAL: Duration = Duration::from_millis(50);
const CANDIDATE_SETTLE_INTERVAL: Duration = Duration::from_millis(10);

#[derive(Clone, Debug, PartialEq, Eq)]
struct PasteboardRepresentation {
    type_name: String,
    data: Vec<u8>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct PasteboardSnapshot {
    items: Vec<Vec<PasteboardRepresentation>>,
}

struct PreparedSnapshot {
    objects: Retained<NSArray<ProtocolObject<dyn NSPasteboardWriting>>>,
    is_empty: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum PasteboardError {
    SnapshotUnstable,
    SnapshotIncomplete,
    SnapshotTooLarge,
    NativeAccess,
    NoSelection,
    ConcurrentChange,
    RestoreBuildFailed,
    RestoreFailed,
}

pub(super) struct PasteboardSession {
    pasteboard: Retained<NSPasteboard>,
    original: ClipboardGeneration,
    prepared: PreparedSnapshot,
}

impl PasteboardSession {
    pub(super) fn begin() -> Result<Self, PasteboardError> {
        let pasteboard = catch_native(NSPasteboard::generalPasteboard)?;

        for _ in 0..SNAPSHOT_ATTEMPTS {
            let before = generation(&pasteboard)?;
            let snapshot = catch_native(|| snapshot_contents(&pasteboard))??;
            let after = generation(&pasteboard)?;
            if before != after {
                continue;
            }

            let prepared = catch_native(|| prepare_snapshot(&snapshot))??;
            if generation_is_current(after, generation(&pasteboard)?) {
                return Ok(Self {
                    pasteboard,
                    original: after,
                    prepared,
                });
            }
        }

        Err(PasteboardError::SnapshotUnstable)
    }

    pub(super) fn original_is_current(&self) -> Result<bool, PasteboardError> {
        Ok(generation_is_current(
            self.original,
            generation(&self.pasteboard)?,
        ))
    }

    pub(super) fn wait_for_copy(&self) -> Result<ClipboardGeneration, PasteboardError> {
        let deadline = Instant::now() + COPY_TIMEOUT;
        loop {
            let current = generation(&self.pasteboard)?;
            match observe_copy(self.original, current) {
                CopyObservation::Waiting if Instant::now() < deadline => {
                    thread::sleep(COPY_POLL_INTERVAL);
                }
                CopyObservation::Waiting => return Err(PasteboardError::NoSelection),
                CopyObservation::Candidate(candidate) => {
                    thread::sleep(CANDIDATE_SETTLE_INTERVAL);
                    if generation_is_current(candidate, generation(&self.pasteboard)?) {
                        return Ok(candidate);
                    }
                    return Err(PasteboardError::ConcurrentChange);
                }
                CopyObservation::UnexpectedChange => return Err(PasteboardError::ConcurrentChange),
            }
        }
    }

    pub(super) fn read_text(
        &self,
        candidate: ClipboardGeneration,
    ) -> Result<Option<String>, PasteboardError> {
        if !generation_is_current(candidate, generation(&self.pasteboard)?) {
            return Err(PasteboardError::ConcurrentChange);
        }

        let text = catch_native(|| {
            let string_type = unsafe { NSPasteboardTypeString };
            self.pasteboard
                .stringForType(string_type)
                .map(|value| value.to_string())
        });

        if !generation_is_current(candidate, generation(&self.pasteboard)?) {
            return Err(PasteboardError::ConcurrentChange);
        }

        text
    }

    pub(super) fn restore(&self, candidate: ClipboardGeneration) -> Result<(), PasteboardError> {
        restore_prepared(&self.pasteboard, &self.prepared, candidate)
    }
}

fn generation(pasteboard: &NSPasteboard) -> Result<ClipboardGeneration, PasteboardError> {
    catch_native(|| ClipboardGeneration::new(pasteboard.changeCount()))
}

fn catch_native<T>(operation: impl FnOnce() -> T) -> Result<T, PasteboardError> {
    exception::catch(AssertUnwindSafe(operation)).map_err(|_| PasteboardError::NativeAccess)
}

fn snapshot_contents(pasteboard: &NSPasteboard) -> Result<PasteboardSnapshot, PasteboardError> {
    let native_items = pasteboard
        .pasteboardItems()
        .ok_or(PasteboardError::SnapshotIncomplete)?
        .to_vec();
    if native_items.len() > MAX_PASTEBOARD_ITEMS {
        return Err(PasteboardError::SnapshotTooLarge);
    }

    let mut total_bytes = 0usize;
    let mut items = Vec::with_capacity(native_items.len());
    for native_item in native_items {
        let native_types = native_item.types().to_vec();
        if native_types.is_empty() {
            return Err(PasteboardError::SnapshotIncomplete);
        }
        if native_types.len() > MAX_TYPES_PER_ITEM {
            return Err(PasteboardError::SnapshotTooLarge);
        }

        let mut representations = Vec::with_capacity(native_types.len());
        for native_type in native_types {
            let type_name = native_type.to_string();
            let data = native_item
                .dataForType(&native_type)
                .ok_or(PasteboardError::SnapshotIncomplete)?;
            total_bytes = total_bytes
                .checked_add(type_name.len())
                .and_then(|value| value.checked_add(data.len()))
                .ok_or(PasteboardError::SnapshotTooLarge)?;
            if total_bytes > MAX_SNAPSHOT_BYTES {
                return Err(PasteboardError::SnapshotTooLarge);
            }
            representations.push(PasteboardRepresentation {
                type_name,
                data: data.to_vec(),
            });
        }
        items.push(representations);
    }

    Ok(PasteboardSnapshot { items })
}

fn prepare_snapshot(snapshot: &PasteboardSnapshot) -> Result<PreparedSnapshot, PasteboardError> {
    let mut writers = Vec::with_capacity(snapshot.items.len());
    for representations in &snapshot.items {
        let item = NSPasteboardItem::new();
        for representation in representations {
            let native_type = NSString::from_str(&representation.type_name);
            let data = NSData::with_bytes(&representation.data);
            if !item.setData_forType(&data, &native_type) {
                return Err(PasteboardError::RestoreBuildFailed);
            }
        }
        writers.push(ProtocolObject::from_retained(item));
    }

    Ok(PreparedSnapshot {
        objects: NSArray::from_retained_slice(&writers),
        is_empty: writers.is_empty(),
    })
}

fn restore_prepared(
    pasteboard: &NSPasteboard,
    prepared: &PreparedSnapshot,
    candidate: ClipboardGeneration,
) -> Result<(), PasteboardError> {
    if !generation_is_current(candidate, generation(pasteboard)?) {
        return Err(PasteboardError::ConcurrentChange);
    }

    // The original sync option is not observable, so restoration stays local to avoid widening it.
    let cleared = ClipboardGeneration::new(
        catch_native(|| {
            pasteboard
                .prepareForNewContentsWithOptions(NSPasteboardContentsOptions::CurrentHostOnly)
        })
        .map_err(|_| PasteboardError::RestoreFailed)?,
    );
    if !generation_is_next(candidate, cleared) {
        return Err(PasteboardError::RestoreFailed);
    }
    if !generation_is_current(
        cleared,
        generation(pasteboard).map_err(|_| PasteboardError::RestoreFailed)?,
    ) {
        return Err(PasteboardError::ConcurrentChange);
    }

    if !prepared.is_empty {
        let restored = catch_native(|| pasteboard.writeObjects(&prepared.objects))
            .map_err(|_| PasteboardError::RestoreFailed)?;
        if !restored {
            return Err(PasteboardError::RestoreFailed);
        }
    }

    if !generation_is_current(
        cleared,
        generation(pasteboard).map_err(|_| PasteboardError::RestoreFailed)?,
    ) {
        return Err(PasteboardError::ConcurrentChange);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        generation, prepare_snapshot, restore_prepared, snapshot_contents, PasteboardError,
        PasteboardRepresentation, PasteboardSnapshot,
    };
    use objc2_app_kit::NSPasteboard;

    #[test]
    fn snapshot_model_keeps_item_type_order_and_exact_bytes() {
        let snapshot = PasteboardSnapshot {
            items: vec![
                vec![
                    PasteboardRepresentation {
                        type_name: "public.utf8-plain-text".into(),
                        data: b"first".to_vec(),
                    },
                    PasteboardRepresentation {
                        type_name: "public.html".into(),
                        data: b"<b>first</b>".to_vec(),
                    },
                ],
                vec![PasteboardRepresentation {
                    type_name: "public.png".into(),
                    data: vec![0, 1, 2, 255],
                }],
            ],
        };

        assert_eq!(snapshot.items.len(), 2);
        assert_eq!(snapshot.items[0][1].type_name, "public.html");
        assert_eq!(snapshot.items[1][0].data, vec![0, 1, 2, 255]);
    }

    #[test]
    fn native_round_trip_preserves_empty_and_multi_item_snapshots() {
        objc2::rc::autoreleasepool(|_| {
            let pasteboard = NSPasteboard::pasteboardWithUniqueName();
            let empty = PasteboardSnapshot::default();
            let empty_prepared = prepare_snapshot(&empty).unwrap();
            pasteboard.clearContents();
            assert!(empty_prepared.is_empty);
            assert_eq!(snapshot_contents(&pasteboard).unwrap(), empty);

            let transient = prepare_snapshot(&PasteboardSnapshot {
                items: vec![vec![PasteboardRepresentation {
                    type_name: "public.utf8-plain-text".into(),
                    data: b"transient selection".to_vec(),
                }]],
            })
            .unwrap();
            pasteboard.clearContents();
            assert!(pasteboard.writeObjects(&transient.objects));
            let candidate = generation(&pasteboard).unwrap();
            restore_prepared(&pasteboard, &empty_prepared, candidate).unwrap();
            assert_eq!(snapshot_contents(&pasteboard).unwrap(), empty);

            let mut utf16_text = vec![0xff, 0xfe];
            utf16_text.extend("underlying".encode_utf16().flat_map(u16::to_le_bytes));
            let seed_snapshot = PasteboardSnapshot {
                items: vec![
                    vec![
                        PasteboardRepresentation {
                            type_name: "public.utf8-plain-text".into(),
                            data: b"underlying".to_vec(),
                        },
                        PasteboardRepresentation {
                            type_name: "public.html".into(),
                            data: b"<b>underlying</b>".to_vec(),
                        },
                        PasteboardRepresentation {
                            type_name: "public.rtf".into(),
                            data: br#"{\rtf1 underlying}"#.to_vec(),
                        },
                        PasteboardRepresentation {
                            type_name: "public.utf16-external-plain-text".into(),
                            data: utf16_text,
                        },
                    ],
                    vec![PasteboardRepresentation {
                        type_name: "public.png".into(),
                        data: vec![0, 1, 2, 3, 254, 255],
                    }],
                    vec![PasteboardRepresentation {
                        type_name: "public.file-url".into(),
                        data: b"file:///tmp/wordwise-test.txt".to_vec(),
                    }],
                ],
            };
            let seed = prepare_snapshot(&seed_snapshot).unwrap();
            pasteboard.clearContents();
            assert!(pasteboard.writeObjects(&seed.objects));
            let expected = snapshot_contents(&pasteboard).unwrap();
            let prepared = prepare_snapshot(&expected).unwrap();
            let second_transient = prepare_snapshot(&PasteboardSnapshot {
                items: vec![vec![PasteboardRepresentation {
                    type_name: "public.utf8-plain-text".into(),
                    data: b"transient selection".to_vec(),
                }]],
            })
            .unwrap();
            pasteboard.clearContents();
            assert!(pasteboard.writeObjects(&second_transient.objects));
            let candidate = generation(&pasteboard).unwrap();

            restore_prepared(&pasteboard, &prepared, candidate).unwrap();
            assert_eq!(snapshot_contents(&pasteboard).unwrap(), expected);
        });
    }

    #[test]
    fn conditional_restore_preserves_a_newer_external_update() {
        objc2::rc::autoreleasepool(|_| {
            let pasteboard = NSPasteboard::pasteboardWithUniqueName();
            let original = prepare_snapshot(&PasteboardSnapshot {
                items: vec![vec![PasteboardRepresentation {
                    type_name: "public.utf8-plain-text".into(),
                    data: b"original".to_vec(),
                }]],
            })
            .unwrap();
            let candidate = prepare_snapshot(&PasteboardSnapshot {
                items: vec![vec![PasteboardRepresentation {
                    type_name: "public.utf8-plain-text".into(),
                    data: b"candidate".to_vec(),
                }]],
            })
            .unwrap();
            let external_snapshot = PasteboardSnapshot {
                items: vec![vec![PasteboardRepresentation {
                    type_name: "public.utf8-plain-text".into(),
                    data: b"external update".to_vec(),
                }]],
            };
            let external = prepare_snapshot(&external_snapshot).unwrap();

            pasteboard.clearContents();
            assert!(pasteboard.writeObjects(&candidate.objects));
            let candidate_generation = generation(&pasteboard).unwrap();
            pasteboard.clearContents();
            assert!(pasteboard.writeObjects(&external.objects));

            assert_eq!(
                restore_prepared(&pasteboard, &original, candidate_generation),
                Err(PasteboardError::ConcurrentChange)
            );
            assert_eq!(snapshot_contents(&pasteboard).unwrap(), external_snapshot);
        });
    }
}
