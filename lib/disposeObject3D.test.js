import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { disposeObject3D } from "./disposeObject3D.js";

test("disposes geometry and material of every mesh in the hierarchy", () => {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  let geometryDisposed = false;
  let materialDisposed = false;
  geometry.dispose = () => {
    geometryDisposed = true;
  };
  material.dispose = () => {
    materialDisposed = true;
  };

  disposeObject3D(group);

  assert.equal(geometryDisposed, true);
  assert.equal(materialDisposed, true);
});

test("ignores non-mesh children without throwing", () => {
  const group = new THREE.Group();
  group.add(new THREE.Group());
  assert.doesNotThrow(() => disposeObject3D(group));
});
