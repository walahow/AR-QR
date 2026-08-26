"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";

const DECODE_INTERVAL_MS = 250;

export default function ScannerPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const router = useRouter();
  const [status, setStatus] = useState("Requesting camera access...");
  const [decodedText, setDecodedText] = useState(null);

  useEffect(() => {
    let stream;
    let intervalId;
    let cancelled = false;

    function decodeFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        return;
      }
      const width = 320;
      const height = Math.round((video.videoHeight / video.videoWidth) * width) || 320;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const code = jsQR(imageData.data, width, height);
      if (code && code.data) {
        handleDecoded(code.data);
      }
    }

    function handleDecoded(text) {
      try {
        const url = new URL(text);
        const isSameOrigin = url.origin === window.location.origin;
        const match = url.pathname.match(/^\/view\/([^/]+)$/);
        if (isSameOrigin && match) {
          clearInterval(intervalId);
          router.push(`/view/${match[1]}`);
          return;
        }
      } catch {
        // not a URL — fall through to showing raw text
      }
      setDecodedText(text);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("Point your camera at a QR code");
        intervalId = setInterval(decodeFrame, DECODE_INTERVAL_MS);
      } catch (err) {
        setStatus(`Camera unavailable: ${err.message}`);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  return (
    <div className="page">
      <h1>Scan QR Code</h1>
      <div className="frame" style={{ width: 280, height: 280, overflow: "hidden" }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <p>{status}</p>
      {decodedText && (
        <p>
          Scanned: <a href={decodedText}>{decodedText}</a>
        </p>
      )}
    </div>
  );
}
