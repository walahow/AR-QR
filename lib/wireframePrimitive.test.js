// lib/wireframePrimitive.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHAPES, isValidShape, buildPrimitiveParams } from "./wireframePrimitive.js";

test("SHAPES lists the five supported shapes", () => {
  assert.deepEqual(SHAPES, ["cube", "sphere", "cylinder", "cone", "pyramid"]);
});

test("isValidShape accepts known shapes and rejects unknown ones", () => {
  assert.equal(isValidShape("cube"), true);
  assert.equal(isValidShape("donut"), false);
});

test("buildPrimitiveParams sizes a cube directly from the bounding box", () => {
  const params = buildPrimitiveParams("cube", { width: 2, height: 3, depth: 4 });
  assert.deepEqual(params, { type: "box", width: 2, height: 3, depth: 4 });
});

test("buildPrimitiveParams sizes a sphere from the largest bounding-box dimension", () => {
  const params = buildPrimitiveParams("sphere", { width: 2, height: 6, depth: 4 });
  assert.deepEqual(params, { type: "sphere", radius: 3 });
});

test("buildPrimitiveParams sizes a cylinder from width/depth radius and height", () => {
  const params = buildPrimitiveParams("cylinder", { width: 2, height: 5, depth: 4 });
  assert.deepEqual(params, { type: "cylinder", radius: 2, height: 5 });
});

test("buildPrimitiveParams sizes a cone the same way as a cylinder, with 32 sides", () => {
  const params = buildPrimitiveParams("cone", { width: 2, height: 5, depth: 4 });
  assert.deepEqual(params, { type: "cone", radius: 2, height: 5, sides: 32 });
});

test("buildPrimitiveParams sizes a pyramid as a 4-sided cone", () => {
  const params = buildPrimitiveParams("pyramid", { width: 2, height: 5, depth: 4 });
  assert.deepEqual(params, { type: "cone", radius: 2, height: 5, sides: 4 });
});

test("buildPrimitiveParams rejects an unknown shape", () => {
  assert.throws(
    () => buildPrimitiveParams("donut", { width: 1, height: 1, depth: 1 }),
    /Unknown shape/
  );
});

test("buildPrimitiveParams rejects a degenerate bounding box", () => {
  assert.throws(
    () => buildPrimitiveParams("cube", { width: 0, height: 1, depth: 1 }),
    /greater than 0/
  );
});
