"use client";

import Script from "next/script";

export default function ViewerClient({ item }) {
  return (
    <div className="page" style={{ padding: 0, gap: 0 }}>
      <Script
        type="module"
        src="https://unpkg.com/@google/model-viewer@4.3.1/dist/model-viewer.min.js"
        strategy="afterInteractive"
      />
      <div style={{ width: "100%", height: "80vh", background: "#111" }}>
        {/* eslint-disable-next-line react/no-unknown-property */}
        <model-viewer
          src={item.glbUrl}
          ios-src={item.usdzUrl}
          alt={item.name}
          ar
          ar-modes="webxr scene-viewer quick-look"
          camera-controls
          auto-rotate
          shadow-intensity="1"
          style={{ width: "100%", height: "100%" }}
        ></model-viewer>
      </div>
      <div style={{ padding: 16, borderTop: "4px solid #000", width: "100%" }}>
        <h2 style={{ margin: "0 0 8px" }}>{item.name}</h2>
        <p style={{ margin: 0 }}>Tap the AR icon to place this in your space.</p>
      </div>
    </div>
  );
}
