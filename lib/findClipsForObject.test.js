import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { findClipsForObject } from "./findClipsForObject.js";

function makeClip(nodeName, property = ".rotation") {
  const track = new THREE.QuaternionKeyframeTrack(
    `${nodeName}${property}`,
    [0, 1],
    [0, 0, 0, 1, 0, 0, 0, 1]
  );
  return new THREE.AnimationClip(`${nodeName}Clip`, 1, [track]);
}

test("finds every clip whose track targets a node inside the object's subtree", () => {
  const group = new THREE.Group();
  group.name = "Detail";
  const plane0 = new THREE.Mesh();
  plane0.name = "Plane";
  const plane1 = new THREE.Mesh();
  plane1.name = "Plane.001";
  group.add(plane0, plane1);

  const clip0 = makeClip("Plane");
  const clip1 = makeClip("Plane.001");
  const unrelatedClip = makeClip("SomethingElse");

  const result = findClipsForObject([unrelatedClip, clip0, clip1], group);

  assert.deepEqual(result, [clip0, clip1]);
});

test("matches a track targeting the object itself, not just its descendants", () => {
  const group = new THREE.Group();
  group.name = "Detail";
  const clip = makeClip("Detail", ".scale");

  const result = findClipsForObject([clip], group);

  assert.deepEqual(result, [clip]);
});

test("returns an empty array when no clip targets the object's subtree", () => {
  const group = new THREE.Group();
  group.name = "Detail";
  const unrelatedClip = makeClip("SomethingElse");

  const result = findClipsForObject([unrelatedClip], group);

  assert.deepEqual(result, []);
});

test("returns an empty array when the object is null or the animations list is empty", () => {
  assert.deepEqual(findClipsForObject([], new THREE.Group()), []);
  assert.deepEqual(findClipsForObject([makeClip("X")], null), []);
});
