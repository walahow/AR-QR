import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { buildModelParts } from "./buildModelParts.js";

function makeSolidAndEdges({ solidName = "Solid", edgesName = "Edges", offset = 0 } = {}) {
  const root = new THREE.Group();

  const solidNode = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  solidNode.name = solidName;
  solidNode.position.set(offset, 0, 0);

  const edgesNode = new THREE.Group();
  edgesNode.name = edgesName;
  const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  edgeMesh.position.set(offset, 0, 0);
  edgesNode.add(edgeMesh);

  root.add(solidNode, edgesNode);
  return { root, solidNode, edgesNode, edgeMesh };
}

test("finds Solid and Edges children by case-insensitive name", () => {
  const { root, solidNode, edgesNode } = makeSolidAndEdges({
    solidName: "SOLID",
    edgesName: "edges",
  });

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(result.solid, solidNode);
  assert.equal(result.edges, edgesNode);
});

test("hides every mesh under Edges and attaches a LineSegments2 outline child", () => {
  const { root, edgeMesh } = makeSolidAndEdges();

  buildModelParts(root, new LineMaterial());

  assert.equal(edgeMesh.visible, false);
  assert.equal(edgeMesh.children.length, 1);
  assert.equal(edgeMesh.children[0].isLineSegments2, true);
});

test("recenters the root based on the combined bounding box of Solid and Edges", () => {
  const { root } = makeSolidAndEdges({ offset: 2 });

  buildModelParts(root, new LineMaterial());

  assert.equal(root.position.x, -2);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});

test("returns null parts and leaves the root untouched when Solid or Edges is missing", () => {
  const root = new THREE.Group();
  const onlyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  onlyMesh.name = "Mesh";
  root.add(onlyMesh);

  const result = buildModelParts(root, new LineMaterial());

  assert.deepEqual(result, { solid: null, edges: null });
  assert.equal(root.position.x, 0);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});
