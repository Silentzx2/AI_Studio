#!/usr/bin/env python3
"""Build native CUDA extension wheels from all model manifests.

Reads all YAML manifests, identifies native packages that need source builds,
compiles them one by one, and collects the resulting .whl files.

Usage:
    python scripts/build_native_wheels.py [--output-dir ./wheels] [--python 3.10] [--cuda 12.4] [--upload]

Environment requirements:
    - CUDA toolkit (nvcc) in PATH
    - ninja build system (auto-installed if missing)
    - PyTorch with CUDA support
    - Python 3.10/3.11/3.12
    - GitHub CLI (gh) if --upload is used
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Add backend to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

import yaml


def find_manifests() -> list[Path]:
    """Find all YAML manifest files."""
    manifest_dir = PROJECT_ROOT / "backend" / "runtime" / "manifests"
    return sorted(manifest_dir.glob("*.yaml"))


def extract_native_packages(manifest_path: Path) -> list[dict]:
    """Extract native packages that need building from a manifest."""
    with open(manifest_path) as f:
        data = yaml.safe_load(f)

    deps = data.get("dependencies", {}) or {}
    native_specs = deps.get("native", []) or []
    wheels_config = deps.get("wheels", {}) or {}

    packages = []
    for spec in native_specs:
        pkg_name = spec.split("==")[0].split(">=")[0].split("<=")[0].strip()
        wheel_info = wheels_config.get(pkg_name, {})
        packages.append({
            "name": pkg_name,
            "spec": spec,
            "wheel_available": wheel_info.get("available", False),
            "manifest": manifest_path.stem,
        })

    return packages


def check_prerequisites():
    """Check and install build prerequisites."""
    print("Checking build prerequisites...")

    # Check nvcc
    nvcc_path = shutil.which("nvcc")
    if not nvcc_path:
        print("ERROR: nvcc not found in PATH — CUDA toolkit is required")
        print("Install CUDA toolkit:")
        print("  sudo apt-get update")
        print("  sudo apt-get install -y nvidia-cuda-toolkit")
        print("Or for CUDA 12.4 specifically:")
        print("  wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb")
        print("  sudo dpkg -i cuda-keyring_1.1-1_all.deb")
        print("  sudo apt-get update")
        print("  sudo apt-get install -y cuda-toolkit-12-4")
        return False

    # Get CUDA version
    result = subprocess.run(["nvcc", "--version"], capture_output=True, text=True)
    if result.returncode == 0:
        for line in result.stdout.split("\n"):
            if "release" in line.lower():
                print(f"  CUDA: {line.strip()}")
                break

    # Check/install ninja
    ninja_path = shutil.which("ninja")
    if not ninja_path:
        print("  ninja not found — installing...")
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "ninja"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"  FAILED to install ninja: {result.stderr[:200]}")
            return False
        ninja_path = shutil.which("ninja")
        if ninja_path:
            print(f"  ninja installed: {ninja_path}")
        else:
            print("  WARNING: ninja installed but not in PATH")
    else:
        print(f"  ninja: {ninja_path}")

    # Check PyTorch CUDA
    try:
        import torch
        if torch.cuda.is_available():
            print(f"  PyTorch: {torch.__version__} (CUDA: {torch.version.cuda})")
        else:
            print("  WARNING: PyTorch CUDA not available — builds may fail")
    except ImportError:
        print("  WARNING: PyTorch not installed")

    return True


def build_wheel(spec: str, output_dir: Path, env: dict | None = None) -> Path | None:
    """Build a wheel from a VCS or source spec.

    Returns the path to the built .whl file, or None on failure.
    """
    merged_env = {**os.environ, **(env or {})}

    with tempfile.TemporaryDirectory() as tmpdir:
        # Build wheel without installing dependencies
        cmd = [
            sys.executable, "-m", "pip", "wheel",
            "--no-deps", "--wheel-dir", tmpdir,
            spec,
        ]

        print(f"  Building: {spec}")
        print(f"  Command: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=merged_env,
            cwd=str(PROJECT_ROOT),
        )

        if result.returncode != 0:
            print(f"  FAILED (exit {result.returncode})")
            if result.stderr:
                # Show last few lines of error
                err_lines = result.stderr.strip().split("\n")
                for line in err_lines[-10:]:
                    print(f"    {line}")
            return None

        # Find the built .whl file
        whl_files = list(Path(tmpdir).glob("*.whl"))
        if not whl_files:
            print(f"  WARNING: No .whl file found in {tmpdir}")
            return None

        # Copy to output directory
        whl = whl_files[0]
        dest = output_dir / whl.name
        shutil.copy2(whl, dest)
        size_mb = dest.stat().st_size / 1024 / 1024
        print(f"  OK: {dest.name} ({size_mb:.1f} MB)")
        return dest


def main():
    parser = argparse.ArgumentParser(description="Build native CUDA wheels from manifests")
    parser.add_argument("--output-dir", default="./wheels", help="Output directory for .whl files")
    parser.add_argument("--python", default=None, help="Python version (e.g. 3.10)")
    parser.add_argument("--cuda", default=None, help="CUDA version (e.g. 12.4)")
    parser.add_argument("--upload", action="store_true", help="Auto-upload to GitHub Releases")
    parser.add_argument("--release-tag", default=None, help="GitHub release tag (default: wheels-{cuda}-py{python})")
    args = parser.parse_args()

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Native CUDA Wheel Builder (CUDA 12.4)")
    print("=" * 60)
    print(f"Output: {output_dir}")
    print(f"Python: {args.python or sys.version.split()[0]}")
    print(f"CUDA:   {args.cuda or os.environ.get('CUDA_VERSION', '12.4')}")
    print()

    # Check prerequisites
    if not check_prerequisites():
        print("\nPrerequisites not met — cannot build")
        sys.exit(1)

    print()

    # Collect all native packages from all manifests
    manifests = find_manifests()
    print(f"Found {len(manifests)} manifests")

    all_packages: dict[str, dict] = {}
    for manifest_path in manifests:
        packages = extract_native_packages(manifest_path)
        for pkg in packages:
            key = pkg["spec"]
            if key not in all_packages:
                all_packages[key] = {**pkg, "manifests": [pkg["manifest"]]}
            else:
                all_packages[key]["manifests"].append(pkg["manifest"])

    # Hardcoded packages that always need native CUDA builds
    HARDCODED_PACKAGES = [
        "diso",
    ]
    for pkg_name in HARDCODED_PACKAGES:
        if pkg_name not in all_packages:
            all_packages[pkg_name] = {
                "name": pkg_name,
                "spec": pkg_name,
                "wheel_available": False,
                "manifests": ["hardcoded"],
            }
            print(f"Added hardcoded package: {pkg_name}")

    # Filter to only packages that need building (no prebuilt wheel)
    to_build = {k: v for k, v in all_packages.items() if not v["wheel_available"]}
    print(f"Native packages found: {len(all_packages)}")
    print(f"Have prebuilt wheel: {len(all_packages) - len(to_build)}")
    print(f"Need source build: {len(to_build)}")
    print()

    if not to_build:
        print("All packages have prebuilt wheels — nothing to build!")
        return

    # Build each package
    built: list[Path] = []
    failed: list[str] = []

    for i, (spec, info) in enumerate(to_build.items(), 1):
        print(f"\n[{i}/{len(to_build)}] {info['name']}")
        print(f"  Used by: {', '.join(info['manifests'])}")
        print(f"  Spec: {spec}")

        whl_path = build_wheel(spec, output_dir)
        if whl_path:
            built.append(whl_path)
        else:
            failed.append(info["name"])

    # Summary
    print("\n" + "=" * 60)
    print("Build Summary")
    print("=" * 60)
    print(f"Built:  {len(built)}")
    print(f"Failed: {len(failed)}")

    if built:
        print(f"\nWheels saved to: {output_dir}")
        total_size = sum(p.stat().st_size for p in built) / 1024 / 1024
        print(f"Total size: {total_size:.1f} MB")
        for p in built:
            print(f"  {p.name} ({p.stat().st_size / 1024 / 1024:.1f} MB)")

    if failed:
        print(f"\nFailed packages:")
        for name in failed:
            print(f"  - {name}")
        # A CUDA wheel build is release infrastructure, not a best-effort cache fill.
        # Partial output must never be reported as a successful build.
        sys.exit(2)

    # Auto-upload to GitHub Releases
    if built and args.upload:
        upload_to_github_release(built, args)

    # Generate manifest snippet
    if built:
        print("\n" + "=" * 60)
        print("Manifest YAML Snippet (copy to your manifest)")
        print("=" * 60)
        for p in built:
            pkg_name = p.name.split("-")[0].replace("_", "-")
            url = f"https://github.com/YOUR_REPO/releases/download/wheels/{p.name}"
            print(f"""
    {pkg_name}:
      available: true
      mode: direct_url
      direct_url: {url}""")


def upload_to_github_release(wheels: list[Path], args):
    """Upload built wheels to GitHub Releases.

    Requires:
        - GitHub CLI (`gh`) installed and authenticated
        - GITHUB_TOKEN environment variable (optional, gh uses it automatically)
    """
    print("\n" + "=" * 60)
    print("Uploading to GitHub Releases")
    print("=" * 60)

    # Check gh CLI
    gh_path = shutil.which("gh")
    if not gh_path:
        print("ERROR: GitHub CLI (gh) not found")
        print("Install: https://cli.github.com/")
        print("Or: sudo apt-get install gh")
        return

    # Get release tag
    release_tag = args.release_tag or f"wheels-{args.cuda}-py{args.python}"
    release_name = f"Native Wheels CUDA {args.cuda} Python {args.python}"
    release_notes = (
        f"Prebuilt CUDA extension wheels\n\n"
        f"- CUDA: {args.cuda}\n"
        f"- Python: {args.python}\n"
        f"- Packages: {', '.join(w.name.split('-')[0].replace('_', '-') for w in wheels)}"
    )

    # Check if release already exists
    result = subprocess.run(
        ["gh", "release", "view", release_tag, "--json", "url"],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        # Create new release
        print(f"Creating release: {release_tag}")
        result = subprocess.run(
            [
                "gh", "release", "create", release_tag,
                "--title", release_name,
                "--notes", release_notes,
                "--latest=false",
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"FAILED to create release: {result.stderr[:300]}")
            return
        print(f"Release created: {release_tag}")
    else:
        print(f"Release already exists: {release_tag}")

    # Upload wheels
    print(f"Uploading {len(wheels)} wheel(s)...")
    for whl in wheels:
        print(f"  Uploading {whl.name}...")
        result = subprocess.run(
            [
                "gh", "release", "upload", release_tag,
                str(whl),
                "--clobber",
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"    FAILED: {result.stderr[:200]}")
        else:
            print(f"    OK")

    # Get release URL
    result = subprocess.run(
        ["gh", "release", "view", release_tag, "--json", "url", "--jq", ".url"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        release_url = result.stdout.strip()
        print(f"\nRelease URL: {release_url}")
        print("\nWheel URLs (for manifest):")
        for whl in wheels:
            url = f"{release_url.replace('/releases/tag/', '/releases/download/')}/{whl.name}"
            print(f"  {whl.name}: {url}")


if __name__ == "__main__":
    main()
