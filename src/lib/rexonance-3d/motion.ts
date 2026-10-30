import * as THREE from "three";
import { isRexonanceCorePivot, rexonancePivotAxis, rexonanceTailPivotIndex } from "./contract.ts";

type Joint = {
  node: THREE.Object3D;
  rest: THREE.Quaternion;
  side: THREE.Vector3;
  curl: THREE.Vector3;
  amplitude: number;
  index: number;
};

/** The tail's pivot chain (RX_Tail_Pivot00..N) sways a few degrees, each pivot a little
 * behind the one before it, so the motion travels down the tail; the chest core's pivot
 * (RX_Torso_CorePivot) turns slowly. Both are optional: a model without them is still. */
export function createRexonanceMotion(root: THREE.Object3D) {
  const pivots: { node: THREE.Object3D; index: number }[] = [];
  let core: THREE.Object3D | null = null;
  root.traverse((node) => {
    const index = rexonanceTailPivotIndex(node.name);
    if (index !== null) pivots.push({ node, index });
    else if (!core && isRexonanceCorePivot(node.name)) core = node;
  });
  pivots.sort((a, b) => a.index - b.index);
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const positions = pivots.map(({ node }) =>
    node.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse),
  );
  // The chain's far end: the last pivot's own geometry, or a step past it.
  const tip = new THREE.Vector3();
  if (pivots.length) {
    const last = pivots[pivots.length - 1].node;
    const box = new THREE.Box3().setFromObject(last).applyMatrix4(rootInverse);
    if (!box.isEmpty()) box.getCenter(tip);
    else tip.copy(positions[positions.length - 1]);
  }
  const lever = positions.reduce(
    (sum, position, i) => sum + position.distanceTo(tip) * (0.45 + (0.55 * i) / Math.max(1, pivots.length - 1)),
    0,
  );
  // About 7 cm of travel at the tip whatever the chain's length and count, 0.6-4 degrees per pivot.
  const base = THREE.MathUtils.clamp(lever > 0 ? 0.07 / lever : 0.03, 0.0105, 0.07);
  const rootQuaternion = new THREE.Quaternion();
  root.getWorldQuaternion(rootQuaternion);
  const joints: Joint[] = pivots.map(({ node }, i) => {
    const toward = (positions[i + 1] ?? tip).clone().sub(positions[i]);
    if (toward.lengthSq() < 1e-8) toward.set(0, 1, 0);
    toward.normalize();
    // The tail's own axes when its pivots carry them (rx_bend_axis: about which the curl
    // opens and closes; rx_side_axis: out of the curl's plane); otherwise a side-to-side
    // axis from the chain's direction.
    const bend = rexonancePivotAxis(node.userData, "rx_bend_axis");
    const side = rexonancePivotAxis(node.userData, "rx_side_axis");
    const sideRoot = bend
      ? new THREE.Vector3(...bend)
      : new THREE.Vector3().crossVectors(toward, new THREE.Vector3(1, 0, 0));
    if (sideRoot.lengthSq() < 1e-6) sideRoot.set(0, 1, 0);
    sideRoot.normalize();
    const curlRoot = side
      ? new THREE.Vector3(...side)
      : new THREE.Vector3().crossVectors(sideRoot, toward);
    if (curlRoot.lengthSq() < 1e-6) curlRoot.set(1, 0, 0);
    curlRoot.normalize();
    // Axes into the pivot's own frame (its rest orientation relative to the root).
    const pivotRest = new THREE.Quaternion();
    node.getWorldQuaternion(pivotRest);
    const toLocal = pivotRest.invert().multiply(rootQuaternion);
    return {
      node,
      rest: node.quaternion.clone(),
      side: sideRoot.applyQuaternion(toLocal).normalize(),
      curl: curlRoot.applyQuaternion(toLocal).normalize(),
      amplitude: base * (0.45 + (0.55 * i) / Math.max(1, pivots.length - 1)),
      index: i,
    };
  });
  const coreRest = core ? (core as THREE.Object3D).quaternion.clone() : null;
  const coreAxis = new THREE.Vector3(0, 0, 1);
  let coreRate = 0.22;
  if (core) {
    const node = core as THREE.Object3D;
    const authored = rexonancePivotAxis(node.userData, "rx_spin_axis");
    if (authored) coreAxis.set(...authored);
    const rate = Number(node.userData?.rx_spin_rate);
    if (Number.isFinite(rate)) coreRate = THREE.MathUtils.clamp(rate, -1.5, 1.5);
    const coreWorld = new THREE.Quaternion();
    node.getWorldQuaternion(coreWorld);
    coreAxis.applyQuaternion(coreWorld.invert().multiply(rootQuaternion)).normalize();
  }
  const sway = new THREE.Quaternion();
  const bend = new THREE.Quaternion();
  return {
    tailPivots: joints.length,
    hasCore: Boolean(core),
    /** `motion` 0..1 scales every offset (0 is the authored rest pose). */
    update(time: number, motion: number) {
      for (const joint of joints) {
        const lag = joint.index * 0.42;
        const side = Math.sin(time * 0.85 - lag) * joint.amplitude * motion;
        const curl = Math.sin(time * 0.57 - lag * 1.3 + 1.1) * joint.amplitude * 0.45 * motion;
        sway.setFromAxisAngle(joint.side, side);
        bend.setFromAxisAngle(joint.curl, curl);
        joint.node.quaternion.copy(joint.rest).multiply(sway).multiply(bend);
      }
      if (core && coreRest) {
        sway.setFromAxisAngle(coreAxis, time * coreRate * motion);
        (core as THREE.Object3D).quaternion.copy(coreRest).multiply(sway);
      }
    },
    reset() {
      for (const joint of joints) joint.node.quaternion.copy(joint.rest);
      if (core && coreRest) (core as THREE.Object3D).quaternion.copy(coreRest);
    },
  };
}
