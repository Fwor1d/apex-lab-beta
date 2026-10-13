import { createGeometry, fitGeometry, clamp } from "./geometry.js";
import { linePoint, vehiclePose, apexProgress } from "./model.js";

import { readPalette } from "./visual-tokens.js";
const palette = readPalette();
const COLORS = {
  green: palette.lime,
  yellow: palette.yellow,
  red: palette.red,
};
const strokePoints = (ctx, points, width, color, dash = []) => {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
};
function roundedRect(ctx, x, y, w, h, r) {
  // Explicit path keeps this renderer independent of Canvas roundRect support.
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
export class TrackRenderer {
  constructor(canvas, onResize) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.background = document.createElement("canvas");
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.key = "";
    this.observer = new ResizeObserver(() => {
      this.resize();
      onResize();
    });
    this.observer.observe(canvas);
    this.resize();
  }
  resize() {
    const bounds = this.canvas.getBoundingClientRect(),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!bounds.width || !bounds.height) return;
    if (
      this.width === bounds.width &&
      this.height === bounds.height &&
      this.dpr === dpr
    )
      return;
    this.width = bounds.width;
    this.height = bounds.height;
    this.dpr = dpr;
    for (const canvas of [this.canvas, this.background]) {
      canvas.width = Math.round(this.width * dpr);
      canvas.height = Math.round(this.height * dpr);
    }
    this.key = "";
  }
  prepare(corner, settings, level) {
    const key = JSON.stringify([
      corner.id,
      settings,
      level,
      this.width,
      this.height,
      this.dpr,
      this.layers,
    ]);
    if (this.key === key) return;
    this.key = key;
    this.geometry = createGeometry(corner.path);
    this.line = Array.from({ length: 221 }, (_, i) =>
      linePoint(i / 220, this.geometry, corner, settings),
    );
    this.reference = Array.from({ length: 221 }, (_, i) =>
      linePoint(i / 220, this.geometry, corner, corner.defaults),
    );
    // Fit the road AND both planned paths; uniform scale, no coordinate changes.
    // 8 world metres contain the schematic corridor, 18 CSS px protect markers.
    // HUD/caption reserve 34 / 30 CSS px above/below the drawing area.
    this.fit = fitGeometry(
      [...this.geometry.samples, ...this.line, ...this.reference],
      this.width,
      this.height - 64,
      8,
      18,
    );
    this.fit.y += 34;
    this.color = COLORS[level];
    this.drawBackground(corner, settings);
  }
  screen(point) {
    return {
      x: point.x * this.fit.scale + this.fit.x,
      y: point.y * this.fit.scale + this.fit.y,
    };
  }
  drawBackground(corner, settings) {
    const ctx = this.background.getContext("2d"),
      w = this.width,
      h = this.height,
      g = this.geometry,
      fit = this.fit;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#151b16";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2c3529";
    for (let x = 18; x < w; x += 22)
      for (let y = 18; y < h; y += 22) {
        ctx.beginPath();
        ctx.arc(x, y, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.save();
    ctx.translate(fit.x, fit.y);
    ctx.scale(fit.scale, fit.scale);
    // Uniform corridor is a visual approximation, explicitly not track boundaries.
    strokePoints(ctx, g.samples, 16, "#657060");
    strokePoints(ctx, g.samples, 14, "#353e36");
    if (this.layers.reference !== false)
      strokePoints(ctx, this.reference, 1.8, "#b7c4af", [3, 4]);
    if (this.layers.active !== false) {
      if (
        settings.line !== corner.defaults.line ||
        settings.apexPosition !== corner.defaults.apexPosition
      ) {
        strokePoints(ctx, this.line, 5, this.color + "20");
        strokePoints(ctx, this.line, 1.8, this.color);
      } else strokePoints(ctx, this.line, 1.6, this.color);
      const end = g.point(0.96),
        before = g.point(0.93),
        a = Math.atan2(end.y - before.y, end.x - before.x);
      ctx.save();
      ctx.translate(end.x, end.y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-6, -4);
      ctx.lineTo(0, 0);
      ctx.lineTo(-6, 4);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    if (this.layers.brakeMarker !== false)
      this.marker(
        ctx,
        settings.brakeStart / 100,
        corner,
        settings,
        "#ff807c",
        "Т",
        -1,
      );
    if (this.layers.apexMarker !== false)
      this.marker(
        ctx,
        apexProgress(settings),
        corner,
        settings,
        "#f1f4e8",
        "А",
        -1,
      );
    if (this.layers.throttleMarker !== false)
      this.marker(
        ctx,
        settings.gasStart / 100,
        corner,
        settings,
        "#66dfa6",
        "Г",
        1,
      );
  }
  marker(ctx, progress, corner, settings, color, label, direction) {
    const point = this.screen(
      linePoint(progress, this.geometry, corner, settings),
    );
    const labelX = clamp(point.x + direction * 24, 16, this.width - 16);
    const labelY = clamp(point.y - 18, 56, this.height - 36);
    strokePoints(ctx, [point, { x: labelX, y: labelY }], 1, color);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(labelX, labelY, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#151c16";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = "600 11px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(label, labelX, labelY + 4);
  }

  render(state, signals, evaluation) {
    if (!this.ctx || !this.width) return;
    const settings = state.settings,
      corner = state.corner;
    this.layers = state.sceneLayers ?? {};
    this.prepare(corner, settings, evaluation.level);
    const pose = this.pose(state);
    this.canvas.dataset.worldX = pose.x;
    this.canvas.dataset.worldY = pose.y;
    this.canvas.dataset.heading = pose.heading;
    this.canvas.dataset.distance = state.progress * this.geometry.length;
    this.canvas.dataset.scale = this.fit.scale;
    this.canvas.dataset.centerX = this.fit.x;
    this.canvas.dataset.centerY = this.fit.y;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (state.view === "top") {
      ctx.drawImage(this.background, 0, 0, this.width, this.height);
      const pose = this.pose(state);
      const point = this.screen(pose);
      if (this.layers.vehicle !== false)
        this.drawCar(ctx, point.x, point.y, pose.heading, 0.48);
    } else this.drawPerspective(state, signals);
  }
  pose(state) {
    return vehiclePose(
      state.progress,
      this.geometry,
      state.corner,
      state.settings,
    );
  }
  drawCar(ctx, x, y, angle, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.scale(size, size);
    ctx.fillStyle = "#070d09a6";
    ctx.beginPath();
    ctx.ellipse(2, 5, 15, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0e1510";
    for (const tx of [-15, 10])
      for (const ty of [-12, 10]) ctx.fillRect(tx, ty, 5, 10);
    roundedRect(ctx, -12, -23, 24, 46, 8);
    ctx.fillStyle = "#ddf5b6";
    ctx.fill();
    ctx.strokeStyle = "#6c874f";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = "#9bb74e";
    ctx.fillRect(-2.5, -22, 5, 44);
    roundedRect(ctx, -9, -9, 18, 19, 4);
    ctx.fillStyle = "#172e29";
    ctx.fill();
    ctx.fillStyle = "#e7f4ea";
    ctx.fillRect(-10, -18, 5, 2);
    ctx.fillRect(5, -18, 5, 2);
    ctx.fillStyle = "#f67b69";
    ctx.fillRect(-10, 20, 6, 2);
    ctx.fillRect(4, 20, 6, 2);
    ctx.fillStyle = "#101912";
    ctx.fillRect(-16, 15, 32, 3);
    ctx.fillStyle = "#c9fc60";
    ctx.fillRect(-15, 15, 30, 1);
    ctx.fillStyle = "#e8efdd";
    ctx.font = "600 6px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("92", 0, 4);
    ctx.restore();
  }
  drawPerspective(state, signals) {
    const ctx = this.ctx,
      w = this.width,
      h = this.height,
      corner = state.corner,
      settings = state.settings,
      g = this.geometry;
    const origin = this.pose(state);
    const cs = Math.cos(origin.heading),
      sn = Math.sin(origin.heading),
      horizon = h * 0.32;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#273b38");
    sky.addColorStop(1, "#5f7262");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);
    ctx.fillStyle = "#232e21";
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.fillStyle = "#415039";
    ctx.fillRect(0, horizon - 6, w, 6);
    const strips = [],
      distance = state.view === "chase" ? 48 : 22;
    const project = (p) => {
      const dx = p.x - origin.x,
        dy = p.y - origin.y,
        z = dx * cs + dy * sn + distance;
      return z > 8
        ? {
            x: w / 2 + ((-dx * sn + dy * cs) * w * 0.85) / z,
            y: horizon + (h * 24) / z,
          }
        : null;
    };
    for (let i = 0; i <= 100; i++) {
      const p = clamp(state.progress + i * 0.004, 0, 1),
        center = g.point(p),
        a = g.heading(p),
        nx = -Math.sin(a),
        ny = Math.cos(a);
      const left = project({ x: center.x - nx * 7, y: center.y - ny * 7 }),
        right = project({ x: center.x + nx * 7, y: center.y + ny * 7 }),
        line = project(linePoint(p, g, corner, settings));
      if (left && right && line) strips.push({ left, right, line });
      if (p === 1) break;
    }
    for (let i = strips.length - 2; i >= 0; i--) {
      const a = strips[i],
        b = strips[i + 1];
      ctx.beginPath();
      ctx.moveTo(a.left.x, a.left.y);
      ctx.lineTo(b.left.x, b.left.y);
      ctx.lineTo(b.right.x, b.right.y);
      ctx.lineTo(a.right.x, a.right.y);
      ctx.closePath();
      ctx.fillStyle = i % 5 === 0 ? "#424a42" : "#3b443d";
      ctx.fill();
      strokePoints(ctx, [a.left, b.left], 3, i % 6 < 3 ? "#d4d9c8" : "#b66356");
      strokePoints(ctx, [a.right, b.right], 3, "#d4d9c8");
      if (this.layers.active !== false)
        strokePoints(ctx, [a.line, b.line], 2, this.color);
    }
    if (this.layers.vehicle === false) return;
    if (state.view === "chase") {
      ctx.save();
      ctx.translate(w / 2, h * 0.8);
      const size = Math.min(w / 300, 1.65);
      ctx.scale(size, size);
      ctx.fillStyle = "#0b110dd9";
      ctx.beginPath();
      ctx.ellipse(0, 29, 58, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      roundedRect(ctx, -50, -18, 100, 47, 10);
      ctx.fillStyle = "#cbe699";
      ctx.fill();
      roundedRect(ctx, -32, -35, 64, 34, 12);
      ctx.fillStyle = "#a4c66a";
      ctx.fill();
      roundedRect(ctx, -26, -28, 52, 23, 5);
      ctx.fillStyle = "#1f3930";
      ctx.fill();
      ctx.fillStyle = "#101b13";
      ctx.fillRect(-57, -9, 114, 5);
      ctx.fillRect(-45, 17, 90, 9);
      ctx.fillStyle = "#ff7266";
      ctx.fillRect(-41, 10, 27, 4);
      ctx.fillRect(14, 10, 27, 4);
      ctx.restore();
    } else {
      ctx.fillStyle = "#101710";
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.86);
      ctx.quadraticCurveTo(w / 2, h * 0.68, w, h * 0.86);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(w / 2, h * 0.95);
      ctx.rotate((signals.steering / 100) * 0.65);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w * 0.17, 75), 0, Math.PI * 2);
      ctx.strokeStyle = "#0a0e0b";
      ctx.lineWidth = 17;
      ctx.stroke();
      ctx.strokeStyle = "#75846b";
      ctx.lineWidth = 2;
      ctx.stroke();
      strokePoints(
        ctx,
        [
          { x: -40, y: 0 },
          { x: 40, y: 0 },
        ],
        8,
        "#263324",
      );
      ctx.restore();
    }
  }
}
