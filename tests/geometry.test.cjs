const assert = require("node:assert/strict");
const test = require("node:test");
const g = require("../src/geometry");
const { findRoute } = require("../src/planner");

const { scene, items } = g.DEMO;
const p = (x,y,angle = 0) => ({x,y,angle});

function pointToLine(point,a,b) {
  const dx = b[0]-a[0];
  const dy = b[1]-a[1];
  const t = Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);
}

function intersects(a,b,c,d) {
  const cross = (x,y,z) => (y[0]-x[0])*(z[1]-x[1])-(y[1]-x[1])*(z[0]-x[0]);
  if (Math.max(a[0],b[0]) < Math.min(c[0],d[0]) || Math.max(c[0],d[0]) < Math.min(a[0],b[0])
    || Math.max(a[1],b[1]) < Math.min(c[1],d[1]) || Math.max(c[1],d[1]) < Math.min(a[1],b[1])) return false;
  return cross(a,b,c)*cross(a,b,d) <= 0 && cross(c,d,a)*cross(c,d,b) <= 0;
}

// Independent calculation in Cartesian geometry. It uses walls and polygon
// segments, whereas the production implementation uses separating axes.
function observedGap(s,item,pose) {
  const walls=[[-s.hRun,0],[0,0],[0,-s.vRun],[s.vWidth,-s.vRun],[s.vWidth,s.hWidth],[-s.hRun,s.hWidth]];
  const a=item.length/2, b=item.width/2;
  const c=Math.cos(pose.angle), q=Math.sin(pose.angle);
  const corners=[[-a,-b],[a,-b],[a,b],[-a,b]].map(([x,y])=>[pose.x+c*x-q*y,pose.y+q*x+c*y]);
  for (const [x,y] of corners) {
    if (x < -s.hRun || y < -s.vRun || x > s.vWidth || y > s.hWidth || (x < 0 && y < 0)) return -1;
  }
  let min = Infinity;
  for (let i=0;i<corners.length;i++) {
    const start=corners[i], end=corners[(i+1)%corners.length];
    for (let j=0;j<walls.length;j++) {
      const wallStart=walls[j], wallEnd=walls[(j+1)%walls.length];
      if (intersects(start,end,wallStart,wallEnd)) return 0;
      min=Math.min(min,pointToLine(start,wallStart,wallEnd),pointToLine(wallStart,start,end));
    }
  }
  return min;
}

function verifyRoute(item, route) {
  assert.equal(route.status,"route");
  const { from,to }=g.stations(scene,item);
  assert.deepEqual(route.poses[0],from);
  assert.deepEqual(route.poses.at(-1),to);
  assert.ok(route.lower >= scene.gap);
  for (let i=1;i<route.poses.length;i++) {
    const a=route.poses[i-1], b=route.poses[i];
    for (let j=0;j<=128;j++) {
      const gap=observedGap(scene,item,g.interpolate(a,b,j/128));
      assert.ok(gap + 1e-8 >= route.lower, "Interpolation crossed a wall or overstated clearance");
    }
  }
}

test("same corridor, two different results and a geometrically checked replay", () => {
  assert.equal(findRoute(scene,items[0]).status,"no-route");
  verifyRoute(items[1],findRoute(scene,items[1]));
});

test("changing the wide model changes the computed outcome", () => {
  const replacement={length:142,width:55};
  verifyRoute(replacement,findRoute(scene,replacement));
});

test("safe endpoints cannot be joined straight through the inner wall", () => {
  const item={length:40,width:20};
  const a=p(-90,50), b=p(50,-90);
  assert.ok(g.clearance(scene,item,a).distance > scene.gap);
  assert.ok(g.clearance(scene,item,b).distance > scene.gap);
  assert.equal(g.segmentClearance(scene,item,a,b),null);
});

test("reports insufficient staging space instead of running a route", () => {
  assert.equal(findRoute({...scene,hWidth:60},items[0]).status,"entry-tight");
  assert.equal(findRoute({...scene,vRun:110},items[1]).status,"exit-tight");
});

test("contact and inaccurate dimensions are distinct from successful motion", () => {
  const item={length:40,width:20};
  assert.equal(g.clearance(scene,item,p(-80,10)).distance,0);
  assert.equal(g.segmentClearance(scene,item,p(-80,12.1),p(-80,10)),null);
  assert.equal(g.validate({...g.DEMO,scene:{...scene,hRun:NaN}}),false);
  assert.equal(g.validate({...g.DEMO,items:[{length:50,width:80},items[1]]}),false);
});
