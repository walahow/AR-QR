import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildModelParts } from "./buildModelParts.js";

function makeParts({
  solidName = "Solid",
  edgesName = "Edges",
  edges2Name = "Edges2",
  withEdges2 = false,
  offset = 0,
} = {}) {
  const root = new THREE.Group();

  const solidNode = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  solidNode.name = solidName;
  solidNode.position.set(offset, 0, 0);

  const edgesNode = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  edgesNode.name = edgesName;
  edgesNode.position.set(offset, 0, 0);

  root.add(solidNode, edgesNode);

  let edges2Node = null;
  if (withEdges2) {
    edges2Node = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    edges2Node.name = edges2Name;
    root.add(edges2Node);
  }

  return { root, solidNode, edgesNode, edges2Node };
}

test("finds Solid and Edges by name (case-insensitive) and returns them as-is", () => {
  const { root, solidNode, edgesNode } = makeParts({ solidName: "SOLID", edgesName: "edges" });

  const result = buildModelParts(root);

  assert.equal(result.solid, solidNode);
  assert.equal(result.edges, edgesNode);
});

test("recenters the root based on the combined bounding box of Solid and Edges", () => {
  const { root } = makeParts({ offset: 2 });

  buildModelParts(root);

  assert.equal(root.position.x, -2);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});

test("returns the combined bounding box size when Solid and Edges are found", () => {
  const { root } = makeParts();

  const result = buildModelParts(root);

  assert.ok(result.size.equals(new THREE.Vector3(1, 1, 1)));
});

test("size reflects the combined extent of differently-sized Solid and Edges objects", () => {
  const root = new THREE.Group();
  const solidNode = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  solidNode.name = "Solid";
  const edgesNode = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1));
  edgesNode.name = "Edges";
  root.add(solidNode, edgesNode);

  const result = buildModelParts(root);

  assert.ok(result.size.x >= 3);
});

test("hides top-level objects that aren't named Solid, Edges, or Edges2", () => {
  const { root, solidNode, edgesNode } = makeParts();
  const extra = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  extra.name = "SomeLeftoverHelper";
  root.add(extra);

  buildModelParts(root);

  assert.equal(extra.visible, false);
  assert.equal(solidNode.visible, true);
  assert.equal(edgesNode.visible, true);
});

test("returns null solid/edges/edges2, a computed size, and leaves the root untouched when Solid or Edges is missing", () => {
  const root = new THREE.Group();
  const onlyMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4));
  onlyMesh.name = "Mesh";
  root.add(onlyMesh);

  const result = buildModelParts(root);

  assert.equal(result.solid, null);
  assert.equal(result.edges, null);
  assert.equal(result.edges2, null);
  assert.ok(result.size.equals(new THREE.Vector3(2, 3, 4)));
  assert.equal(root.position.x, 0);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});

test("finds an optional Edges2 object by name (case-insensitive) and starts it hidden", () => {
  const { root, edges2Node } = makeParts({ edges2Name: "EDGES2", withEdges2: true });

  const result = buildModelParts(root);

  assert.equal(result.edges2, edges2Node);
  assert.equal(edges2Node.visible, false);
});

test("does not hide Edges2 as a leftover helper", () => {
  const { root, edges2Node } = makeParts({ withEdges2: true });

  const result = buildModelParts(root);

  // Recognized (not incidentally hidden by the leftover-object branch) -
  // its visible = false comes from the deliberate "starts hidden" step,
  // not from being mistaken for an authoring leftover.
  assert.equal(result.edges2, edges2Node);
});

test("returns edges2: null when no Edges2 object is authored", () => {
  const { root } = makeParts({ withEdges2: false });

  const result = buildModelParts(root);

  assert.equal(result.edges2, null);
});
