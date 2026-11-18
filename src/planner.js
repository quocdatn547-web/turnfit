(() => {
  "use strict";

  const g = typeof module !== "undefined" ? require("./geometry.js") : globalThis.TurnFitGeometry;

  class Heap {
    entries = [];
    get size() { return this.entries.length; }
    push(id, score) {
      const entries = this.entries;
      let place = entries.length;
      entries.push({ id, score });
      while (place) {
        const parent = (place - 1) >> 1;
        if (entries[parent].score <= score) break;
        entries[place] = entries[parent];
        place = parent;
      }
      entries[place] = { id, score };
    }
    pop() {
      const entries = this.entries;
      const first = entries[0];
      const tail = entries.pop();
      if (entries.length) {
        let place = 0;
        while (2 * place + 1 < entries.length) {
          let child = 2 * place + 1;
          if (child + 1 < entries.length && entries[child + 1].score < entries[child].score) child++;
          if (entries[child].score >= tail.score) break;
          entries[place] = entries[child];
          place = child;
        }
        entries[place] = tail;
      }
      return first.id;
    }
  }

  const moves = [
    [1,0,0], [0,-1,0], [-1,0,0], [0,1,0],
    [1,-1,0], [1,1,0], [-1,-1,0], [-1,1,0],
    [0,0,1], [0,0,-1],
    [1,0,1], [1,0,-1], [0,-1,1], [0,-1,-1],
    [-1,0,1], [-1,0,-1], [0,1,1], [0,1,-1],
  ];

  function search(scene, item, from, to, grid, angles, limit) {
    const minX = -scene.hRun;
    const minY = -scene.vRun;
    const nx = Math.floor((scene.vWidth - minX) / grid) + 1;
    const ny = Math.floor((scene.hWidth - minY) / grid) + 1;
    const plane = nx * ny;
    const count = plane * angles;
    const turn = Math.PI / angles;
    const weight = g.pieceRadius(item) * 0.48;
    const edgeCosts = moves.map(([dx, dy, da]) => Math.hypot(dx, dy) * grid + Math.abs(da) * turn * weight);
    const known = new Float64Array(count).fill(Infinity);
    const distance = new Float64Array(count).fill(NaN);
    const prev = new Int32Array(count).fill(-1);
    const closed = new Uint8Array(count);
    const fringe = new Heap();
    const idOf = (x, y, r) => x + nx * y + plane * r;
    const decode = id => [id % nx, Math.floor(id / nx) % ny, Math.floor(id / plane)];
    const poseOf = (x, y, r) => ({ x: minX + x * grid, y: minY + y * grid, angle: -r * turn });
    const cost = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(g.angleDelta(a.angle, b.angle)) * weight;
    const queueScore = (soFar, pose) => soFar + 1.22 * cost(pose, to);

    function anchors(point, rotation) {
      const x0 = Math.round((point.x - minX) / grid);
      const y0 = Math.round((point.y - minY) / grid);
      const result = [];
      for (let x = Math.max(0, x0 - 1); x <= Math.min(nx - 1, x0 + 1); x++) {
        for (let y = Math.max(0, y0 - 1); y <= Math.min(ny - 1, y0 + 1); y++) {
          const pose = poseOf(x, y, rotation);
          if (g.segmentClearance(scene, item, point, pose) !== null) {
            result.push({ id: idOf(x, y, rotation), pose });
          }
        }
      }
      return result;
    }

    for (const seed of anchors(from, 0)) {
      const initial = cost(seed.pose, from);
      known[seed.id] = initial;
      fringe.push(seed.id, queueScore(initial, seed.pose));
    }
    const exits = new Set(anchors(to, angles / 2).map(anchor => anchor.id));
    if (!exits.size) return { poses: null, expanded: 0, limited: false };

    let expanded = 0;
    while (fringe.size && expanded < limit) {
      const id = fringe.pop();
      if (closed[id]) continue;
      closed[id] = 1;
      expanded++;
      if (exits.has(id)) {
        const poses = [to];
        for (let current = id; current >= 0; current = prev[current]) poses.push(poseOf(...decode(current)));
        poses.push(from);
        return { poses: poses.reverse(), expanded, limited: false };
      }

      const [x, y, r] = decode(id);
      const pose = poseOf(x, y, r);
      const here = g.clearance(scene, item, pose).distance;
      for (let i = 0; i < moves.length; i++) {
        const [dx, dy, dr] = moves[i];
        const ix = x + dx;
        const iy = y + dy;
        if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) continue;
        const nextRotation = (r + dr + angles) % angles;
        const neighbor = idOf(ix, iy, nextRotation);
        const total = known[id] + edgeCosts[i];
        if (closed[neighbor] || total >= known[neighbor]) continue;
        const next = poseOf(ix, iy, nextRotation);
        if (Number.isNaN(distance[neighbor])) distance[neighbor] = g.clearance(scene, item, next).distance;
        const there = distance[neighbor];
        if (there < scene.gap + g.EPSILON || g.segmentClearance(scene, item, pose, next, here, there) === null) continue;
        known[neighbor] = total;
        prev[neighbor] = id;
        fringe.push(neighbor, queueScore(total, next));
      }
    }
    return { poses: null, expanded, limited: fringe.size > 0 };
  }

  function simplify(scene, item, track) {
    const result = [track[0]];
    let left = 0;
    while (left < track.length - 1) {
      let right = Math.min(left + 24, track.length - 1);
      while (right > left + 1 && g.segmentClearance(scene, item, track[left], track[right]) === null) right--;
      if (g.motionLength(item, track[left], track[right]) > g.EPSILON) result.push(track[right]);
      left = right;
    }
    return result;
  }

  function findRoute(scene, item) {
    const { from, to } = g.stations(scene, item);
    if (item.length + scene.gap * 2 + 1 > scene.hRun
        || g.clearance(scene, item, from).distance < scene.gap + g.EPSILON) {
      return { status: "entry-tight" };
    }
    if (item.length + scene.gap * 2 + 1 > scene.vRun
        || g.clearance(scene, item, to).distance < scene.gap + g.EPSILON) {
      return { status: "exit-tight" };
    }
    const coarse = search(scene, item, from, to, 6, 30, 38000);
    const final = coarse.poses ? coarse : search(scene, item, from, to, 3, 60, 125000);
    const expanded = coarse.poses ? coarse.expanded : coarse.expanded + final.expanded;
    if (!final.poses) return { status: "no-route", expanded, limited: final.limited };
    const poses = simplify(scene, item, final.poses);
    const metrics = g.inspectPath(scene, item, poses);
    if (!metrics) return { status: "no-route", expanded, limited: true };
    return { status: "route", poses, expanded, ...metrics };
  }

  const api = { findRoute };
  if (typeof module !== "undefined") module.exports = api;
  else globalThis.TurnFitPlanner = api;
})();
