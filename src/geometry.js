(() => {
  "use strict";

  const HALF_TURN = Math.PI;
  const RIGHT = Math.PI / 2;
  const EPSILON = 1e-7;
  const LIMITS = {
    hWidth: [55, 250], vWidth: [55, 250],
    hRun: [100, 650], vRun: [100, 650],
    length: [40, 340], width: [20, 160], gap: [0, 12],
  };
  const DEMO = {
    scene: { hWidth: 104, vWidth: 111, hRun: 330, vRun: 315, gap: 2 },
    items: [
      { length: 226, width: 88 },
      { length: 148, width: 58 },
    ],
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function validate(input) {
    function inRange(key, value) {
      const [min, max] = LIMITS[key];
      return Number.isInteger(value) && value >= min && value <= max;
    }
    if (!input || !input.scene || !Array.isArray(input.items) || input.items.length !== 2) return false;
    return ["hWidth", "vWidth", "hRun", "vRun", "gap"].every(key => inRange(key, input.scene[key]))
      && input.items.every(item => item && inRange("length", item.length)
        && inRange("width", item.width) && item.length >= item.width);
  }

  function angleDelta(from, to) {
    return ((to - from + RIGHT) % HALF_TURN + HALF_TURN) % HALF_TURN - RIGHT;
  }

  function interpolate(from, to, t) {
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      angle: from.angle + angleDelta(from.angle, to.angle) * t,
    };
  }

  function pieceRadius(item) {
    return Math.hypot(item.length, item.width) / 2;
  }

  function motionLength(item, from, to) {
    return Math.hypot(to.x - from.x, to.y - from.y)
      + pieceRadius(item) * Math.abs(angleDelta(from.angle, to.angle));
  }

  function stations(scene, item) {
    // Require the furniture to be wholly within the appropriate straight arm.
    // The retreated positions leave at least the requested gap at the end walls.
    return {
      from: { x: -scene.hRun + item.length / 2 + scene.gap + 1, y: scene.hWidth / 2, angle: 0 },
      to: { x: scene.vWidth / 2, y: -scene.vRun + item.length / 2 + scene.gap + 1, angle: -RIGHT },
    };
  }

  function clearance(scene, item, pose) {
    const { x, y, angle } = pose;
    const a = item.length / 2;
    const b = item.width / 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ax = a * c;
    const ay = a * s;
    const bx = -b * s;
    const by = b * c;
    const ex = Math.abs(ax) + Math.abs(bx);
    const ey = Math.abs(ay) + Math.abs(by);
    let distance = x - ex + scene.hRun;
    let wall = "entry";
    const right = scene.vWidth - x - ex;
    if (right < distance) { distance = right; wall = "right"; }
    const top = y - ey + scene.vRun;
    if (top < distance) { distance = top; wall = "exit"; }
    const bottom = scene.hWidth - y - ey;
    if (bottom < distance) { distance = bottom; wall = "bottom"; }

    // The forbidden inner quadrant is x <= 0 and y <= 0. Check the
    // separating axes of the rectangle and the quadrant. On an axis with
    // components of opposing sign, the quadrant has unbounded projection.
    const pu = c * x + s * y;
    const pv = -s * x + c * y;
    let insideGap = Math.max(x - ex, y - ey);
    if (c * s >= 0) insideGap = Math.max(insideGap, (c + s >= 0 ? pu : -pu) - a);
    if (-s * c >= 0) insideGap = Math.max(insideGap, (-s + c >= 0 ? pv : -pv) - b);
    if (insideGap > 0) {
      // In 2D the minimum comes from a corner of either shape. The only
      // finite vertex of the forbidden quadrant is the turn at (0, 0).
      insideGap = Math.hypot(Math.max(Math.abs(pu) - a, 0), Math.max(Math.abs(pv) - b, 0));
      for (const u of [-1, 1]) {
        for (const v of [-1, 1]) {
          const ox = Math.max(0, x + u * ax + v * bx);
          const oy = Math.max(0, y + u * ay + v * by);
          insideGap = Math.min(insideGap, Math.hypot(ox, oy));
        }
      }
    }
    return insideGap < distance ? { distance: insideGap, wall: "corner" } : { distance, wall };
  }

  function segmentClearance(scene, item, from, to, first, last) {
    const minimum = scene.gap + EPSILON;
    const head = first ?? clearance(scene, item, from).distance;
    const tail = last ?? clearance(scene, item, to).distance;

    // Any point on the moving rectangle travels no more than the length
    // used below. A verified endpoint or midpoint therefore provides a
    // lower bound valid between samples, not only at the samples.
    function bound(a, b, ca, cb, travel, depth) {
      if (Math.min(ca, cb) < minimum) return null;
      const ends = Math.max(Math.min(ca, cb) - travel / 2, Math.max(ca, cb) - travel);
      if (ends >= minimum) return ends;
      const mid = interpolate(a, b, 0.5);
      const cm = clearance(scene, item, mid).distance;
      if (cm < minimum) return null;
      if (cm - travel / 2 >= minimum) return cm - travel / 2;
      if (depth === 0) return null;
      const left = bound(a, mid, ca, cm, travel / 2, depth - 1);
      if (left === null) return null;
      const right = bound(mid, b, cm, cb, travel / 2, depth - 1);
      return right === null ? null : Math.min(left, right);
    }

    return bound(from, to, head, tail, motionLength(item, from, to), 8);
  }

  function inspectPath(scene, item, poses) {
    if (poses.length < 2) return null;
    let lower = Infinity;
    let translation = 0;
    const lengths = [0];
    for (let i = 1; i < poses.length; i++) {
      const from = poses[i - 1];
      const to = poses[i];
      const edge = segmentClearance(scene, item, from, to);
      if (edge === null) return null;
      lower = Math.min(lower, edge);
      translation += Math.hypot(to.x - from.x, to.y - from.y);
      lengths.push(lengths[i - 1] + motionLength(item, from, to));
    }
    return { lower, translation, lengths };
  }

  const api = { DEMO, LIMITS, RIGHT, EPSILON, clamp, validate, angleDelta,
    interpolate, pieceRadius, motionLength, stations, clearance, segmentClearance, inspectPath };
  if (typeof module !== "undefined") module.exports = api;
  else globalThis.TurnFitGeometry = api;
})();
