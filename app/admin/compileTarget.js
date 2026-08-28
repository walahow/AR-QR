"use client";

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load QR image for compiling"));
    img.src = url;
  });
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function compileAndUploadTarget(itemId, onProgress) {
  const { Compiler } = await import("mind-ar/dist/mindar-image.prod.js");

  const img = await loadImage(`/api/items/${itemId}/qr`);

  const compiler = new Compiler();
  await withTimeout(
    compiler.compileImageTargets([img], (percent) => {
      onProgress?.(percent);
    }),
    30000,
    "Compiling the AR target timed out. Try again."
  );
  const buffer = await compiler.exportData();

  const res = await fetch(`/api/items/${itemId}/target`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Blob([buffer]),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to upload AR target");
  }

  return res.json();
}
