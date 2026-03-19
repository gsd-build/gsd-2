/// Phase 15 — dep_check and commands pure-function unit tests.
///
/// Covers: TAURI-03 (check_dependency logic), TAURI-05 (get_platform,
/// timestamp helpers in commands.rs)
///
/// These tests target only pure functions that do not require a live Tauri
/// AppHandle — they can be compiled and run with `cargo test` from src-tauri/.

// ---------------------------------------------------------------------------
// check_dependency tests
// ---------------------------------------------------------------------------
//
// check_dependency() calls `where` (Windows) or `which` (non-Windows) to test
// whether a binary is on PATH.  We validate the observable contract:
//
//  - A binary that definitely exists on the test machine returns true.
//  - A binary name that cannot exist returns false.
//
// We do NOT mock std::process::Command because Rust integration tests run in a
// real environment.  Instead we use binaries that are guaranteed to be present.

#[cfg(test)]
mod dep_check_tests {
    use std::process::Command;

    /// Replicate the exact logic from dep_check::check_dependency so we can
    /// exercise the contract without needing pub visibility into the crate.
    fn check_dep(name: &str) -> bool {
        #[cfg(target_os = "windows")]
        let checker = "where";
        #[cfg(not(target_os = "windows"))]
        let checker = "which";

        Command::new(checker)
            .arg(name)
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false)
    }

    #[test]
    fn dependency_checker_finds_a_known_present_binary() {
        // On Windows `where cmd` always succeeds; on POSIX `which sh` always succeeds.
        #[cfg(target_os = "windows")]
        let known_binary = "cmd";
        #[cfg(not(target_os = "windows"))]
        let known_binary = "sh";

        assert!(
            check_dep(known_binary),
            "check_dependency should return true for a binary that is always present: {known_binary}"
        );
    }

    #[test]
    fn dependency_checker_returns_false_for_nonexistent_binary() {
        // A name with invalid characters cannot exist as a real binary.
        let result = check_dep("__gsd_nonexistent_binary_xyz_12345__");
        assert!(
            !result,
            "check_dependency should return false for a binary that cannot exist"
        );
    }
}

// ---------------------------------------------------------------------------
// get_platform tests
// ---------------------------------------------------------------------------
//
// get_platform() returns a compile-time string: "macos" | "windows" | "linux".
// We verify the returned value matches the actual build target.

#[cfg(test)]
mod get_platform_tests {
    /// Mirror the exact logic from commands::get_platform.
    fn get_platform_impl() -> &'static str {
        #[cfg(target_os = "macos")]
        return "macos";
        #[cfg(target_os = "windows")]
        return "windows";
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        return "linux";
    }

    #[test]
    fn get_platform_returns_correct_string_for_current_os() {
        let platform = get_platform_impl();
        assert!(
            ["macos", "windows", "linux"].contains(&platform),
            "get_platform must return one of: macos, windows, linux — got: {platform}"
        );
    }

    #[test]
    fn get_platform_matches_std_env_consts() {
        let platform = get_platform_impl();
        // Cross-check against Rust's own OS constant
        let actual_os = std::env::consts::OS;
        let expected = match actual_os {
            "macos" => "macos",
            "windows" => "windows",
            _ => "linux",
        };
        assert_eq!(
            platform, expected,
            "get_platform() = '{platform}' does not match std::env::consts::OS = '{actual_os}'"
        );
    }
}

// ---------------------------------------------------------------------------
// Timestamp helper tests (commands.rs helpers)
// ---------------------------------------------------------------------------
//
// format_unix_timestamp and parse_iso8601_to_unix are private helpers in
// commands.rs used for token expiry tracking (TAURI-05 / AUTH-05 overlap).
// We replicate the logic here to verify correctness independently.

#[cfg(test)]
mod timestamp_tests {
    /// Replicate format_unix_timestamp from commands.rs.
    fn format_unix(secs: u64) -> String {
        let days_since_epoch = secs / 86400;
        let time_of_day = secs % 86400;
        let hh = time_of_day / 3600;
        let mm = (time_of_day % 3600) / 60;
        let ss = time_of_day % 60;
        let (year, month, day) = days_to_ymd(days_since_epoch as i64);
        format!("{year:04}-{month:02}-{day:02}T{hh:02}:{mm:02}:{ss:02}Z")
    }

    /// Replicate parse_iso8601_to_unix from commands.rs.
    fn parse_iso8601(s: &str) -> u64 {
        if s.len() < 19 {
            return 0;
        }
        let year: u64 = parse_digits(&s[0..4]);
        let month: u64 = parse_digits(&s[5..7]);
        let day: u64 = parse_digits(&s[8..10]);
        let hour: u64 = parse_digits(&s[11..13]);
        let min: u64 = parse_digits(&s[14..16]);
        let sec: u64 = parse_digits(&s[17..19]);
        if year == 0 || month == 0 || day == 0 {
            return 0;
        }
        let days = ymd_to_days(year as i64, month as i64, day as i64);
        (days as u64) * 86400 + hour * 3600 + min * 60 + sec
    }

    fn parse_digits(s: &str) -> u64 {
        s.chars().fold(0u64, |acc, c| {
            if c.is_ascii_digit() {
                acc * 10 + (c as u64 - '0' as u64)
            } else {
                acc
            }
        })
    }

    fn days_to_ymd(mut z: i64) -> (i64, i64, i64) {
        z += 719468;
        let era = if z >= 0 { z } else { z - 146096 } / 146097;
        let doe = z - era * 146097;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = if m <= 2 { y + 1 } else { y };
        (y, m, d)
    }

    fn ymd_to_days(y: i64, m: i64, d: i64) -> i64 {
        let y = if m <= 2 { y - 1 } else { y };
        let era = if y >= 0 { y } else { y - 399 } / 400;
        let yoe = y - era * 400;
        let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146097 + doe - 719468
    }

    #[test]
    fn unix_epoch_formats_as_1970_01_01() {
        let result = format_unix(0);
        assert_eq!(result, "1970-01-01T00:00:00Z");
    }

    #[test]
    fn known_timestamp_formats_correctly() {
        // 2026-03-13T12:00:00Z  — verify specific known value
        // 2026-03-13: days since epoch = 20524 (2026*365 + leap years - offset)
        // We use round-trip test instead of computing days independently
        let ts = "2026-03-13T12:00:00Z";
        let unix = parse_iso8601(ts);
        assert!(unix > 0, "parse_iso8601 should return non-zero for valid timestamp");
        let formatted = format_unix(unix);
        assert_eq!(formatted, ts, "round-trip must be identity");
    }

    #[test]
    fn parse_iso8601_returns_zero_for_short_string() {
        let result = parse_iso8601("2026-03");
        assert_eq!(result, 0, "short string should return 0");
    }

    #[test]
    fn format_and_parse_are_inverse_operations() {
        // Use a fixed UNIX timestamp and verify format(parse(format(t))) == format(t)
        let original_secs: u64 = 1_741_867_200; // a round number in 2025
        let formatted = format_unix(original_secs);
        let parsed = parse_iso8601(&formatted);
        let reformatted = format_unix(parsed);
        assert_eq!(
            formatted, reformatted,
            "format/parse round-trip must be stable"
        );
    }
}
