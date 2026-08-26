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
