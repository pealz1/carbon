//! Symphonia, lofty and ebur128 parse files from the listener's disk. A bug in one of them must
//! cost a track, never the app, so panics on those paths become ordinary errors (the caller then
//! skips the file and tells the UI). Requires `panic = "unwind"` in the release profile.
//! Never used inside the real-time audio callback, which stays panic-free by construction.
use std::panic::{AssertUnwindSafe, catch_unwind};

pub const DAMAGED: &str = "the file looks damaged";

/// Runs `work`, turning a panic into `Err`. Callers must discard whatever state `work` touched
/// (decoders mark themselves poisoned), which is what makes `AssertUnwindSafe` sound here.
pub fn contain<T>(work: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    catch_unwind(AssertUnwindSafe(work)).unwrap_or_else(|_| Err(DAMAGED.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn turns_a_panic_into_an_error() {
        let result: Result<(), String> = contain(|| panic!("decoder bug on a malformed frame"));
        assert_eq!(result, Err(DAMAGED.into()));
    }

    #[test]
    fn passes_results_through() {
        assert_eq!(contain(|| Ok::<_, String>(7)), Ok(7));
        assert_eq!(contain(|| Err::<(), _>("missing".to_string())), Err("missing".into()));
    }
}
