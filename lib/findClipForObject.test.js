import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { findClipForObject } from "./findClipForObject.js";

function makeClip(nodeName, property = ".rotation") {
  const track = new THREE.QuaternionKeyframeTrack(
    `${nodeName}${property}`,
    [0, 1],
    [0, 0, 0, 1, 0, 0, 0, 1]
  );
  return new THREE.AnimationClip(`${nodeName}Clip`, 1, [track]);
}

test("finds the clip whose track targets a node inside the object's subtree", () => {
  const group = new THREE.Group();
  group.name = "Edges2";
  const child = new THREE.Mesh();
  child.name = "Plane";
  group.add(child);

  const matchingClip = makeClip("Plane");
  const unrelatedClip = makeClip("SomethingElse");

  const result = findClipForObject([unrelatedClip, matchingClip], group);

  assert.equal(result, matchingClip);
});

test("matches a track targeting the object itself, not just its descendants", () => {
  const group = new THREE.Group();
  group.name = "Edges2";
  const clip = makeClip("Edges2", ".scale");

  const result = findClipForObject([clip], group);

  assert.equal(result, clip);
});

test("returns null when no clip targets the object's subtree", () => {
  const group = new THREE.Group();
  group.name = "Edges2";
  const unrelatedClip = makeClip("SomethingElse");

  const result = findClipForObject([unrelatedClip], group);

  assert.equal(result, null);
});

test("returns null when the object is null or the animations list is empty", () => {
  assert.equal(findClipForObject([], new THREE.Group()), null);
  assert.equal(findClipForObject([makeClip("X")], null), null);
});
