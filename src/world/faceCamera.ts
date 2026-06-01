import * as THREE from 'three'

// Drop-in replacement for drei's <Billboard follow> that runs inside an entity's
// EXISTING useFrame instead of mounting its own. drei's Billboard adds one
// useFrame per instance that orients the object every frame even when it's
// hidden — for a wave of orks that's dozens of redundant per-frame callbacks.
// Calling faceCamera() from the entity's own frame loop (only when the bar is
// visible) gives identical screen-aligned orientation with no extra useFrame.

const _cq = new THREE.Quaternion()
const _pq = new THREE.Quaternion()

/** Orient `g` to face the camera (screen-aligned), cancelling parent rotation. */
export function faceCamera(g: THREE.Object3D, camera: THREE.Camera): void {
  camera.getWorldQuaternion(_cq)
  if (g.parent) {
    g.parent.getWorldQuaternion(_pq)
    g.quaternion.copy(_pq.invert().multiply(_cq))
  } else {
    g.quaternion.copy(_cq)
  }
}
