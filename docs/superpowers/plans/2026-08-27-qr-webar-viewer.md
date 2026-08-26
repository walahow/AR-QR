# QR-Triggered WebAR Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static web page that, when opened via a QR-code scan, shows a placeholder 3D object and lets the user place it in AR using the phone's native AR engine (Quick Look on iOS, Scene Viewer on Android).

**Architecture:** A single `index.html` uses Google's `<model-viewer>` web component, which auto-detects the platform and hands off to native AR — no custom camera/tracking/WebXR code is written. The placeholder 3D model is a small hand-generated cube (`.glb`) for Android/desktop; iOS AR needs a `.usdz`, and since a from-scratch `.usdz` isn't practically generatable without Apple tooling, we use Google's official `Astronaut.usdz` sample as an iOS-only placeholder (shape intentionally differs from the cube — this is a temporary stand-in to exercise the iOS AR path, not a matched pair. Replace both files with a real matched asset later).

**Tech Stack:** Plain HTML + `<model-viewer>` (loaded from CDN, no build step), Python 3 standard library only for asset-generation scripts (no pip installs needed except for the QR step), `qrcode` PyPI package for the QR image.

**Notes:**
- No hosting has been chosen yet (out of scope per the design spec) — the QR code will encode a placeholder localhost URL for now, with a clear reminder to regenerate it once a real URL exists.
- No automated test suite applies here — this is static content with no logic to unit test. Each task's "verification" step is a concrete, reproducible check (script output, or a browser check via the Browser tool) rather than a test file.
- Draco/texture compression from the design spec is deferred: the placeholder cube has no textures and is already ~1KB, so compression would add tooling complexity for zero benefit at this stage. Apply real compression when a production model replaces the placeholder (tracked as a note in Task 2, not silently dropped).

---

### Task 1: Scaffold project structure

**Files:**
- Create: `index.html` (empty shell, filled in Task 5)
- Create: `assets/` (directory, via a placeholder `.gitkeep`)
- Create: `scripts/` (directory, via a placeholder `.gitkeep`)

- [ ] **Step 1: Create the directories and an empty index.html**

```bash
mkdir -p assets scripts
touch assets/.gitkeep scripts/.gitkeep
printf '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8" /><title>AR Placeholder Viewer</title></head>\n<body></body>\n</html>\n' > index.html
```

- [ ] **Step 2: Verify structure**

Run: `find . -not -path './.git*' -type f`
Expected output includes:
```
./index.html
./assets/.gitkeep
./scripts/.gitkeep
./docs/superpowers/specs/2026-08-27-qr-webar-viewer-design.md
./docs/superpowers/plans/2026-08-27-qr-webar-viewer.md
```

- [ ] **Step 3: Commit**

```bash
git add index.html assets/.gitkeep scripts/.gitkeep
git commit -m "Scaffold project structure for QR WebAR viewer"
```

---

### Task 2: Generate the placeholder cube model (`assets/model.glb`)

No 3D authoring tool is available/needed — this script hand-builds a minimal valid glTF 2.0 binary (`.glb`) containing a single 15cm orange cube, using only Python's standard library (`json`, `struct`).

**Files:**
- Create: `scripts/generate_cube_glb.py`
- Create (by running the script): `assets/model.glb`

- [ ] **Step 1: Write the generator script**

```python
# scripts/generate_cube_glb.py
import json
import struct

S = 0.075  # half-extent of a 15cm cube, in meters (model-viewer units)

# Each face: (normal, [v0, v1, v2, v3]) with vertices in CCW order as seen
# from outside the cube along the face normal.
FACES = [
    ((0, 0, 1),  [(-S, -S, S), (S, -S, S), (S, S, S), (-S, S, S)]),      # +Z front
    ((0, 0, -1), [(S, -S, -S), (-S, -S, -S), (-S, S, -S), (S, S, -S)]),  # -Z back
    ((1, 0, 0),  [(S, -S, S), (S, -S, -S), (S, S, -S), (S, S, S)]),      # +X right
    ((-1, 0, 0), [(-S, -S, -S), (-S, -S, S), (-S, S, S), (-S, S, -S)]),  # -X left
    ((0, 1, 0),  [(-S, S, S), (S, S, S), (S, S, -S), (-S, S, -S)]),      # +Y top
    ((0, -1, 0), [(-S, -S, -S), (S, -S, -S), (S, -S, S), (-S, -S, S)]),  # -Y bottom
]


def pad(data: bytes, align: int, pad_byte: bytes) -> bytes:
    remainder = len(data) % align
    if remainder == 0:
        return data
    return data + pad_byte * (align - remainder)


def build_geometry():
    positions, normals, indices = [], [], []
    for face_index, (normal, verts) in enumerate(FACES):
        base = face_index * 4
        for v in verts:
            positions.append(v)
            normals.append(normal)
        indices += [base, base + 1, base + 2, base, base + 2, base + 3]
    return positions, normals, indices


def chunk(chunk_type: bytes, data: bytes) -> bytes:
    return struct.pack("<I4s", len(data), chunk_type) + data


def main():
    positions, normals, indices = build_geometry()

    position_bytes = pad(b"".join(struct.pack("<3f", *v) for v in positions), 4, b"\x00")
    normal_bytes = pad(b"".join(struct.pack("<3f", *n) for n in normals), 4, b"\x00")
    index_bytes = pad(b"".join(struct.pack("<H", i) for i in indices), 4, b"\x00")
    bin_chunk = position_bytes + normal_bytes + index_bytes

    xs, ys, zs = zip(*positions)

    gltf = {
        "asset": {"version": "2.0", "generator": "ar-qr placeholder cube generator"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{
            "primitives": [{
                "attributes": {"POSITION": 0, "NORMAL": 1},
                "indices": 2,
                "material": 0,
            }]
        }],
        "materials": [{
            "name": "PlaceholderOrange",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.85, 0.35, 0.1, 1.0],
                "metallicFactor": 0.1,
                "roughnessFactor": 0.6,
            },
        }],
        "accessors": [
            {
                "bufferView": 0, "componentType": 5126, "count": len(positions),
                "type": "VEC3",
                "min": [min(xs), min(ys), min(zs)],
                "max": [max(xs), max(ys), max(zs)],
            },
            {
                "bufferView": 1, "componentType": 5126, "count": len(normals),
                "type": "VEC3",
            },
            {
                "bufferView": 2, "componentType": 5123, "count": len(indices),
                "type": "SCALAR",
            },
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(position_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(position_bytes), "byteLength": len(normal_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(position_bytes) + len(normal_bytes), "byteLength": len(index_bytes), "target": 34963},
        ],
        "buffers": [{"byteLength": len(bin_chunk)}],
    }

    json_chunk = pad(json.dumps(gltf).encode("utf-8"), 4, b" ")
    json_chunk_full = chunk(b"JSON", json_chunk)
    bin_chunk_full = chunk(b"BIN\x00", bin_chunk)

    total_length = 12 + len(json_chunk_full) + len(bin_chunk_full)
    header = struct.pack("<4sII", b"glTF", 2, total_length)

    with open("assets/model.glb", "wb") as f:
        f.write(header + json_chunk_full + bin_chunk_full)

    print(f"Wrote assets/model.glb ({total_length} bytes)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `python scripts/generate_cube_glb.py`
Expected output: `Wrote assets/model.glb (<some number under 2000> bytes)`

- [ ] **Step 3: Sanity-check the file is a valid GLB container**

Run:
```bash
python -c "
with open('assets/model.glb', 'rb') as f:
    magic, version, length = f.read(4), f.read(4), f.read(4)
    print(magic, int.from_bytes(version, 'little'), int.from_bytes(length, 'little'))
"
```
Expected output: `b'glTF' 2 <same number printed in Step 2>`

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_cube_glb.py assets/model.glb
git commit -m "Add generated placeholder cube model (assets/model.glb)"
```

---

### Task 3: Generate the poster image (`assets/poster.png`)

The poster is shown instantly while `model.glb` downloads. This script writes a minimal valid PNG (solid color matching the cube) using only Python's standard library (`struct`, `zlib`) — no Pillow needed.

**Files:**
- Create: `scripts/generate_poster.py`
- Create (by running the script): `assets/poster.png`

- [ ] **Step 1: Write the generator script**

```python
# scripts/generate_poster.py
import struct
import zlib


def chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def make_png(path: str, width: int, height: int, rgb: tuple):
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))

    row = b"\x00" + bytes(rgb) * width  # filter-type byte (0=none) + RGB pixels
    raw = row * height
    idat = chunk(b"IDAT", zlib.compress(raw, 9))
    iend = chunk(b"IEND", b"")

    with open(path, "wb") as f:
        f.write(signature + ihdr + idat + iend)


if __name__ == "__main__":
    make_png("assets/poster.png", 512, 512, (222, 133, 66))  # matches cube's orange
    print("Wrote assets/poster.png")
```

- [ ] **Step 2: Run it**

Run: `python scripts/generate_poster.py`
Expected output: `Wrote assets/poster.png`

- [ ] **Step 3: Verify it's a valid PNG**

Run:
```bash
python -c "
with open('assets/poster.png','rb') as f:
    print(f.read(8) == b'\x89PNG\r\n\x1a\n')
"
```
Expected output: `True`

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_poster.py assets/poster.png
git commit -m "Add generated poster image (assets/poster.png)"
```

---

### Task 4: Add the iOS placeholder model (`assets/model.usdz`)

Fetch Google's official `Astronaut.usdz` sample (from the `model-viewer` project's own shared test assets) as a stand-in so the iOS AR Quick Look path can be exercised end-to-end. This is a placeholder shape mismatch with the cube by design — see the plan header note.

**Files:**
- Create (downloaded): `assets/model.usdz`

- [ ] **Step 1: Download the file**

```bash
curl -L "https://raw.githubusercontent.com/google/model-viewer/master/packages/shared-assets/models/Astronaut.usdz" -o assets/model.usdz
```

- [ ] **Step 2: Verify it downloaded correctly**

Run: `ls -la assets/model.usdz`
Expected: file exists, size approximately 2,145,297 bytes (~2.1 MB).

- [ ] **Step 3: Commit**

```bash
git add assets/model.usdz
git commit -m "Add iOS placeholder model (Astronaut.usdz from model-viewer shared assets)"
```

---

### Task 5: Build the viewer page (`index.html`)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace index.html with the model-viewer page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
  <title>AR Placeholder Viewer</title>
  <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
  <style>
    html, body {
      margin: 0;
      height: 100%;
      background: #111;
    }
    model-viewer {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <model-viewer
    src="assets/model.glb"
    ios-src="assets/model.usdz"
    poster="assets/poster.png"
    alt="A placeholder orange cube"
    ar
    ar-modes="webxr scene-viewer quick-look"
    camera-controls
    auto-rotate
    shadow-intensity="1"
  ></model-viewer>
</body>
</html>
```

- [ ] **Step 2: Set up a local static server for testing (via the Browser tool, not Bash)**

Create `.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "ar-qr-static",
      "runtimeExecutable": "python",
      "runtimeArgs": ["-m", "http.server", "8080"],
      "port": 8080
    }
  ]
}
```

- [ ] **Step 3: Start the preview and load the page**

Use `preview_start` with `name: "ar-qr-static"`, then `navigate` to `http://localhost:8080/index.html`.

- [ ] **Step 4: Verify in the browser**

Take a screenshot and read console messages.
Expected:
- An orange cube is visible (either immediately, or after the poster image briefly shows).
- No errors in the console (a `model-viewer` "AR not supported" info message in a desktop browser is expected and fine — deferred to Task 7's real-device check).

- [ ] **Step 5: Commit**

```bash
git add index.html .claude/launch.json
git commit -m "Add model-viewer page wired to placeholder assets"
```

---

### Task 6: Generate the QR code (`qr.png`)

**Files:**
- Create: `scripts/generate_qr.py`
- Create (by running the script): `qr.png`

- [ ] **Step 1: Install the qrcode package**

```bash
python -m pip install "qrcode[pil]"
```

- [ ] **Step 2: Write the generator script**

```python
# scripts/generate_qr.py
import sys

import qrcode

DEFAULT_URL = "http://localhost:8080/index.html"


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    img = qrcode.make(url)
    img.save("qr.png")
    print(f"Wrote qr.png encoding: {url}")
    if url == DEFAULT_URL:
        print("NOTE: this is a placeholder localhost URL — regenerate once real hosting exists:")
        print("  python scripts/generate_qr.py https://your-real-domain/index.html")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run it**

Run: `python scripts/generate_qr.py`
Expected output:
```
Wrote qr.png encoding: http://localhost:8080/index.html
NOTE: this is a placeholder localhost URL — regenerate once real hosting exists:
  python scripts/generate_qr.py https://your-real-domain/index.html
```

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_qr.py qr.png
git commit -m "Add QR code generator and placeholder qr.png"
```

---

### Task 7: End-to-end verification in the browser

This project has no unit tests to run — this task is the functional verification pass.

**Files:** none (verification only)

- [ ] **Step 1: Confirm the full page loads clean**

With the `ar-qr-static` preview still running, navigate to `http://localhost:8080/index.html`, take a screenshot, and read console messages.
Expected: cube renders, no JS errors in console.

- [ ] **Step 2: Confirm poster shows before the model loads**

Reload the page with network throttling if available, or just note on first paint whether `assets/poster.png`'s orange square is visible before the cube appears.
Expected: no blank/white flash — poster color is visible immediately on load.

- [ ] **Step 3: Confirm resize/mobile viewport behavior**

Use `resize_window` with `preset: "mobile"`, reload, take a screenshot.
Expected: `<model-viewer>` fills the mobile viewport with no layout overflow or scrollbars.

- [ ] **Step 4: Document remaining manual checks (require a real phone + HTTPS, out of scope for this session)**

Note in the commit message (no code change needed) that these still need a real device once hosting exists:
- Scan `qr.png` (regenerated with the real URL) with an iPhone → confirm AR Quick Look opens and places the Astronaut placeholder.
- Scan with an Android phone → confirm Scene Viewer opens and places the cube.

- [ ] **Step 5: Commit the verification note**

```bash
git commit --allow-empty -m "Verify placeholder AR viewer renders correctly in-browser"
```
