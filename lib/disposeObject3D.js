// Disposes geometry and material(s) of every mesh (including LineSegments2
// outline lines, which are Mesh subclasses) under `object`. Object3D.visible
// = false already stops rendering, but GPU buffers/textures still need an
// explicit dispose() to be freed.
export function disposeObject3D(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      Object.values(material).forEach((value) => {
        if (value && typeof value.dispose === "function") {
          value.dispose();
        }
      });
      material.dispose();
    });
  });
}
