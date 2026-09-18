"""Build the SCF ZIP and preserve the Unix executable bit on scf_bootstrap."""
from __future__ import annotations

import stat
import sys
import zipfile
from pathlib import Path


root = Path(__file__).resolve().parent
backend_root = root.parent
output = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else root / "MoodAnchor-tencent-scf.zip"

files = ((backend_root / "server.py", "server.py", 0o644), (root / "scf_bootstrap", "scf_bootstrap", 0o755))
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for source, name, mode in files:
        info = zipfile.ZipInfo(name)
        info.create_system = 3  # Unix metadata; required for the executable launch script.
        info.external_attr = (stat.S_IFREG | mode) << 16
        archive.writestr(info, source.read_bytes().replace(b"\r\n", b"\n"))
print(f"Created {output}")
