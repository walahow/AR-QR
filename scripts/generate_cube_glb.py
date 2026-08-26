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
