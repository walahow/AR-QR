import { PropertyBinding } from "three";

// Given a loaded GLTF's `animations` array, finds every AnimationClip that
// targets a node inside `object`'s own subtree (including `object` itself).
// A "detail reveal" group is often authored as several separately-animated
// pieces (e.g. "Plane", "Plane.001", "Plane.002", ...) rather than one
// object with one clip, so callers need every matching clip, not just the
// first, to play them all together. Returns an empty array if `object` is
// missing or nothing matches, so callers can fall back to just toggling
// visibility instead.
export function findClipsForObject(animations, object) {
  if (!object || !animations?.length) return [];
  const names = new Set();
  object.traverse((child) => names.add(child.name));
  return animations.filter((clip) =>
    clip.tracks.some((track) => names.has(PropertyBinding.parseTrackName(track.name).nodeName))
  );
}
