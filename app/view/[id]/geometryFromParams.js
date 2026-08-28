import * as THREE from "three";

export function createGeometryFromParams(params) {
  switch (params.type) {
    case "box":
      return new THREE.BoxGeometry(params.width, params.height, params.depth);
    case "sphere":
      return new THREE.SphereGeometry(params.radius, 24, 16);
    case "cylinder":
      return new THREE.CylinderGeometry(params.radius, params.radius, params.height, 32);
    case "cone":
      return new THREE.ConeGeometry(params.radius, params.height, params.sides);
    default:
      throw new Error(`Unknown geometry type: ${params.type}`);
  }
}
