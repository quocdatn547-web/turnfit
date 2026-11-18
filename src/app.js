(() => {
  "use strict";

  const g = TurnFitGeometry;
  const d = TurnFitDrawing;
  const form = document.querySelector("#workspace");
  const compute = document.querySelector("#solve");
  const notice = document.querySelector("#compute-status");
  const template = document.querySelector("#card-template");
  const storageKey = "turnfit-dimensions-1";
  const letters = ["A", "B"];
  const demos = ["宽扶手示例", "窄扶手示例"];
  const wallNames = {
    entry: "入口边界", exit: "出口边界", corner: "拐角内墙", right: "出口外墙", bottom: "入口外墙",
  };
  let current = getStored();
  let valid = true;
  let worker;
  let generation = 0;
  let solving = false;
  let hasResults = false;
  let drawTicket = 0;
  const cards = letters.map(makeCard);
  const sceneFields = [...form.querySelectorAll("[data-scene]")];
  for (const field of sceneFields) setRange(field, field.dataset.scene);
  setInputs(current);
  resetCards();
  const observer = new ResizeObserver(requestDraw);
  for (const card of cards) observer.observe(card.canvas);
  showCompute("");
  requestDraw();
  solve();

  function getStored() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey));
      if (g.validate(parsed)) return parsed;
    } catch {
      // Storage may be off for some local file browsers.
    }
    return structuredClone(g.DEMO);
  }

  function persist(config) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
    } catch {
      // The running session remains usable without persistence.
    }
  }

  function setRange(field, key) {
    const [min,max] = g.LIMITS[key];
    field.min = min;
    field.max = max;
    field.step = 1;
    field.required = true;
    field.title = "请输入 " + min + "–" + max + " cm 的整数";
  }

  function setInputs(config) {
    for (const field of sceneFields) field.value = config.scene[field.dataset.scene];
    for (const card of cards) {
      for (const field of card.fields) field.value = config.items[card.index][field.dataset.item];
    }
    form.querySelectorAll("input[type=number]").forEach(field => field.removeAttribute("aria-invalid"));
  }

  function showCompute(text, error = false) {
    notice.textContent = text;
    notice.classList.toggle("error", error);
  }

  function requestDraw() {
    if (drawTicket) return;
    drawTicket = requestAnimationFrame(() => {
      drawTicket = 0;
      for (const card of cards) {
        card.cam = d.draw(card.canvas,current.scene,current.items[card.index],card,card.index);
      }
    });
  }

  function makeCard(letter, index) {
    const article = template.content.firstElementChild.cloneNode(true);
    article.dataset.item = index;
    article.querySelector("h2").textContent = "家具 " + letter;
    article.querySelector(".marker").textContent = letter;
    const card = {
      index, article, canvas: article.querySelector("canvas"), play: article.querySelector(".play"),
      fields: [...article.querySelectorAll("[data-item]")], scrub: article.querySelector(".scrub"),
      range: article.querySelector(".scrub input"), result: article.querySelector(".result"),
      collision: article.querySelector(".collision-note"), frames: 0, progress: 0,
    };
    for (const field of card.fields) {
      setRange(field, field.dataset.item);
      field.setAttribute("aria-label","家具 " + letter + (field.dataset.item === "length" ? " 长度" : " 深度"));
    }
    card.canvas.setAttribute("aria-label","家具 " + letter + " 俯视图，方向键移动，Q 和 E 旋转");
    card.range.setAttribute("aria-label","家具 " + letter + " 路线进度");
    document.querySelector("#cards").append(article);

    for (const button of article.querySelectorAll("[data-action]")) {
      const action = button.dataset.action;
      button.addEventListener("click",() => {
        if (action === "play") return togglePlay(card);
        if (action === "reset") return resetPose(card);
        return rotate(card,action === "left" ? -1 : 1);
      });
    }
    card.range.addEventListener("input", () => {
      stop(card);
      seek(card, Number(card.range.value) / 1000);
    });
    card.canvas.addEventListener("keydown", event => {
      const arrows = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
      const move = arrows[event.key];
      if (move) {
        event.preventDefault();
        const step = event.shiftKey ? 12 : 3;
        attempt(card,{ ...card.pose, x: card.pose.x + move[0]*step, y: card.pose.y + move[1]*step });
      } else if (["q","e"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        rotate(card,event.key.toLowerCase() === "q" ? -1 : 1);
      }
    });
    card.canvas.addEventListener("pointerdown", event => beginDrag(card,event));
    card.canvas.addEventListener("pointermove", event => drag(card,event));
    card.canvas.addEventListener("lostpointercapture", () => drop(card));
    card.canvas.addEventListener("pointercancel", () => drop(card));
    card.canvas.addEventListener("pointerup", () => drop(card));
    return card;
  }

  function readInputs() {
    const values = [...sceneFields, ...cards.flatMap(card => card.fields)];
    for (const field of values) {
      const okay = field.validity.valid && Number.isInteger(field.valueAsNumber);
      field.setAttribute("aria-invalid", String(!okay));
    }
    const input = {
      scene: Object.fromEntries(sceneFields.map(field => [field.dataset.scene,field.valueAsNumber])),
      items: cards.map(card => Object.fromEntries(card.fields.map(field => [field.dataset.item,field.valueAsNumber]))),
    };
    for (const card of cards) {
      const item = input.items[card.index];
      if (item.width > item.length) card.fields.find(field => field.dataset.item === "width").setAttribute("aria-invalid","true");
    }
    return input;
  }

  function stopWorker() {
    generation++;
    if (worker) worker.terminate();
    worker = undefined;
    solving = false;
  }

  function updateDimensions() {
    stopWorker();
    const previous = hasResults;
    hasResults = false;
    const input = readInputs();
    valid = g.validate(input);
    if (valid) {
      current = input;
      persist(current);
    }
    resetCards();
    compute.disabled = !valid;
    const field = form.querySelector("input[aria-invalid=true]");
    const reason = field?.validity.valid ? "家具长度不能小于深度。" : field?.title + "。";
    showCompute(valid ? previous ? "尺寸已更新，点击重新计算。" : "" :
      "检查标红的尺寸。" + reason, !valid);
    requestDraw();
  }

  form.addEventListener("input", event => {
    if (event.target.matches("input[type=number]")) updateDimensions();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    solve();
  });
  document.querySelector("#preset").addEventListener("click", () => {
    setInputs(g.DEMO);
    updateDimensions();
    solve();
  });
  const help = document.querySelector("#help");
  document.querySelector("#open-help").addEventListener("click", () => help.showModal());
  document.querySelector("#close-help").addEventListener("click", () => help.close());

  function resetPose(card) {
    stop(card);
    drop(card);
    const item = current.items[card.index];
    card.pose = g.stations(current.scene,item).from;
    const start = g.clearance(current.scene,item,card.pose);
    card.ghost = undefined;
    card.progress = 0;
    card.range.value = 0;
    card.movable = valid && start.distance >= current.scene.gap + g.EPSILON && (
      item.length + current.scene.gap*2 + 1 <= current.scene.hRun
    );
    for (const button of card.article.querySelectorAll(".manual-actions button")) button.disabled = !card.movable;
    card.collision.textContent = valid && !card.movable ? "起点空间不足，调整入口或家具尺寸后可试搬。" : "";
    requestDraw();
  }

  function resetCards() {
    for (const card of cards) {
      card.solution = undefined;
      const item = current.items[card.index];
      const demo = g.DEMO.items[card.index];
      card.article.querySelector(".item-description").textContent =
        item.length === demo.length && item.width === demo.width ? demos[card.index] : "自定义尺寸";
      resetPose(card);
      updateResult(card);
    }
  }

  function updateResult(card) {
    const status = card.solution?.status;
    const copy = {
      route: ["找到可行路线",
        status === "route" ? "沿路线净距至少 " + (Math.floor(card.solution.lower*10)/10).toFixed(1) +
          " cm · 中心移动 " + (card.solution.translation/100).toFixed(2) + " m" : ""],
      "no-route": ["未找到路线", "可以调整尺寸或手动试搬。"],
      "entry-tight": ["入口空间不足", "家具无法水平摆到设定的起点。"],
      "exit-tight": ["出口空间不足", "家具无法水平摆到设定的终点。"],
    };
    const [title,detail] = copy[status] ?? (solving ? ["正在试搬…","正在检查移动与旋转。"] :
      ["等待计算", "输入尺寸后对比两件家具。"]);
    card.result.dataset.state = status ?? "idle";
    card.result.querySelector(".verdict").textContent = title;
    card.result.querySelector(".detail").textContent = detail;
    card.play.disabled = status !== "route";
    card.scrub.hidden = status !== "route";
    card.range.disabled = status !== "route";
    card.play.textContent = "播放路线";
  }

  function solve() {
    if (!valid || solving) return;
    stopWorker();
    const ticket = generation;
    solving = true;
    hasResults = false;
    compute.disabled = true;
    showCompute("正在比较两件家具…");
    resetCards();
    const snapshot = structuredClone(current);

    function finish(result) {
      if (ticket !== generation) return;
      stopWorker();
      compute.disabled = false;
      if (!result.results) {
        showCompute("计算没有完成，请再试一次。", true);
        for (const card of cards) updateResult(card);
        return;
      }
      hasResults = true;
      showCompute("");
      result.results.forEach((solution,i) => {
        const card = cards[i];
        card.solution = solution;
        updateResult(card);
      });
      requestDraw();
    }

    try {
      const url = URL.createObjectURL(new Blob([TURNFIT_WORKER_SOURCE], {type: "text/javascript"}));
      try {
        worker = new Worker(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      worker.onmessage = event => finish(event.data);
      worker.onerror = event => {
        event.preventDefault();
        fallback();
      };
      worker.postMessage(snapshot);
    } catch {
      fallback();
    }

    function fallback() {
      if (ticket !== generation) return;
      if (worker) worker.terminate();
      worker = undefined;
      setTimeout(() => {
        if (ticket !== generation) return;
        try {
          finish({results:snapshot.items.map(item => TurnFitPlanner.findRoute(snapshot.scene,item))});
        } catch {
          finish({error:true});
        }
      },0);
    }
  }

  function attempt(card, pose) {
    if (!card.movable) return;
    stop(card);
    const item = current.items[card.index];
    const gap = g.segmentClearance(current.scene,item,card.pose,pose);
    if (gap !== null) {
      card.pose = pose;
      card.ghost = undefined;
      card.collision.textContent = "";
    } else {
      const hit = g.clearance(current.scene,item,pose);
      let blocked = { pose, wall: hit.wall };
      if (hit.distance >= current.scene.gap + g.EPSILON) {
        // A pointer can skip an obstacle between events. Locate the first
        // rejected sub-motion for feedback rather than highlight its endpoint.
        let lo = 0, hi = 1;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          const at = g.interpolate(card.pose,pose,mid);
          if (g.segmentClearance(current.scene,item,card.pose,at) === null) hi = mid;
          else lo = mid;
        }
        const at = g.interpolate(card.pose,pose,hi);
        blocked = { pose: at, wall: g.clearance(current.scene,item,at).wall };
      }
      card.ghost = blocked;
      const label = wallNames[blocked.wall];
      const message = g.clearance(current.scene,item,blocked.pose).distance <= 0
        ? "碰到" + label : label + "的预留净距不足";
      card.collision.textContent = message + "，已保留上一位置。";
    }
    card.progress = 0;
    card.range.value = 0;
    requestDraw();
  }

  function rotate(card, direction) {
    attempt(card,{ ...card.pose, angle: card.pose.angle + direction*Math.PI/36 });
  }

  function worldPoint(card, event) {
    const rect = card.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - card.cam.x)/card.cam.scale,
      y: (event.clientY - rect.top - card.cam.y)/card.cam.scale,
    };
  }

  function beginDrag(card, event) {
    if (!card.movable || !card.cam || event.button !== 0 || card.drag) return;
    const point = worldPoint(card,event);
    const cx = point.x - card.pose.x;
    const cy = point.y - card.pose.y;
    const c = Math.cos(card.pose.angle);
    const s = Math.sin(card.pose.angle);
    const item = current.items[card.index];
    if (Math.abs(cx*c+cy*s) > item.length/2 || Math.abs(-cx*s+cy*c) > item.width/2) return;
    event.preventDefault();
    stop(card);
    card.canvas.focus({preventScroll:true});
    card.drag = { id:event.pointerId, cx, cy };
    card.canvas.setPointerCapture(event.pointerId);
    card.canvas.classList.add("dragging");
  }

  function drag(card, event) {
    if (card.drag?.id !== event.pointerId) return;
    const point = worldPoint(card,event);
    attempt(card,{ x:point.x-card.drag.cx,y:point.y-card.drag.cy,angle:card.pose.angle });
  }

  function drop(card) {
    if (!card.drag) return;
    const id = card.drag.id;
    card.drag = undefined;
    if (card.canvas.hasPointerCapture(id)) card.canvas.releasePointerCapture(id);
    card.canvas.classList.remove("dragging");
  }

  function seek(card, fraction) {
    const route = card.solution;
    if (route?.status !== "route") return;
    card.progress = fraction;
    card.range.value = Math.round(fraction*1000);
    card.ghost = undefined;
    card.collision.textContent = "";
    const target = fraction * route.lengths.at(-1);
    let i = 1;
    while (i < route.lengths.length-1 && route.lengths[i] < target) i++;
    const progress = (target - route.lengths[i-1])/(route.lengths[i] - route.lengths[i-1]);
    card.pose = g.interpolate(route.poses[i-1],route.poses[i],g.clamp(progress,0,1));
    requestDraw();
  }

  function stop(card) {
    if (!card.frames) return;
    cancelAnimationFrame(card.frames);
    card.frames = 0;
    card.play.textContent = "播放路线";
  }

  function togglePlay(card) {
    if (card.solution?.status !== "route") return;
    if (card.frames) return stop(card);
    drop(card);
    const start = card.progress === 1 ? 0 : card.progress;
    const duration = g.clamp(card.solution.lengths.at(-1) * 9.6, 2700, 7600);
    const time = performance.now();
    card.play.textContent = "暂停";
    function frame(now) {
      const part = Math.min(1,start + (now - time)/duration);
      seek(card,part);
      if (part < 1) card.frames = requestAnimationFrame(frame);
      else stop(card);
    }
    seek(card,start);
    card.frames = requestAnimationFrame(frame);
  }
})();
