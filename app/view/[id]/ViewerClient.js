"use client";

import { useState } from "react";
import ModelCanvas from "./ModelCanvas";
import ModeSwitch from "./ModeSwitch";
import CameraARViewer from "./CameraARViewer";

export default function ViewerClient({ item }) {
  const [showWireframe, setShowWireframe] = useState(false);
  const [cameraARActive, setCameraARActive] = useState(false);
  const [hasEdges, setHasEdges] = useState(true);

  return (
    <div className="page" style={{ padding: 0, gap: 0 }}>
      <div style={{ width: "100%", height: "80vh", background: "#111" }}>
        {cameraARActive ? (
          <CameraARViewer
            glbUrl={item.glbUrl}
            arTargetUrl={item.arTargetUrl}
            onExit={() => setCameraARActive(false)}
          />
        ) : (
          <ModelCanvas
            glbUrl={item.glbUrl}
            mode={showWireframe ? "edges" : "solid"}
            onModelInfo={({ hasEdges }) => setHasEdges(hasEdges)}
          />
        )}
      </div>
      <div style={{ padding: 16, borderTop: "4px solid #000", width: "100%", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        {!cameraARActive && (
          <>
            <h2 style={{ margin: 0 }}>{item.name}</h2>
            <ModeSwitch
              value={showWireframe ? "wireframe" : "normal"}
              onChange={(v) => setShowWireframe(v === "wireframe")}
              options={[
                { value: "normal", label: "Normal" },
                {
                  value: "wireframe",
                  label: "Wireframe",
                  disabled: !hasEdges,
                  disabledReason: "This item's model doesn't have separate Solid/Edges objects",
                },
              ]}
            />
            <p style={{ margin: 0 }}>
              {showWireframe
                ? "Drag to rotate the shape."
                : "Drag to rotate. Tap Start AR to view it in your space."}
            </p>
            <button
              type="button"
              onClick={() => setCameraARActive(true)}
              disabled={!item.arTargetUrl}
              title={item.arTargetUrl ? undefined : "AR target not ready for this item yet"}
            >
              {item.arTargetUrl ? "Start AR" : "AR Not Ready"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
