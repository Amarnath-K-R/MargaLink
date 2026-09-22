import type * as THREE from "three";

// The traversal shape shared by both scenes' opacity animation — walk a
// group's meshes and hand each material to `apply`. The *policy* stays
// with each caller: ThreePaperScene's setOpacity below assigns a fresh,
// scroll-position-driven absolute value every frame; ThreeIntroScene's own
// call site (see its render loop) multiplies the current opacity down for
// a one-shot fade-out-and-unmount. Different policies over the same
// traversal shape, not one being a copy of the other — don't unify them
// further than this.
export function forEachMaterial(
  group: THREE.Object3D,
  apply: (material: THREE.Material, mesh: THREE.Mesh) => void,
) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => apply(material, mesh));
  });
}

export function setOpacity(group: THREE.Group, opacity: number) {
  forEachMaterial(group, (material, mesh) => {
    // A transparent mesh still writes the depth buffer by default even at
    // opacity 0 — an "invisible" panel (e.g. reviewGroup's solid box) can
    // occlude whatever's drawn behind it, punching a paper-colored hole in
    // the paper. Skip rendering entirely once it's faded out instead.
    mesh.visible = opacity > 0.002;
    material.transparent = true;
    material.opacity = opacity;
  });
}
