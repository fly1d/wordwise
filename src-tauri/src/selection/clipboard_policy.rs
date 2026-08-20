#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct ClipboardGeneration(isize);

impl ClipboardGeneration {
    pub(super) fn new(value: isize) -> Self {
        Self(value)
    }

    pub(super) fn next(self) -> Self {
        Self(self.0.wrapping_add(1))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum CopyObservation {
    Waiting,
    Candidate(ClipboardGeneration),
    UnexpectedChange,
}

pub(super) fn observe_copy(
    original: ClipboardGeneration,
    current: ClipboardGeneration,
) -> CopyObservation {
    if current == original {
        CopyObservation::Waiting
    } else if generation_is_next(original, current) {
        CopyObservation::Candidate(current)
    } else {
        CopyObservation::UnexpectedChange
    }
}

pub(super) fn generation_is_current(
    expected: ClipboardGeneration,
    current: ClipboardGeneration,
) -> bool {
    expected == current
}

pub(super) fn generation_is_next(
    previous: ClipboardGeneration,
    current: ClipboardGeneration,
) -> bool {
    current == previous.next()
}

#[cfg(test)]
mod tests {
    use super::{
        generation_is_current, generation_is_next, observe_copy, ClipboardGeneration,
        CopyObservation,
    };

    #[test]
    fn unchanged_generation_keeps_waiting_for_copy() {
        let generation = ClipboardGeneration::new(12);
        assert_eq!(
            observe_copy(generation, generation),
            CopyObservation::Waiting
        );
    }

    #[test]
    fn one_generation_change_becomes_the_copy_candidate() {
        let original = ClipboardGeneration::new(12);
        let changed = ClipboardGeneration::new(13);
        assert_eq!(
            observe_copy(original, changed),
            CopyObservation::Candidate(changed)
        );
    }

    #[test]
    fn a_generation_jump_is_rejected_as_concurrent_activity() {
        assert_eq!(
            observe_copy(ClipboardGeneration::new(12), ClipboardGeneration::new(97)),
            CopyObservation::UnexpectedChange
        );
    }

    #[test]
    fn generation_wraparound_still_accepts_one_change() {
        let original = ClipboardGeneration::new(isize::MAX);
        let changed = ClipboardGeneration::new(isize::MIN);
        assert_eq!(
            observe_copy(original, changed),
            CopyObservation::Candidate(changed)
        );
    }

    #[test]
    fn next_generation_rejects_a_skipped_clear_transition() {
        let previous = ClipboardGeneration::new(20);
        assert!(generation_is_next(previous, ClipboardGeneration::new(21)));
        assert!(!generation_is_next(previous, ClipboardGeneration::new(22)));
    }

    #[test]
    fn candidate_can_be_restored_only_while_it_is_current() {
        let candidate = ClipboardGeneration::new(13);
        assert!(generation_is_current(candidate, candidate));
        assert!(!generation_is_current(
            candidate,
            ClipboardGeneration::new(14)
        ));
    }
}
