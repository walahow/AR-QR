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
