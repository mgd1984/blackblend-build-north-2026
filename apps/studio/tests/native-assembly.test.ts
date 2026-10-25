import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { optimizeNativeAssembly, setInspectionMaterial } from "../lib/native-assembly.ts";

test("inspection preserves native glazing and restores opaque surfaces after x-ray", () => {
  const glass = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const wood = new THREE.MeshStandardMaterial();
  for (const material of [glass, wood]) {
    const source = {
      transparent: material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite,
    };
    setInspectionMaterial(material, false);
    assert.equal(material.opacity, source.opacity);
    setInspectionMaterial(material, true);
    assert.equal(material.transparent, true);
    assert.equal(material.opacity, 0.22);
    assert.equal(material.depthWrite, false);
    setInspectionMaterial(material, false);
    assert.equal(material.transparent, source.transparent);
    assert.equal(material.opacity, source.opacity);
    assert.equal(material.depthWrite, source.depthWrite);
  }
});

function worldVertices(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const result: THREE.Vector3[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry;
      for (let i = 0; i < geometry.attributes.position.count; i++)
        result.push(
          new THREE.Vector3()
            .fromBufferAttribute(geometry.attributes.position, i)
            .applyMatrix4(object.matrixWorld),
        );
    }
  });
  return result;
}

test("rotated and mirrored assemblies retain their dimensions and world geometry after display merging", () => {
  for (const mirrored of [false, true]) {
    const parent = new THREE.Group(),
      root = new THREE.Group(),
      material = new THREE.MeshStandardMaterial();
    parent.add(root);
    parent.position.set(1, 0.2, -0.5);
    parent.scale.set(mirrored ? -1 : 1, 1, 1);
    root.rotation.y = 0.46;
    for (const z of [-0.7, 0.7]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.15), material);
      mesh.position.z = z;
      mesh.rotation.y = -0.46;
      root.add(mesh);
    }
    parent.updateMatrixWorld(true);
    const before = worldVertices(root),
      authored = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    const size = optimizeNativeAssembly(root),
      after = worldVertices(root);
    assert.ok(size.distanceTo(authored) < 1e-10);
    assert.equal(after.length, before.length);
    for (const point of after)
      assert.ok(
        before.some((other) => other.distanceTo(point) < 1e-6),
        "Merged display changed a vertex",
      );
    // This is the regression: using the post-merge box would shrink the model on first draw.
    const inflated = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    assert.ok(inflated.z > authored.z * 1.2);
    assert.deepEqual(authored.clone().divide(size).toArray(), [1, 1, 1]);
    // An intentional resize still works relative to the original dimensions.
    assert.deepEqual(
      authored.clone().multiplyScalar(1.25).divide(size).toArray(),
      [1.25, 1.25, 1.25],
    );
  }
});
