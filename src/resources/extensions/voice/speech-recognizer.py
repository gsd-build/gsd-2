#!/usr/bin/env python3
"""
speech-recognizer.py — Moonshine streaming STT recognizer for Linux.

Emits line protocol on stdout (unbuffered):
  READY          — model loaded, mic active
  PARTIAL:<text> — partial transcription update (streaming)
  FINAL:<text>   — finalized transcription (after pause/endpoint)
  ERROR:<msg>    — fatal error (human-readable)

Requires: moonshine-voice (pip install moonshine-voice)
System dep: libportaudio2 (sudo apt install libportaudio2)

Designed to be spawned by index.ts startRecognizer() and communicate
exclusively via the stdout line protocol above.
"""

import os
import signal
import subprocess
import sys
import time

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def emit(tag, msg=""):
    """Emit a single protocol line, flushed immediately."""
    if msg:
        print(f"{tag}:{msg}", flush=True)
    else:
        print(tag, flush=True)


def _try_pip_install(package):
    """Attempt pip install. Returns (success, error_detail)."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", package, "--quiet"],
            capture_output=True,
            timeout=300,
        )
        if result.returncode == 0:
            return True, ""
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        return False, stderr
    except FileNotFoundError:
        return False, "pip not found"
    except subprocess.TimeoutExpired:
        return False, "install timed out after 300s"
    except Exception as exc:
        return False, str(exc)


def ensure_deps():
    """Import moonshine_voice, auto-installing if missing.

    Returns True on success. On failure, emits ERROR: and returns False.
    Never raises — all failures go through the line protocol.
    """
    try:
        import moonshine_voice  # noqa: F401
        return True
    except ImportError:
        pass

    # Attempt install
    ok, detail = _try_pip_install("moonshine-voice")
    if not ok:
        if "externally-managed" in detail.lower():
            emit(
                "ERROR",
                "Python environment is externally managed (PEP 668). "
                "Create a venv first: python3 -m venv ~/.gsd/voice-venv && "
                "~/.gsd/voice-venv/bin/pip install moonshine-voice",
            )
        elif "pip not found" in detail:
            emit("ERROR", "pip is not available. Install: sudo apt install python3-pip")
        else:
            emit("ERROR", f"Failed to install moonshine-voice: {detail}")
        return False

    # Verify import after install
    try:
        import moonshine_voice  # noqa: F401
        return True
    except ImportError as exc:
        emit("ERROR", f"moonshine-voice installed but cannot import: {exc}")
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if not ensure_deps():
        sys.exit(1)

    # Imports are safe now
    from moonshine_voice import (
        MicTranscriber,
        TranscriptEventListener,
        get_model_for_language,
    )

    # --- Signal handling (clean exit, no traceback) ---
    # We use a flag + main-loop check so cleanup runs properly.
    shutdown_requested = False

    def _handle_signal(signum, frame):
        nonlocal shutdown_requested
        shutdown_requested = True

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    # --- Load model (downloads on first run) ---
    try:
        model_path, model_arch = get_model_for_language("en")
    except Exception as exc:
        emit("ERROR", f"Failed to load Moonshine model: {exc}")
        sys.exit(1)

    # --- Accumulated text state ---
    # Moonshine fires events per "line" (speech segment separated by pauses).
    # We accumulate completed lines so PARTIAL/FINAL always carry the full
    # session text — same behavior as the Swift binary.
    completed_lines = []

    class ProtocolListener(TranscriptEventListener):
        """Translate Moonshine events → READY/PARTIAL/FINAL protocol."""

        def _full_text(self, current=""):
            parts = list(completed_lines)
            if current:
                parts.append(current)
            return " ".join(parts)

        def on_line_started(self, event):
            text = event.line.text.strip()
            if text:
                emit("PARTIAL", self._full_text(text))

        def on_line_text_changed(self, event):
            text = event.line.text.strip()
            if text:
                emit("PARTIAL", self._full_text(text))

        def on_line_completed(self, event):
            text = event.line.text.strip()
            if text:
                completed_lines.append(text)
                emit("FINAL", self._full_text())

    # --- Create mic transcriber ---
    mic = None
    try:
        mic = MicTranscriber(model_path=model_path, model_arch=model_arch)
    except Exception as exc:
        msg = str(exc).lower()
        if "portaudio" in msg or "sounddevice" in msg or "no module" in msg:
            emit(
                "ERROR",
                "Audio system not available. "
                "Install: sudo apt install libportaudio2",
            )
        else:
            emit("ERROR", f"Failed to initialize microphone: {exc}")
        sys.exit(1)

    listener = ProtocolListener()
    mic.add_listener(listener)

    # --- Run ---
    try:
        mic.start()
        emit("READY")

        # Block until shutdown signal
        while not shutdown_requested:
            time.sleep(0.1)
    except Exception as exc:
        msg = str(exc).lower()
        if "portaudio" in msg:
            emit(
                "ERROR",
                "Audio device error. "
                "Install: sudo apt install libportaudio2",
            )
        else:
            emit("ERROR", f"Runtime error: {exc}")
        sys.exit(1)
    finally:
        # Clean shutdown — stop mic before exiting
        if mic is not None:
            try:
                mic.stop()
            except Exception:
                pass


if __name__ == "__main__":
    main()
