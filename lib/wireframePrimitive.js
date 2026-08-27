// lib/wireframePrimitive.js
export const SHAPES = ["cube", "sphere", "cylinder", "cone", "pyramid"];

export function isValidShape(shape) {
  return SHAPES.includes(shape);
}

export function buildPrimitiveParams(shape, boundingBox) {
  const { width, height, depth } = boundingBox;
  if (!(width > 0 && height > 0 && depth > 0)) {
    throw new Error("boundingBox dimensions must all be greater than 0");
  }

  const maxDim = Math.max(width, height, depth);
  const radialDim = Math.max(width, depth) / 2;

  switch (shape) {
    case "cube":
      return { type: "box", width, height, depth };
    case "sphere":
      return { type: "sphere", radius: maxDim / 2 };
    case "cylinder":
      return { type: "cylinder", radius: radialDim, height };
    case "cone":
      return { type: "cone", radius: radialDim, height, sides: 32 };
    case "pyramid":
      return { type: "cone", radius: radialDim, height, sides: 4 };
    default:
      throw new Error(`Unknown shape: ${shape}`);
  }
}
