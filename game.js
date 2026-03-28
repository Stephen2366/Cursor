(() => {
  "use strict";

  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  const $score = document.getElementById("score");
  const $best = document.getElementById("best");
  const $dash = document.getElementById("dash");
  const $rift = document.getElementById("rift");
  const $overlay = document.getElementById("overlay");
  const $overlayTitle = document.getElementById("overlayTitle");
  const $overlaySub = document.getElementById("overlaySub");
  const $btnRestart = document.getElementById("btnRestart");

  const W = canvas.width;
  const H = canvas.height;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const len = (x, y) => Math.hypot(x, y);
  const rand = (a, b) => a + Math.random() * (b - a);

  const storageKey = "mini_dodge_best_v1";
  const getBest = () => Number(localStorage.getItem(storageKey) || 0);
  const setBest = (n) => localStorage.setItem(storageKey, String(n));

  const keys = new Set();
  const onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "r"].includes(k)) {
      e.preventDefault();
    }
    if (down) keys.add(k);
    else keys.delete(k);
  };
  window.addEventListener("keydown", (e) => onKey(e, true), { passive: false });
  window.addEventListener("keyup", (e) => onKey(e, false), { passive: false });

  const state = {
    running: true,
    t: 0,
    score: 0,
    best: getBest(),
    difficulty: 0,
    shake: 0,
    timeWarp: 0,
    riftSpawnTimer: 5,
    lastTs: performance.now(),
  };

  const player = {
    x: W * 0.5,
    y: H * 0.75,
    r: 12,
    vx: 0,
    vy: 0,
    maxSpeed: 340,
    accel: 1500,
    friction: 0.86,
    dashCd: 0,
    dashCdMax: 1.15,
    dashTime: 0,
    dashTimeMax: 0.12,
    dashSpeed: 900,
    invuln: 0,
    invulnMax: 0.10,
    facingX: 0,
    facingY: -1,
  };

  /** @type {{x:number,y:number,vx:number,vy:number,r:number,spin:number,phase:number}[]} */
  let rocks = [];
  /** @type {{x:number,y:number,r:number,ttl:number,pulse:number}|null} */
  let rift = null;

  const reset = () => {
    state.running = true;
    state.t = 0;
    state.score = 0;
    state.difficulty = 0;
    state.shake = 0;
    state.timeWarp = 0;
    state.riftSpawnTimer = 4.2;
    state.lastTs = performance.now();

    player.x = W * 0.5;
    player.y = H * 0.75;
    player.vx = 0;
    player.vy = 0;
    player.dashCd = 0;
    player.dashTime = 0;
    player.invuln = 0;
    player.facingX = 0;
    player.facingY = -1;

    rocks = [];
    rift = null;
    hideOverlay();
    renderHud();
  };

  const showOverlay = (title, sub) => {
    $overlayTitle.textContent = title;
    $overlaySub.textContent = sub;
    $overlay.classList.remove("hidden");
  };
  const hideOverlay = () => $overlay.classList.add("hidden");

  $btnRestart.addEventListener("click", reset);

  const spawnRock = () => {
    // 从上方或左右刷入，稍微偏向上方，保证可玩性
    const side = Math.random();
    let x, y, vx, vy;
    const speed = rand(140, 240) + state.difficulty * 55;
    if (side < 0.65) {
      x = rand(40, W - 40);
      y = -30;
      vx = rand(-0.35, 0.35) * speed;
      vy = speed * rand(0.85, 1.15);
    } else if (side < 0.825) {
      x = -30;
      y = rand(40, H * 0.7);
      vx = speed * rand(0.85, 1.1);
      vy = rand(-0.2, 0.3) * speed;
    } else {
      x = W + 30;
      y = rand(40, H * 0.7);
      vx = -speed * rand(0.85, 1.1);
      vy = rand(-0.2, 0.3) * speed;
    }
    const r = rand(10, 22) + state.difficulty * 2.3;
    rocks.push({
      x,
      y,
      vx,
      vy,
      r,
      spin: rand(-3, 3),
      phase: rand(0, Math.PI * 2),
    });
  };

  const renderHud = () => {
    $score.textContent = String(Math.floor(state.score));
    $best.textContent = String(Math.floor(state.best));
    if (player.dashCd <= 0) $dash.textContent = "就绪";
    else $dash.textContent = `${Math.ceil(player.dashCd * 10) / 10}s`;
    if (state.timeWarp > 0) {
      $rift.textContent = `减速中 ${Math.ceil(state.timeWarp * 10) / 10}s`;
    } else if (rift) {
      $rift.textContent = "可拾取";
    } else {
      $rift.textContent = "未出现";
    }
  };

  const endGame = () => {
    state.running = false;
    state.shake = 10;
    state.best = Math.max(state.best, Math.floor(state.score));
    setBest(state.best);
    renderHud();
    showOverlay("游戏结束", `本次得分：${Math.floor(state.score)} · 按 R 重新开始`);
  };

  const readMove = () => {
    let ax = 0,
      ay = 0;
    if (keys.has("arrowleft") || keys.has("a")) ax -= 1;
    if (keys.has("arrowright") || keys.has("d")) ax += 1;
    if (keys.has("arrowup") || keys.has("w")) ay -= 1;
    if (keys.has("arrowdown") || keys.has("s")) ay += 1;
    const m = len(ax, ay);
    if (m > 0) {
      ax /= m;
      ay /= m;
      player.facingX = ax;
      player.facingY = ay;
    }
    return { ax, ay };
  };

  const spawnRift = () => {
    if (rift || state.t < 6) return;
    rift = {
      x: rand(110, W - 110),
      y: rand(100, H - 130),
      r: 15,
      ttl: 8.2,
      pulse: rand(0, Math.PI * 2),
    };
  };

  const update = (dt) => {
    state.t += dt;
    // 难度随时间上升（0~3.2 左右）
    state.difficulty = clamp(state.t / 22, 0, 3.2);
    const scoreFactor = state.timeWarp > 0 ? 1.8 : 1;
    state.score += dt * (10 + state.difficulty * 7) * scoreFactor;

    if (player.dashCd > 0) player.dashCd -= dt;
    if (player.dashTime > 0) player.dashTime -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (state.timeWarp > 0) state.timeWarp -= dt;

    if (!rift) {
      state.riftSpawnTimer -= dt;
      if (state.riftSpawnTimer <= 0) {
        spawnRift();
        state.riftSpawnTimer = rand(9.5, 14);
      }
    }

    // 生成节奏随难度变化
    const baseRate = 1.4; // 每秒
    const rate = baseRate + state.difficulty * 0.95;
    const expected = rate * dt;
    if (Math.random() < expected) spawnRock();
    if (state.difficulty > 1.2 && Math.random() < expected * 0.55) spawnRock();

    // 玩家运动
    const { ax, ay } = readMove();
    const isDashPressed = keys.has(" ");
    if (isDashPressed && player.dashCd <= 0 && (ax !== 0 || ay !== 0)) {
      player.dashCd = player.dashCdMax;
      player.dashTime = player.dashTimeMax;
      player.invuln = player.invulnMax;
      player.vx = ax * player.dashSpeed;
      player.vy = ay * player.dashSpeed;
      state.shake = 4;
    }

    if (player.dashTime <= 0) {
      player.vx += ax * player.accel * dt;
      player.vy += ay * player.accel * dt;
      player.vx *= Math.pow(player.friction, dt * 60);
      player.vy *= Math.pow(player.friction, dt * 60);
      const sp = len(player.vx, player.vy);
      if (sp > player.maxSpeed) {
        player.vx = (player.vx / sp) * player.maxSpeed;
        player.vy = (player.vy / sp) * player.maxSpeed;
      }
    } else {
      // 冲刺期间略衰减，防止过长距离
      player.vx *= Math.pow(0.92, dt * 60);
      player.vy *= Math.pow(0.92, dt * 60);
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, player.r + 6, W - player.r - 6);
    player.y = clamp(player.y, player.r + 6, H - player.r - 6);

    // 陨石更新
    const timeScale = state.timeWarp > 0 ? 0.45 : 1;
    for (const r of rocks) {
      r.x += r.vx * dt * timeScale;
      r.y += r.vy * dt * timeScale;
      // 轻微摆动，让轨迹更“活”
      r.phase += dt * r.spin * timeScale;
      r.x += Math.sin(r.phase) * dt * 22 * timeScale;
    }
    rocks = rocks.filter((r) => r.x > -120 && r.x < W + 120 && r.y > -160 && r.y < H + 160);

    if (rift) {
      rift.ttl -= dt;
      rift.pulse += dt * 4;
      const d = len(player.x - rift.x, player.y - rift.y);
      if (d < player.r + rift.r + 3) {
        state.timeWarp = 3.5;
        state.shake = Math.max(state.shake, 5);
        player.invuln = Math.max(player.invuln, 0.2);
        rift = null;
      } else if (rift.ttl <= 0) {
        rift = null;
      }
    }

    // 碰撞检测
    if (player.invuln <= 0) {
      for (const r of rocks) {
        const d = len(player.x - r.x, player.y - r.y);
        if (d < player.r + r.r) {
          endGame();
          break;
        }
      }
    }

    if (!state.running) return;

    // 重开
    if (keys.has("r")) reset();
  };

  const drawBackground = (t) => {
    // 暗色渐变背景
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#070A12");
    g.addColorStop(1, "#0B1222");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 星点
    const tw = 0.6 + 0.4 * Math.sin(t * 0.9);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#DCE7FF";
    for (let i = 0; i < 85; i++) {
      const x = (i * 191) % W;
      const y = (i * 97) % H;
      const s = ((i % 7) + 1) * 0.35;
      ctx.globalAlpha = 0.12 + 0.22 * ((i % 5) / 4) * tw;
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  };

  const drawRock = (r) => {
    const grd = ctx.createRadialGradient(r.x - r.r * 0.35, r.y - r.r * 0.35, r.r * 0.3, r.x, r.y, r.r);
    grd.addColorStop(0, "#F7F1FF");
    grd.addColorStop(0.18, "#BDAAFF");
    grd.addColorStop(0.7, "#5E48E6");
    grd.addColorStop(1, "#3A2A9B");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawRift = (orb) => {
    const pulse = 0.65 + Math.sin(orb.pulse) * 0.35;
    const rr = orb.r + pulse * 3;

    const ring = ctx.createRadialGradient(orb.x, orb.y, rr * 0.3, orb.x, orb.y, rr * 2.8);
    ring.addColorStop(0, "rgba(116,239,255,.6)");
    ring.addColorStop(0.55, "rgba(44,178,255,.25)");
    ring.addColorStop(1, "rgba(44,178,255,0)");
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, rr * 2.8, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(orb.x - 3, orb.y - 3, 2, orb.x, orb.y, rr);
    core.addColorStop(0, "#E6FCFF");
    core.addColorStop(0.35, "#9AF2FF");
    core.addColorStop(1, "#2CB2FF");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, rr, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, rr + 5, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawPlayer = () => {
    // 光环
    ctx.globalAlpha = 0.9;
    const glow = ctx.createRadialGradient(player.x, player.y, 2, player.x, player.y, player.r * 2.6);
    glow.addColorStop(0, "rgba(53,230,165,.55)");
    glow.addColorStop(0.4, "rgba(124,92,255,.35)");
    glow.addColorStop(1, "rgba(124,92,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 主体
    const body = ctx.createRadialGradient(player.x - 4, player.y - 5, 2, player.x, player.y, player.r);
    body.addColorStop(0, "#FFFFFF");
    body.addColorStop(0.25, "#D5FFF0");
    body.addColorStop(1, "#35E6A5");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();

    // 方向小箭头
    const fx = player.facingX;
    const fy = player.facingY;
    const n = len(fx, fy) || 1;
    const ux = fx / n;
    const uy = fy / n;
    const px = -uy;
    const py = ux;
    const tipX = player.x + ux * (player.r + 10);
    const tipY = player.y + uy * (player.r + 10);
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(player.x + px * 6, player.y + py * 6);
    ctx.lineTo(player.x - px * 6, player.y - py * 6);
    ctx.closePath();
    ctx.fill();

    // 无敌闪烁
    if (player.invuln > 0) {
      const p = player.invuln / player.invulnMax;
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.55 * p})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 6 + (1 - p) * 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const draw = () => {
    const t = state.t;
    drawBackground(t);

    // 轻微屏幕震动
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 0.6);
    const sx = (Math.random() - 0.5) * state.shake;
    const sy = (Math.random() - 0.5) * state.shake;
    ctx.save();
    ctx.translate(sx, sy);

    // 预警线（提示边缘更危险）
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "rgba(255,77,109,.25)";
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.globalAlpha = 1;

    // 陨石
    for (const r of rocks) drawRock(r);
    // 时间裂隙道具
    if (rift) drawRift(rift);
    // 玩家
    drawPlayer();

    ctx.restore();

    if (state.timeWarp > 0) {
      const alpha = 0.12 + 0.07 * Math.sin(state.t * 8);
      ctx.fillStyle = `rgba(110, 224, 255, ${alpha})`;
      ctx.fillRect(0, 0, W, H);
    }

    // 角落小提示
    ctx.fillStyle = "rgba(234,242,255,.72)";
    ctx.font = "600 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Microsoft YaHei, Arial";
    ctx.fillText("存活越久分数越高 · 冲刺有冷却 · 裂隙减速期间得分加成", 16, H - 16);
  };

  const tick = (ts) => {
    const dt = clamp((ts - state.lastTs) / 1000, 0, 1 / 20);
    state.lastTs = ts;

    if (state.running) update(dt);
    else {
      // 非运行状态也允许按R重开
      if (keys.has("r")) reset();
    }

    draw();
    renderHud();
    requestAnimationFrame(tick);
  };

  // 初始显示最高分
  renderHud();
  requestAnimationFrame((ts) => {
    state.lastTs = ts;
    requestAnimationFrame(tick);
  });
})();

