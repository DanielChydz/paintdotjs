"""Bundle corresponding codec sources alongside downloadable application builds."""
from pathlib import Path
import runpy
import sys
import tarfile

root = Path(__file__).resolve().parents[1]
fetched = runpy.run_path(str(root / "scripts/codecs/fetch_sources.py"))
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "dist/paintdotjs-codec-sources.tar.gz"
output.parent.mkdir(parents=True, exist_ok=True)
files = list((root / "scripts/codecs").glob("*.*")) + [
    root / "scripts/build_image_encoders.sh",
    root / "scripts/package_codec_sources.py",
    root / "docs/image-encoders.md",
    root / "LICENSE.md",
    root / "NOTICE.md",
]
files += list((root / "assets/licenses").glob("*"))
files += list(fetched["cache"].glob("*.tar.gz"))
with tarfile.open(output, "w:gz") as archive:
    for filename in sorted(files):
        archive.add(filename, arcname=str(filename.relative_to(root)))
print(f"Bundled corresponding codec sources: {output}")
