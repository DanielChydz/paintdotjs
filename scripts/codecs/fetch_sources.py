"""Fetch and verify the exact sources used by build_image_encoders.sh."""
import hashlib
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen

root = Path(__file__).resolve().parents[2]
cache = root / ".tmp/image-encoders"
cache.mkdir(parents=True, exist_ok=True)
for name, source in json.loads((root / "scripts/codecs/sources.json").read_text()).items():
    archive = cache / (name + ".tar.gz")
    if not archive.exists():
        with urlopen(source["url"], timeout=120) as response:
            archive.write_bytes(response.read())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != source["sha256"]:
        raise ValueError(f"Source checksum mismatch: {name}")
    destination = cache / (name + "-" + source["version"])
    if not destination.exists():
        with tarfile.open(archive) as contents:
            contents.extractall(cache, filter="data")
    assert destination.is_dir(), f"Missing source directory: {destination}"
