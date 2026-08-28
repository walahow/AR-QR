"use client";

import { useState } from "react";
import Script from "next/script";
import WireframeViewer from "./WireframeViewer";
import ModeSwitch from "./ModeSwitch";
import CameraARViewer from "./CameraARViewer";

export default function ViewerClient({ item }) {
  const [showWireframe, setShowWireframe] = useState(false);
  const [cameraARActive, setCameraARActive] = useState(false);

  return (
    <div className="page" style={{ padding: 0, gap: 0 }}>
      <Script
        type="module"
        src="https://unpkg.com/@google/model-viewer@4.3.1/dist/model-viewer.min.js"
        strategy="afterInteractive"
      />
      <div style={{ width: "100%", height: "80vh", background: "#111" }}>
        {cameraARActive ? (
          <CameraARViewer
            glbUrl={item.glbUrl}
            shape={item.shape}
            arTargetUrl={item.arTargetUrl}
            onExit={() => setCameraARActive(false)}
          />
        ) : (
          <>
            <div style={{ display: showWireframe ? "none" : "block", width: "100%", height: "100%" }}>
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
            {showWireframe && (
              <div style={{ width: "100%", height: "100%" }}>
                <WireframeViewer glbUrl={item.glbUrl} shape={item.shape} />
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ padding: 16, borderTop: "4px solid #000", width: "100%", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <h2 style={{ margin: 0 }}>{item.name}</h2>
        <ModeSwitch
          value={showWireframe ? "wireframe" : "normal"}
          onChange={(v) => setShowWireframe(v === "wireframe")}
          options={[
            { value: "normal", label: "Normal" },
            { value: "wireframe", label: "Wireframe" },
          ]}
        />
        <p style={{ margin: 0 }}>
          {showWireframe
            ? "Drag to rotate the shape."
            : "Tap the AR icon to place this in your space."}
        </p>
        {!cameraARActive && (
          <button
            type="button"
            onClick={() => setCameraARActive(true)}
            disabled={!item.arTargetUrl}
            title={item.arTargetUrl ? undefined : "AR target not ready for this item yet"}
          >
            {item.arTargetUrl ? "Start AR" : "AR Not Ready"}
          </button>
        )}
      </div>
    </div>
  );
}
