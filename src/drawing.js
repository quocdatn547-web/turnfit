(() => {
  "use strict";

  const palettes = [
    { face: "#ca875c", cushion: "#e4b08a", ink: "#794b32", trail: "#ab623a" },
    { face: "#639781", cushion: "#a0beab", ink: "#2c6352", trail: "#357662" },
  ];
  const wallInk = "#4a594c";

  function vertices(s) {
    return [
      [-s.hRun, 0], [0, 0], [0, -s.vRun], [s.vWidth, -s.vRun],
      [s.vWidth, s.hWidth], [-s.hRun, s.hWidth],
    ];
  }

  function camera(width, height, s) {
    const scale = Math.min((width - 82) / (s.vWidth + s.hRun), (height - 83) / (s.hWidth + s.vRun));
    return {
      scale,
      x: (width - scale * (s.vWidth + s.hRun)) / 2 + s.hRun * scale,
      y: (height - scale * (s.hWidth + s.vRun)) / 2 + s.vRun * scale + 4,
    };
  }

  function line(ctx, points) {
    ctx.beginPath();
    points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  }

  function polygon(ctx, points) {
    line(ctx, points);
    ctx.closePath();
  }

  function coordinates(cam, points) {
    return points.map(([x,y]) => [cam.x + x * cam.scale, cam.y + y * cam.scale]);
  }

  function segment(ctx, a, b) {
    line(ctx, [a,b]);
    ctx.stroke();
  }

  function dim(ctx, a, b, label) {
    const vertical = a[0] === b[0];
    const off = vertical ? [3,0] : [0,3];
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#7b8b7b";
    segment(ctx, a, b);
    for (const [x,y] of [a,b]) segment(ctx, [x-off[0],y-off[1]], [x+off[0],y+off[1]]);
    ctx.save();
    ctx.translate((a[0]+b[0])/2, (a[1]+b[1])/2);
    if (vertical) ctx.rotate(-Math.PI/2);
    ctx.font = "600 10px 'Segoe UI',sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#43564a";
    ctx.fillText(label, 0, -5);
    ctx.restore();
  }

  function drawPlan(ctx, width, height, s, cam) {
    ctx.fillStyle = "#f0eee2";
    ctx.fillRect(0,0,width,height);
    ctx.strokeStyle = "#dcdccb";
    ctx.lineWidth = 0.75;
    const grid = 20 * cam.scale;
    for (let x = cam.x % grid; x < width; x += grid) segment(ctx,[x,0],[x,height]);
    for (let y = cam.y % grid; y < height; y += grid) segment(ctx,[0,y],[width,y]);
    const outline = coordinates(cam, vertices(s));
    polygon(ctx, outline);
    ctx.fillStyle = "#fffdf4";
    ctx.fill();

    ctx.save();
    polygon(ctx, outline);
    ctx.clip();
    ctx.strokeStyle = "#dddccc";
    ctx.setLineDash([4,4]);
    const entryLine = coordinates(cam, [[-s.hRun, s.hWidth/2], [s.vWidth/2, s.hWidth/2], [s.vWidth/2, -s.vRun]]);
    line(ctx, entryLine);
    ctx.stroke();
    ctx.restore();

    const [left, corner, top, upperRight, lowerRight, lowerLeft] = outline;
    ctx.strokeStyle = wallInk;
    ctx.lineWidth = 2.7;
    line(ctx, [left, corner, top]);
    ctx.stroke();
    line(ctx, [upperRight, lowerRight, lowerLeft]);
    ctx.stroke();
    ctx.setLineDash([4,3]);
    ctx.strokeStyle = "#67786a";
    ctx.lineWidth = 1.35;
    segment(ctx, lowerLeft, left);
    segment(ctx, top, upperRight);
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left[0],top[1],corner[0]-left[0],corner[1]-top[1]);
    ctx.clip();
    ctx.strokeStyle = "#89938b38";
    ctx.lineWidth = 1;
    for (let x = left[0] - height; x < corner[0] + height; x += 9) {
      segment(ctx,[x,top[1]],[x + corner[1]-top[1],corner[1]]);
    }
    ctx.restore();

    dim(ctx, [left[0]-11,left[1]], [lowerLeft[0]-11,lowerLeft[1]], s.hWidth + " cm");
    dim(ctx, [top[0],top[1]-10], [upperRight[0],upperRight[1]-10], s.vWidth + " cm");
    dim(ctx, [left[0],left[1]-13], [corner[0],corner[1]-13], s.hRun + " cm");
    dim(ctx, [top[0]-12,top[1]], [corner[0]-12,corner[1]], s.vRun + " cm");
    ctx.font = "600 10px 'Segoe UI','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#405445";
    ctx.fillText("入口", left[0]+19, lowerLeft[1]+15);
    ctx.fillText("出口", (upperRight[0]+top[0])/2, top[1]-25);

    const x = width - 15 - 50 * cam.scale;
    const y = height - 17;
    ctx.strokeStyle = "#748271";
    ctx.fillStyle = "#4f6051";
    ctx.lineWidth = 1;
    segment(ctx,[x,y],[x + 50 * cam.scale,y]);
    segment(ctx,[x,y-3],[x,y+3]);
    segment(ctx,[x+50*cam.scale,y-3],[x+50*cam.scale,y+3]);
    ctx.fillText("50 cm",x + 25*cam.scale,y-5);
  }

  function drawRoute(ctx, cam, route, palette) {
    const pts = coordinates(cam,route.poses.map(p => [p.x,p.y]));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.clip();
    ctx.strokeStyle = palette.trail;
    ctx.lineWidth = 1.7;
    ctx.setLineDash([5,4]);
    line(ctx, pts);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fffdf4";
    const [x,y] = pts.at(-1);
    ctx.beginPath();
    ctx.arc(x,y,5,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function furniture(ctx, cam, item, pose, palette, ghost = false) {
    ctx.save();
    ctx.translate(cam.x + pose.x * cam.scale, cam.y + pose.y * cam.scale);
    ctx.rotate(pose.angle);
    const l = item.length * cam.scale;
    const w = item.width * cam.scale;
    if (ghost) {
      ctx.fillStyle = "#c2412a33";
      ctx.strokeStyle = "#ab3728";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5,3]);
      ctx.fillRect(-l/2,-w/2,l,w);
      ctx.strokeRect(-l/2,-w/2,l,w);
      ctx.restore();
      return;
    }
    ctx.lineWidth = 1.5;
    const inset = Math.min(w*0.14,8);
    ctx.shadowColor = "#172a262b";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = palette.face;
    ctx.fillRect(-l/2,-w/2,l,w);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = palette.ink;
    ctx.strokeRect(-l/2,-w/2,l,w);

    ctx.fillStyle = palette.cushion;
    const seatW = Math.max(1,(l - 2*inset - 8)/2);
    for (let i = 0; i < 2; i++) {
      const start = -l/2 + inset + 3 + i * (seatW + 2);
      ctx.beginPath();
      ctx.roundRect(start, -w/2 + inset + 2, seatW, Math.max(1,w-2*inset-4), Math.min(4,w/5));
      ctx.fill();
      ctx.lineWidth = .6;
      ctx.stroke();
    }
    ctx.restore();
  }

  function blockedWall(ctx, cam, s, wall) {
    const corners = vertices(s);
    const segments = {
      entry: [corners[5], corners[0]], exit: [corners[2], corners[3]],
      corner: [corners[0], corners[1], corners[2]],
      right: [corners[3], corners[4]], bottom: [corners[4], corners[5]],
    };
    if (!segments[wall]) return;
    ctx.strokeStyle = "#b83f2d";
    ctx.lineWidth = 3.4;
    line(ctx, coordinates(cam, segments[wall]));
    ctx.stroke();
  }

  function draw(canvas, scene, item, state, index) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 130 || height < 150) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(width*dpr);
    const py = Math.round(height*dpr);
    if (canvas.width !== px) canvas.width = px;
    if (canvas.height !== py) canvas.height = py;
    const ctx = canvas.getContext("2d");
    const cam = camera(width,height,scene);
    ctx.setTransform(px/width,0,0,py/height,0,0);
    drawPlan(ctx,width,height,scene,cam);
    if (state.solution?.status === "route") drawRoute(ctx,cam,state.solution,palettes[index]);
    furniture(ctx,cam,item,state.pose,palettes[index]);
    if (state.ghost) {
      blockedWall(ctx,cam,scene,state.ghost.wall);
      furniture(ctx,cam,item,state.ghost.pose,palettes[index],true);
    }
    return cam;
  }

  globalThis.TurnFitDrawing = { draw };
})();
