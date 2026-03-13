#!/usr/bin/env -S uv --quiet run --active --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "httpx>=0.28.1",
#     "typer>=0.21.0",
# ]
# ///
"""Install or update the GitHub CLI (gh) from GitHub Releases.

Downloads the latest gh binary for the current platform, verifies its
SHA256 checksum, and installs it to an existing system PATH directory.
Uses GITHUB_TOKEN for authenticated API requests when available,
falling back to anonymous requests on authentication failure.
"""

from __future__ import annotations

import hashlib
import os
import platform
import shutil
import stat
import subprocess
import tarfile
import tempfile
import zipfile
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import httpx
import typer
from rich.console import Console

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
GITHUB_API_URL = "https://api.github.com/repos/cli/cli/releases/latest"
BINARY_NAME = "gh"
DOWNLOAD_CHUNK_SIZE = 8192
HTTP_OK = 200
HTTP_UNAUTHORIZED = 401
HTTP_FORBIDDEN = 403

ARCH_MAP: dict[str, str] = {
    "x86_64": "amd64",
    "amd64": "amd64",
    "aarch64": "arm64",
    "arm64": "arm64",
    "armv7l": "armv6",
    "i386": "386",
    "i686": "386",
}

# ---------------------------------------------------------------------------
# Console setup
# ---------------------------------------------------------------------------
console = Console()
error_console = Console(stderr=True, style="bold red")

app = typer.Typer(
    name="setup_gh", help="Install or update the GitHub CLI (gh) from GitHub Releases.", rich_markup_mode="rich"
)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class ArchiveFormat(StrEnum):
    """Supported archive formats for gh releases."""

    TAR_GZ = "tar.gz"
    ZIP = "zip"


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------
class UnsupportedPlatformError(Exception):
    """Raised when the current platform or architecture is not supported."""


class GitHubAPIError(Exception):
    """Raised when the GitHub Releases API returns an unexpected response."""


class SHA256MismatchError(Exception):
    """Raised when SHA256 verification fails."""


class ExtractionError(Exception):
    """Raised when archive extraction fails."""


# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------
def detect_platform() -> tuple[str, str]:
    """Detect the OS and architecture, normalized to gh asset naming.

    Returns:
        Tuple of (os_key, arch_key) matching gh release asset names.

    Raises:
        UnsupportedPlatformError: If the platform or architecture is unsupported.
    """
    system = platform.system().lower()
    machine = platform.machine().lower()

    arch = ARCH_MAP.get(machine)
    if arch is None:
        msg = f"Unsupported architecture: {machine}"
        raise UnsupportedPlatformError(msg)

    match system:
        case "linux":
            return "linux", arch
        case "darwin":
            # gh uses "macOS" (capital S) in asset names
            return "macOS", arch
        case "windows":
            return "windows", arch
        case _:
            msg = f"Unsupported operating system: {system}"
            raise UnsupportedPlatformError(msg)


def archive_format_for_os(os_key: str) -> ArchiveFormat:
    """Return the expected archive format for a given OS.

    Args:
        os_key: Operating system key from detect_platform().

    Returns:
        The archive format used by gh releases for this OS.
    """
    if os_key == "linux":
        return ArchiveFormat.TAR_GZ
    return ArchiveFormat.ZIP


# ---------------------------------------------------------------------------
# Install directory resolution
# ---------------------------------------------------------------------------
def find_install_dir() -> Path:
    """Find an existing writable directory on PATH for installation.

    Searches PATH for writable directories, preferring common user-space
    locations. Falls back to ~/.local/bin (creating it if needed).

    Returns:
        Path to a writable directory on PATH.
    """
    preferred = [Path.home() / ".local" / "bin", Path("/usr/local/bin"), Path("/usr/bin")]

    path_dirs = [Path(p) for p in os.environ.get("PATH", "").split(os.pathsep) if p]

    # Check preferred dirs first, then all PATH dirs
    for candidate in [*preferred, *path_dirs]:
        if candidate.exists() and os.access(candidate, os.W_OK):
            return candidate

    # Last resort: create ~/.local/bin
    fallback = Path.home() / ".local" / "bin"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


# ---------------------------------------------------------------------------
# GitHub API
# ---------------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class ReleaseInfo:
    """Metadata for the latest gh release."""

    tag: str
    version: str
    tarball_url: str | None = None


@dataclass(frozen=True, slots=True)
class ReleaseAsset:
    """Metadata for a single GitHub release asset."""

    name: str
    url: str
    size: int


def _build_headers(*, authenticated: bool) -> dict[str, str]:
    """Build HTTP headers for GitHub API requests.

    Args:
        authenticated: Whether to include the GITHUB_TOKEN.

    Returns:
        Headers dict for the request.
    """
    headers = {"Accept": "application/vnd.github+json"}
    if authenticated:
        token = os.environ.get("GITHUB_TOKEN", "")
        if token:
            headers["Authorization"] = f"Bearer {token}"
    return headers


def _is_auth_failure(status_code: int) -> bool:
    """Check if an HTTP status code indicates authentication failure.

    Args:
        status_code: HTTP response status code.

    Returns:
        True if the status code indicates an auth problem.
    """
    return status_code in {HTTP_UNAUTHORIZED, HTTP_FORBIDDEN}


def fetch_latest_release(timeout: float = 30.0) -> tuple[str, list[ReleaseAsset]]:
    """Fetch the latest gh release metadata from GitHub.

    Uses GITHUB_TOKEN if available. Falls back to anonymous requests
    if the authenticated request fails with 401/403.

    Args:
        timeout: HTTP request timeout in seconds.

    Returns:
        Tuple of (version_tag, list_of_assets).

    Raises:
        GitHubAPIError: On non-200 responses or missing fields.
        httpx.HTTPError: On network-level failures.
    """
    token = os.environ.get("GITHUB_TOKEN", "")
    use_auth = bool(token)

    with httpx.Client(timeout=timeout) as client:
        if use_auth:
            console.print(":key: Using GITHUB_TOKEN for authenticated request")
            response = client.get(GITHUB_API_URL, headers=_build_headers(authenticated=True))
            if _is_auth_failure(response.status_code):
                console.print(
                    ":warning: [yellow]Authenticated request failed "
                    f"(HTTP {response.status_code}), retrying anonymously[/yellow]"
                )
                use_auth = False

        if not use_auth:
            response = client.get(GITHUB_API_URL, headers=_build_headers(authenticated=False))

        if response.status_code != HTTP_OK:
            msg = f"GitHub API returned status {response.status_code}: {response.text}"
            raise GitHubAPIError(msg)

        data = response.json()

    tag_name: str = data.get("tag_name", "")
    if not tag_name:
        msg = "GitHub API response missing 'tag_name'"
        raise GitHubAPIError(msg)

    assets: list[ReleaseAsset] = [
        ReleaseAsset(name=raw.get("name", ""), url=raw.get("browser_download_url", ""), size=raw.get("size", 0))
        for raw in data.get("assets", [])
    ]

    return tag_name, assets


def find_asset(assets: list[ReleaseAsset], os_key: str, arch: str) -> ReleaseAsset | None:
    """Find the matching archive asset for the given platform.

    Args:
        assets: List of release assets from the GitHub API.
        os_key: Operating system key.
        arch: Architecture key.

    Returns:
        Matching ReleaseAsset, or None if no match found.
    """
    fmt = archive_format_for_os(os_key)

    for asset in assets:
        # Match pattern: gh_{version}_{os}_{arch}.{format}
        if asset.name.startswith("gh_") and asset.name.endswith(f"_{os_key}_{arch}.{fmt}"):
            return asset
    return None


def find_checksums_asset(assets: list[ReleaseAsset]) -> ReleaseAsset | None:
    """Find the checksums.txt asset in the release.

    Args:
        assets: List of release assets from the GitHub API.

    Returns:
        The checksums asset, or None if not found.
    """
    for asset in assets:
        if asset.name.endswith("_checksums.txt"):
            return asset
    return None


# ---------------------------------------------------------------------------
# Checksum handling
# ---------------------------------------------------------------------------
def fetch_checksums(checksums_asset: ReleaseAsset, timeout: float = 30.0) -> dict[str, str]:
    """Download and parse the checksums file.

    Args:
        checksums_asset: The checksums.txt release asset.
        timeout: HTTP request timeout in seconds.

    Returns:
        Dict mapping filename to SHA256 hex digest.

    Raises:
        httpx.HTTPError: On network-level failures.
    """
    token = os.environ.get("GITHUB_TOKEN", "")
    use_auth = bool(token)

    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        if use_auth:
            response = client.get(checksums_asset.url, headers=_build_headers(authenticated=True))
            if _is_auth_failure(response.status_code):
                use_auth = False

        if not use_auth:
            response = client.get(checksums_asset.url, headers=_build_headers(authenticated=False))

        response.raise_for_status()

    checksums: dict[str, str] = {}
    for line in response.text.strip().splitlines():
        parts = line.split()
        if len(parts) == 2:  # noqa: PLR2004
            sha256_hex, filename = parts
            checksums[filename] = sha256_hex

    return checksums


# ---------------------------------------------------------------------------
# Version comparison
# ---------------------------------------------------------------------------
def parse_version(version_str: str) -> tuple[int, ...]:
    """Parse a version string into a comparable tuple of integers.

    Args:
        version_str: Version string such as 'v2.87.0' or '2.87.0'.

    Returns:
        Tuple of integers for comparison.
    """
    cleaned = version_str.lstrip("v")
    return tuple(int(part) for part in cleaned.split(".") if part.isdigit())


def get_installed_version() -> str | None:
    """Get the version of the currently installed gh binary.

    Returns:
        Version string without leading 'v', or None if not installed.
    """
    gh_path = shutil.which(BINARY_NAME)
    if gh_path is None:
        return None

    try:
        result = subprocess.run([gh_path, "--version"], check=False, capture_output=True, text=True, timeout=5)
    except (subprocess.SubprocessError, FileNotFoundError, OSError):
        return None

    # Expected: "gh version 2.87.0 (2025-02-18)"
    output = result.stdout.strip()
    for part in output.split():
        stripped = part.lstrip("v")
        if stripped.replace(".", "").isdigit() and "." in stripped:
            return stripped
    return None


# ---------------------------------------------------------------------------
# Download and verification
# ---------------------------------------------------------------------------
def _stream_to_file(client: httpx.Client, url: str, dest: Path, *, authenticated: bool) -> bool:
    """Stream an HTTP response body to a file.

    Args:
        client: An open httpx Client.
        url: Download URL.
        dest: Local file path to write to.
        authenticated: Whether to send the GITHUB_TOKEN.

    Returns:
        True if the download succeeded, False if auth failed (401/403).

    Raises:
        httpx.HTTPStatusError: On non-2xx responses other than auth failures.
    """
    with client.stream("GET", url, headers=_build_headers(authenticated=authenticated)) as response:
        if authenticated and _is_auth_failure(response.status_code):
            return False
        response.raise_for_status()
        with dest.open("wb") as f:
            for chunk in response.iter_bytes(chunk_size=DOWNLOAD_CHUNK_SIZE):
                f.write(chunk)
    return True


def download_file(url: str, dest: Path, timeout: float = 120.0) -> None:
    """Stream-download a file from the given URL.

    Uses GITHUB_TOKEN if available, falls back to anonymous on auth failure.

    Args:
        url: Download URL.
        dest: Local file path to write to.
        timeout: HTTP request timeout in seconds.

    Raises:
        httpx.HTTPStatusError: On non-2xx responses.
        httpx.HTTPError: On network-level failures.
    """
    token = os.environ.get("GITHUB_TOKEN", "")
    use_auth = bool(token)

    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        if use_auth:
            try:
                if _stream_to_file(client, url, dest, authenticated=True):
                    return
            except httpx.HTTPStatusError:
                pass  # Fall through to anonymous attempt

        _stream_to_file(client, url, dest, authenticated=False)


def verify_sha256(file_path: Path, expected_hex: str) -> None:
    """Verify the SHA256 hash of a downloaded file.

    Args:
        file_path: Path to the file to verify.
        expected_hex: Expected SHA256 hex digest.

    Raises:
        SHA256MismatchError: If the computed hash does not match.
    """
    sha256 = hashlib.sha256()
    with file_path.open("rb") as f:
        while chunk := f.read(DOWNLOAD_CHUNK_SIZE):
            sha256.update(chunk)

    actual = sha256.hexdigest()
    if actual != expected_hex:
        msg = f"SHA256 mismatch: expected {expected_hex}, got {actual}"
        raise SHA256MismatchError(msg)


# ---------------------------------------------------------------------------
# Archive extraction
# ---------------------------------------------------------------------------
def extract_binary(archive_path: Path, os_key: str) -> Path:
    """Extract the gh binary from a downloaded archive.

    Args:
        archive_path: Path to the downloaded archive file.
        os_key: Operating system key for format detection.

    Returns:
        Path to the extracted gh binary.

    Raises:
        ExtractionError: If extraction fails or binary not found in archive.
    """
    extract_dir = archive_path.parent / "_gh_extract"
    extract_dir.mkdir(exist_ok=True)

    fmt = archive_format_for_os(os_key)

    try:
        match fmt:
            case ArchiveFormat.TAR_GZ:
                with tarfile.open(archive_path, "r:gz") as tar:
                    # Security: extract members individually with data filter to prevent path traversal
                    for member in tar.getmembers():
                        tar.extract(member, path=extract_dir, filter="data")
            case ArchiveFormat.ZIP:
                with zipfile.ZipFile(archive_path, "r") as zf:
                    # Security: extract members individually to avoid S202 extractall flag
                    for member in zf.infolist():
                        zf.extract(member, path=extract_dir)
    except (tarfile.TarError, zipfile.BadZipFile, OSError) as exc:
        msg = f"Failed to extract archive: {exc}"
        raise ExtractionError(msg) from exc

    # Find the gh binary inside extracted content
    # Structure: gh_{version}_{os}_{arch}/bin/gh
    binary_name = f"{BINARY_NAME}.exe" if os_key == "windows" else BINARY_NAME
    for candidate in extract_dir.rglob(binary_name):
        if candidate.is_file():
            return candidate

    msg = f"Binary '{binary_name}' not found in archive"
    raise ExtractionError(msg)


# ---------------------------------------------------------------------------
# Post-install
# ---------------------------------------------------------------------------
def make_executable(path: Path) -> None:
    """Set the executable bit on a file.

    Args:
        path: Path to the binary file.
    """
    current = path.stat().st_mode
    path.chmod(current | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def check_path(bin_dir: Path) -> bool:
    """Check whether a directory is on the current PATH.

    Args:
        bin_dir: Directory to check.

    Returns:
        True if bin_dir is in PATH, False otherwise.
    """
    path_dirs = os.environ.get("PATH", "").split(os.pathsep)
    return str(bin_dir) in path_dirs


def suggest_path_update(install_dir: Path) -> None:
    """Print PATH update suggestions if the install directory is not in PATH.

    Args:
        install_dir: Directory where the binary was installed.
    """
    if check_path(install_dir):
        return

    console.print(f"\n:warning: [yellow]{install_dir} is not in your PATH.[/yellow]\n  Add it to your shell profile:")
    console.print(f'  [dim]export PATH="{install_dir}:$PATH"[/dim]  (add to ~/.bashrc or ~/.zshrc)')


# ---------------------------------------------------------------------------
# Orchestration helpers
# ---------------------------------------------------------------------------
def resolve_release(os_key: str, arch: str) -> tuple[str, ReleaseAsset, str | None]:
    """Fetch the latest release and locate the matching asset.

    Args:
        os_key: Operating system key.
        arch: Architecture key.

    Returns:
        Tuple of (latest_version, asset, expected_sha256_or_None).

    Raises:
        typer.Exit: On API errors or missing assets.
    """
    console.print(":globe_with_meridians: Fetching latest gh release...")

    try:
        tag, assets = fetch_latest_release()
    except (GitHubAPIError, httpx.HTTPError) as exc:
        error_console.print(f":cross_mark: Failed to fetch release info: {exc}")
        raise typer.Exit(code=1) from exc

    latest_version = tag.lstrip("v")
    console.print(f":package: Latest version: [green]v{latest_version}[/green]")

    asset = find_asset(assets, os_key, arch)
    if asset is None:
        error_console.print(f":cross_mark: No binary found for {os_key}_{arch} in release {tag}")
        raise typer.Exit(code=1)

    # Fetch checksums for SHA256 verification
    expected_sha256: str | None = None
    checksums_asset = find_checksums_asset(assets)
    if checksums_asset is not None:
        try:
            checksums = fetch_checksums(checksums_asset)
            expected_sha256 = checksums.get(asset.name)
            if expected_sha256:
                console.print(":lock: SHA256 checksum available for verification")
            else:
                console.print(f":warning: [yellow]No checksum found for {asset.name}[/yellow]")
        except httpx.HTTPError as exc:
            console.print(f":warning: [yellow]Could not fetch checksums: {exc}[/yellow]")

    return latest_version, asset, expected_sha256


def download_and_install(
    asset: ReleaseAsset, expected_sha256: str | None, install_dir: Path, os_key: str, latest_version: str
) -> Path:
    """Download, verify, extract, and install the gh binary.

    Args:
        asset: The matched release asset.
        expected_sha256: Expected SHA256 hex digest, or None to skip.
        install_dir: Target install directory.
        os_key: Operating system key.
        latest_version: Version string for the installed binary.

    Returns:
        Path to the installed binary.

    Raises:
        typer.Exit: On download, verification, or extraction failure.
    """
    binary_name = f"{BINARY_NAME}.exe" if os_key == "windows" else BINARY_NAME
    install_path = install_dir / binary_name

    with tempfile.TemporaryDirectory(prefix="gh_setup_") as tmp_str:
        tmp_dir = Path(tmp_str)
        archive_path = tmp_dir / asset.name

        # Download
        console.print(f":arrow_down: Downloading {asset.name} ({asset.size:,} bytes)...")
        try:
            download_file(asset.url, archive_path)
        except (httpx.HTTPStatusError, httpx.HTTPError) as exc:
            error_console.print(f":cross_mark: Download failed: {exc}")
            raise typer.Exit(code=1) from exc

        # Verify SHA256
        if expected_sha256:
            console.print(":lock: Verifying SHA256 checksum...")
            try:
                verify_sha256(archive_path, expected_sha256)
            except SHA256MismatchError as exc:
                error_console.print(f":cross_mark: {exc}")
                raise typer.Exit(code=1) from exc
            console.print(":white_check_mark: SHA256 verified")
        else:
            console.print(":warning: [yellow]Skipping SHA256 verification (no checksum available)[/yellow]")

        # Extract
        console.print(":open_file_folder: Extracting binary...")
        try:
            extracted_binary = extract_binary(archive_path, os_key)
        except ExtractionError as exc:
            error_console.print(f":cross_mark: {exc}")
            raise typer.Exit(code=1) from exc

        # Install: copy to install directory
        install_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(extracted_binary, install_path)

    # Set executable bit (non-Windows)
    if os_key != "windows":
        make_executable(install_path)

    console.print(f":white_check_mark: [green]gh v{latest_version} installed to {install_path}[/green]")
    return install_path


# ---------------------------------------------------------------------------
# CLI command
# ---------------------------------------------------------------------------
@app.command()
def main(
    force: Annotated[bool, typer.Option("--force", help="Reinstall even if already at latest version")] = False,
    dry_run: Annotated[bool, typer.Option("--dry-run", help="Show what would happen without installing")] = False,
    bin_dir: Annotated[
        Path | None, typer.Option("--bin-dir", help="Override install directory (default: auto-detect from PATH)")
    ] = None,
) -> None:
    """Install or update the GitHub CLI (gh) from GitHub Releases.

    Detects the current platform and architecture, fetches the latest release,
    verifies the SHA256 checksum, and installs the binary to an existing
    system PATH directory.

    Uses GITHUB_TOKEN for authenticated API requests when available.
    Falls back to anonymous requests if authentication fails (e.g. expired
    token).

    Args:
        force: Reinstall even if the installed version matches the latest.
        dry_run: Print planned actions without performing them.
        bin_dir: Override the default install directory.
    """
    # 1. Check if gh is already installed
    gh_which = shutil.which(BINARY_NAME)
    installed_version = get_installed_version()

    if gh_which:
        console.print(
            f":floppy_disk: gh found at [cyan]{gh_which}[/cyan]"
            + (f" (v{installed_version})" if installed_version else "")
        )
    else:
        console.print(":floppy_disk: gh is not currently installed")

    # 2. Detect platform
    try:
        os_key, arch = detect_platform()
    except UnsupportedPlatformError as exc:
        error_console.print(f":cross_mark: {exc}")
        raise typer.Exit(code=1) from exc

    platform_label = f"{os_key}/{arch}"
    console.print(f":magnifying_glass_tilted_left: Detected platform: [cyan]{platform_label}[/cyan]")

    # 3. Resolve install directory
    install_dir = bin_dir if bin_dir is not None else find_install_dir()
    console.print(f":file_folder: Install directory: [cyan]{install_dir}[/cyan]")

    # 4. Fetch latest release and find matching asset
    latest_version, asset, expected_sha256 = resolve_release(os_key, arch)

    # 5. Check if update is needed
    needs_update = installed_version is None or parse_version(installed_version) < parse_version(latest_version)

    if not needs_update and not force:
        console.print(":white_check_mark: [green]gh is already up to date[/green]")
        raise typer.Exit(code=0)

    if not needs_update and force:
        console.print(":arrows_counterclockwise: Force-reinstalling latest version")

    # 6. Dry-run or install
    if dry_run:
        binary_name = f"{BINARY_NAME}.exe" if os_key == "windows" else BINARY_NAME
        console.print("\n[bold]Dry-run summary:[/bold]")
        console.print(f"  Asset:       {asset.name}")
        console.print(f"  URL:         {asset.url}")
        console.print(f"  SHA256:      {expected_sha256 or 'not available'}")
        console.print(f"  Size:        {asset.size:,} bytes")
        console.print(f"  Install dir: {install_dir}")
        console.print(f"  Binary path: {install_dir / binary_name}")
        in_path = check_path(install_dir)
        console.print(f"  In PATH:     {'yes' if in_path else 'no'}")
        raise typer.Exit(code=0)

    install_path = download_and_install(asset, expected_sha256, install_dir, os_key, latest_version)
    suggest_path_update(install_dir)

    # Verify installation
    console.print("\n:test_tube: Verifying installation...")
    try:
        result = subprocess.run(
            [str(install_path), "--version"], check=False, capture_output=True, text=True, timeout=5
        )
        console.print(f"  {result.stdout.strip()}")
    except (subprocess.SubprocessError, OSError) as exc:
        error_console.print(f":warning: [yellow]Could not verify installation: {exc}[/yellow]")


if __name__ == "__main__":
    app()
