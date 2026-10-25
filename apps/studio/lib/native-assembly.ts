import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Inspection must restore source glazing rather than making every material opaque. */
export function setInspectionMaterial(material: THREE.MeshStandardMaterial, xray: boolean) {
  const source =
    material.userData.inspectionSource ??
    (material.userData.inspectionSource = {
      transparent: material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite,
    });
  const transparent = xray || source.transparent;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.opacity = xray ? Math.min(0.22, source.opacity) : source.opacity;
  material.depthWrite = xray ? false : source.depthWrite;
}

/** Merge display meshes without changing the authored dimensions used for resizing. */
export function optimizeNativeAssembly(root: THREE.Object3D): THREE.Vector3 {
  root.updateWorldMatrix(true, true);
  // A merged, rotated bounding box can be much larger than the original child bounds.
  const size = new THREE.Box3()
    .setFromObject(root)
    .getSize(new THREE.Vector3())
    .max(new THREE.Vector3(0.001, 0.001, 0.001));
  const inverse = root.matrixWorld.clone().invert(),
    materials = new Map<THREE.Material, THREE.BufferGeometry[]>(),
    meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry && !Array.isArray(obj.material)) {
      let geometry = obj.geometry.clone();
      if (geometry.index) geometry = geometry.toNonIndexed();
      for (const attribute of Object.keys(geometry.attributes))
        if (attribute !== "position" && attribute !== "normal") geometry.deleteAttribute(attribute);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      geometry.applyMatrix4(inverse.clone().multiply(obj.matrixWorld));
      const group = materials.get(obj.material) ?? [];
      group.push(geometry);
      materials.set(obj.material, group);
      meshes.push(obj);
    }
  });
  for (const mesh of meshes) mesh.removeFromParent();
  for (const [material, geometries] of materials) {
    const geometry = mergeGeometries(geometries);
    if (geometry) {
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    geometries.forEach((geometry) => geometry.dispose());
  }
  return size;
}
