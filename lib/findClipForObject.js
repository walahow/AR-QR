import { PropertyBinding } from "three";

// Given a loaded GLTF's `animations` array, finds the first AnimationClip
// that targets a node inside `object`'s own subtree (including `object`
// itself) - lets a caller ask "is there an authored animation for this
// specific top-level object" without reaching into track/binding internals
// itself. Returns null if `object` is missing or no clip matches, so callers
// can fall back to just toggling visibility instead.
export function findClipForObject(animations, object) {
  if (!object || !animations?.length) return null;
  const names = new Set();
  object.traverse((child) => names.add(child.name));
  return (
    animations.find((clip) =>
      clip.tracks.some((track) => names.has(PropertyBinding.parseTrackName(track.name).nodeName))
    ) ?? null
  );
}
