// Startup intro animation: creeper walks in, detonates, and the M mark emerges.
// The SVG it drives lives inline in index.html (#scene) so it paints before React mounts.
// Generated with OpenDesign (design source of truth: intro/intro.html).
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const scene = document.getElementById("scene");
  if (!scene) return;

  const world = document.getElementById("world");
  const creeper = document.getElementById("creeper");
  const shadow = document.getElementById("creeperShadow");
  const dust = document.getElementById("dust");
  const debris = document.getElementById("debris");
  const smoke = document.getElementById("smoke");
  const flash = document.getElementById("flash");
  const logoGroup = document.getElementById("logoGroup");
  const logoMark = document.getElementById("logoMark");

  // Authored seconds -> real seconds. Leave time to walk, pause and prime.
  const BEATS = [
    [0.00, 0.00], // creeper starts walking in
    [1.20, 1.20], // reaches the centre
    [1.20, 1.40], // brief pause before priming
    [2.00, 2.40], // one second of swelling before detonation
    [2.50, 2.90], // logo emerges through the settling blast
    [3.15, 3.25], // logo and debris have settled; no extra hold
  ];
  const HOLD_AT = BEATS[BEATS.length - 1][1];  // real seconds
  const SETTLED_AT = BEATS[BEATS.length - 1][0]; // authored seconds
  const content = document.querySelector(".startup-content");
  let completeIntro;
  window.mlaIntroReady = new Promise(function (resolve) { completeIntro = resolve; });

  function authoredAt(real) {
    if (real <= BEATS[0][1]) return BEATS[0][0];
    for (let i = 1; i < BEATS.length; i++) {
      const prev = BEATS[i - 1];
      const next = BEATS[i];
      if (real <= next[1]) {
        return prev[0] + (next[0] - prev[0]) * ((real - prev[1]) / (next[1] - prev[1]));
      }
    }
    return SETTLED_AT;
  }

  function mk(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    if (attrs) {
      for (const key in attrs) node.setAttribute(key, attrs[key]);
    }
    (parent || scene).appendChild(node);
    return node;
  }

  function addRect(parent, x, y, w, h, fill, opacity) {
    const attrs = { x: x, y: y, width: w, height: h, fill: fill };
    if (opacity !== undefined) attrs.opacity = opacity;
    return mk("rect", attrs, parent);
  }

  function clamp(v, a, b) {
    const lo = a === undefined ? 0 : a;
    const hi = b === undefined ? 1 : b;
    return v < lo ? lo : v > hi ? hi : v;
  }

  function easeInOutCubic(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  function easeOutCubic(p) {
    return 1 - Math.pow(1 - p, 3);
  }

  function backOut(p) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const legBL = mk("g", {}, creeper);
  const legBR = mk("g", {}, creeper);
  const legL = mk("g", {}, creeper);
  const legR = mk("g", {}, creeper);

  addRect(legBL, -56, -62, 44, 62, "#237B4B");
  addRect(legBL, -16, -62, 10, 62, "#1B5E3A", 0.4);
  addRect(legBL, -52, -58, 8, 8, "#8FBF6A", 0.14);

  addRect(legBR, 12, -62, 44, 62, "#237B4B");
  addRect(legBR, 48, -62, 8, 62, "#1B5E3A", 0.25);
  addRect(legBR, 16, -56, 8, 8, "#8FBF6A", 0.1);

  addRect(legL, -44, -66, 44, 66, "#3E8E5A");
  addRect(legL, -12, -66, 12, 66, "#1B5E3A", 0.32);
  addRect(legL, -38, -58, 10, 10, "#8FBF6A", 0.22);
  addRect(legL, -26, -24, 8, 8, "#1B5E3A", 0.25);

  addRect(legR, 0, -66, 44, 66, "#3E8E5A");
  addRect(legR, 32, -66, 12, 66, "#1B5E3A", 0.32);
  addRect(legR, 8, -54, 9, 9, "#8FBF6A", 0.18);
  addRect(legR, 20, -30, 9, 9, "#1B5E3A", 0.2);

  addRect(creeper, -22, -198, 44, 132, "#3E8E5A");
  addRect(creeper, 11, -198, 11, 132, "#1B5E3A", 0.3);
  addRect(creeper, -22, -198, 11, 132, "#8FBF6A", 0.1);
  addRect(creeper, -11, -165, 11, 11, "#1B5E3A", 0.25);
  addRect(creeper, 0, -132, 11, 11, "#1B5E3A", 0.18);
  addRect(creeper, -22, -110, 11, 11, "#8FBF6A", 0.1);
  addRect(creeper, 11, -88, 11, 11, "#1B5E3A", 0.15);

  addRect(creeper, -44, -286, 88, 88, "#3E8E5A");
  addRect(creeper, -44, -286, 11, 11, "#1B5E3A", 0.2);
  addRect(creeper, 11, -275, 11, 11, "#8FBF6A", 0.16);
  addRect(creeper, -33, -275, 11, 11, "#1B5E3A", 0.12);
  addRect(creeper, 22, -286, 11, 11, "#8FBF6A", 0.1);
  addRect(creeper, 22, -209, 11, 11, "#1B5E3A", 0.16);
  addRect(creeper, -44, -242, 11, 11, "#8FBF6A", 0.08);

  const faceRows = [
    "00000000",
    "00000000",
    "01100110",
    "01100110",
    "00011000",
    "00111100",
    "00111100",
    "00100100"
  ];
  faceRows.forEach(function (row, r) {
    for (let c = 0; c < 8; c++) {
      if (row[c] === "1") {
        addRect(creeper, -44 + c * 11, -286 + r * 11, 11, 11, "#0B1710");
      }
    }
  });

  const creeperFlash = mk("g", { opacity: "0" }, creeper);
  addRect(creeperFlash, -44, -286, 88, 88, "#E7F3FF");
  addRect(creeperFlash, -22, -198, 44, 132, "#E7F3FF");
  addRect(creeperFlash, -56, -62, 44, 62, "#E7F3FF");
  addRect(creeperFlash, 12, -62, 44, 62, "#E7F3FF");
  addRect(creeperFlash, -44, -66, 44, 66, "#E7F3FF");
  addRect(creeperFlash, 0, -66, 44, 66, "#E7F3FF");

  const dustEls = [];
  for (let i = 0; i < 5; i++) {
    const d = addRect(dust, 0, 0, 6 + i * 2, 6 + i * 2, "#7A5230");
    d.setAttribute("opacity", "0");
    dustEls.push(d);
  }

  const rand = mulberry32(20260217);
  const cubes = [];
  for (let i = 0; i < 58; i++) {
    const type = i < 18 ? "grass" : i < 44 ? "dirt" : "stone";
    const s = 14 + Math.floor(rand() * 9) * 3;
    const edge = Math.max(3, Math.round(s * 0.18));
    const g = mk("g", { opacity: "0" }, debris);
    if (type === "grass") {
      addRect(g, -s / 2, -s / 2, s, s, "#7A5230");
      addRect(g, -s / 2, -s / 2, s, s * 0.4, "#7CB342");
      addRect(g, -s / 2, -s / 2, s, 2, "#8FBF6A", 0.5);
      addRect(g, s / 2 - edge, -s / 2, edge, s, "#0B1710", 0.2);
    } else if (type === "dirt") {
      addRect(g, -s / 2, -s / 2, s, s, "#7A5230");
      addRect(g, -s / 2 + s * 0.15, -s / 2 + s * 0.2, s * 0.3, s * 0.22, "#0B1710", 0.18);
      addRect(g, -s / 2 + s * 0.55, -s / 2 + s * 0.6, s * 0.25, s * 0.18, "#9E9E9E", 0.2);
      addRect(g, s / 2 - edge, -s / 2, edge, s, "#0B1710", 0.22);
    } else {
      addRect(g, -s / 2, -s / 2, s, s, "#9E9E9E");
      addRect(g, -s / 2, -s / 2, s, s * 0.28, "#B5B5B5", 0.35);
      addRect(g, -s / 2 + s * 0.25, -s / 2 + s * 0.35, s * 0.28, s * 0.28, "#0B1710", 0.18);
      addRect(g, s / 2 - edge, -s / 2, edge, s, "#0B1710", 0.18);
    }
    const ang = -Math.PI * (0.05 + rand() * 0.9);
    const spd = 400 + rand() * 650;
    cubes.push({
      g: g,
      s: s,
      ox: (rand() - 0.5) * 110,
      oy: (rand() - 0.5) * 140,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      delay: rand() * 0.06
    });
  }

  const smokeParts = [];
  for (let i = 0; i < 34; i++) {
    const g = mk("g", { opacity: "0" }, smoke);
    const ring = i < 24;
    const s = ring ? 30 + rand() * 32 : 22 + rand() * 26;
    addRect(g, -s / 2, -s / 2, s, s, "#9E9E9E");
    addRect(g, -s / 2, -s / 2, s, s * 0.3, "#B5B5B5", 0.35);
    const a = ring ? (i / 24) * Math.PI * 2 + (rand() - 0.5) * 0.22 : rand() * Math.PI * 2;
    const r0 = ring ? 36 + rand() * 28 : 6 + rand() * 38;
    const r1 = ring ? 280 + rand() * 150 : 90 + rand() * 150;
    const rise = ring ? 20 + rand() * 50 : 70 + rand() * 120;
    smokeParts.push({
      g: g,
      a: a,
      r0: r0,
      r1: r1,
      rise: rise,
      delay: rand() * 0.05,
      op: ring ? 0.18 + rand() * 0.12 : 0.16 + rand() * 0.1
    });
  }

  function updateExplosion(t) {
    const dt = t - 2;
    debris.style.display = "";
    smoke.style.display = "";

    let fo = 0;
    if (dt < 0.14) {
      fo = 0.96 * (1 - dt / 0.14);
    } else if (dt < 0.3) {
      fo = 0.26 * (1 - (dt - 0.14) / 0.16);
    }
    flash.setAttribute("opacity", fo.toFixed(3));

    for (let i = 0; i < cubes.length; i++) {
      const c = cubes[i];
      const d = dt - c.delay;
      if (d < 0) {
        c.g.setAttribute("opacity", "0");
        continue;
      }
      let x = 800 + c.ox + c.vx * d;
      let y = 545 + c.oy + c.vy * d + 0.5 * 1500 * d * d;
      const floor = 690 - c.s * 0.5;
      if (y > floor) y = floor;
      c.g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")");
      let op = d < 0.5 ? 1 : 1 - (d - 0.5) / 0.5;
      c.g.setAttribute("opacity", clamp(op).toFixed(3));
    }

    for (let i = 0; i < smokeParts.length; i++) {
      const p = smokeParts[i];
      const d = dt - p.delay;
      if (d < 0) {
        p.g.setAttribute("opacity", "0");
        continue;
      }
      const q = clamp(d / 0.85);
      const e = easeOutCubic(q);
      const rad = p.r0 + (p.r1 - p.r0) * e;
      const x = 800 + Math.cos(p.a) * rad;
      const y = 545 + Math.sin(p.a) * rad * 0.55 - p.rise * e;
      const scl = 0.75 + 0.9 * e;
      p.g.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ") scale(" + scl.toFixed(3) + ")");
      p.g.setAttribute("opacity", (p.op * Math.pow(1 - q, 1.3)).toFixed(3));
    }

    const amp = 18 * Math.pow(Math.max(0, 1 - dt / 0.5), 2);
    const sx = Math.sin(dt * 92) * amp;
    const sy = Math.cos(dt * 73) * amp;
    world.setAttribute("transform", "translate(" + sx.toFixed(2) + " " + sy.toFixed(2) + ")");
  }

  function render(t) {
    const walking = t < 1.2;
    const pre = t >= 1.2 && t < 2.0;
    const showCreeper = t < 2.0;

    creeper.style.display = showCreeper ? "" : "none";
    shadow.style.display = showCreeper ? "" : "none";

    let cx = 800;
    let bounce = 0;
    let scale = 1;

    if (walking) {
      const p = clamp(t / 1.2);
      const e = 0.5 * easeInOutCubic(p) + 0.5 * easeOutCubic(p);
      cx = -180 + 980 * e;
      bounce = -Math.abs(Math.sin(p * Math.PI * 6)) * 12;
      const sw = Math.sin(p * Math.PI * 6);
      legL.setAttribute("transform", "translate(0 " + (-Math.max(0, sw) * 11).toFixed(2) + ")");
      legR.setAttribute("transform", "translate(0 " + (-Math.max(0, -sw) * 11).toFixed(2) + ")");
      legBL.setAttribute("transform", "translate(0 " + (-Math.max(0, -sw) * 8).toFixed(2) + ")");
      legBR.setAttribute("transform", "translate(0 " + (-Math.max(0, sw) * 8).toFixed(2) + ")");
      creeperFlash.setAttribute("opacity", "0");
    } else if (pre) {
      const p = clamp((t - 1.2) / 0.8);
      const pulse = Math.pow(Math.sin(p * Math.PI * 2), 2);
      cx = 800 + Math.sin((t - 1.2) * 47) * 1.2;
      scale = 1 + 0.17 * Math.pow(p, 1.3) + 0.035 * pulse;
      legL.setAttribute("transform", "translate(0 0)");
      legR.setAttribute("transform", "translate(0 0)");
      legBL.setAttribute("transform", "translate(0 0)");
      legBR.setAttribute("transform", "translate(0 0)");
      creeperFlash.setAttribute("opacity", (pulse * 0.55).toFixed(3));
    }

    if (showCreeper) {
      const baseScale = 1.12;
      creeper.setAttribute(
        "transform",
        "translate(" + cx.toFixed(2) + " " + (696 + bounce).toFixed(2) + ") scale(" + (baseScale * scale).toFixed(4) + ")"
      );
      shadow.setAttribute("cx", cx.toFixed(2));
      shadow.setAttribute("rx", (64 * baseScale * scale).toFixed(2));
      shadow.setAttribute("opacity", (0.46 * scale).toFixed(2));
    }

    for (let i = 0; i < dustEls.length; i++) {
      if (walking) {
        const p = clamp(t / 1.2);
        const ph = Math.abs(Math.sin(p * Math.PI * 6 + i * 0.7));
        const dx = cx - 58 - i * 20;
        const dy = 682 - i * 3;
        dustEls[i].setAttribute("x", dx.toFixed(1));
        dustEls[i].setAttribute("y", dy.toFixed(1));
        dustEls[i].setAttribute("opacity", (0.2 * ph * (1 - i * 0.12)).toFixed(3));
      } else {
        dustEls[i].setAttribute("opacity", "0");
      }
    }

    const dt = t - 2;
    if (dt >= 0 && dt < 1.15) {
      updateExplosion(t);
    } else {
      debris.style.display = "none";
      smoke.style.display = "none";
      flash.setAttribute("opacity", "0");
      world.setAttribute("transform", "translate(0 0)");
    }

    const appear = clamp((t - 2.5) / 0.2);
    if (content) content.style.opacity = appear.toFixed(3);
    const lp = clamp((t - 2.5) / 0.55);
    const endFade = clamp((4 - t) / 0.14);
    const sLogo = 0.5 + 0.5 * backOut(lp);
    logoGroup.setAttribute("opacity", (appear * endFade).toFixed(3));
    logoMark.setAttribute(
      "transform",
      "translate(800 440) scale(" + (1.35 * sLogo).toFixed(4) + ") translate(-100 -80)"
    );
  }

  function renderStatic() {
    creeper.style.display = "none";
    shadow.style.display = "none";
    debris.style.display = "none";
    smoke.style.display = "none";
    flash.setAttribute("opacity", "0");
    world.setAttribute("transform", "translate(0 0)");
    for (let i = 0; i < dustEls.length; i++) dustEls[i].setAttribute("opacity", "0");
    logoGroup.setAttribute("opacity", "1");
    if (content) content.style.opacity = "1";
    logoMark.setAttribute("transform", "translate(800 440) scale(1.35) translate(-100 -80)");
  }

  let rafId = 0;
  let startTime = 0;

  function loop(now) {
    const real = (now - startTime) / 1000;
    if (real >= HOLD_AT) {
      // Freeze on the settled frame: the loading label and bar take over from here.
      rafId = 0;
      render(SETTLED_AT);
      completeIntro();
      return;
    }
    render(authoredAt(real));
    rafId = requestAnimationFrame(loop);
  }

  function stopMotion() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function startMotion() {
    stopMotion();
    render(0);
    startTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const debugTime = (function () {
    const value = new URLSearchParams(location.search).get("t");
    if (value === null) return null;
    const n = parseFloat(value);
    return isFinite(n) ? clamp(n, 0, 3.999) : null;
  })();

  function applyMotion() {
    if (reduceMQ.matches) {
      stopMotion();
      renderStatic();
      completeIntro();
    } else if (debugTime !== null) {
      stopMotion();
      render(debugTime);
      completeIntro();
    } else {
      startMotion();
    }
  }

  if (reduceMQ.addEventListener) {
    reduceMQ.addEventListener("change", applyMotion);
  } else if (reduceMQ.addListener) {
    reduceMQ.addListener(applyMotion);
  }

  // The native window is visible from launch. Never gate the intro on a page-load
  // event: dev module loading can delay it or dispatch it before this script runs.
  applyMotion();
})();
