import { fitGeometry } from "./geometry.js";

// Presentation only: coordinates remain unchanged; flat3d compresses screen Y.
export function mapTransform(points, width, height, mode = "full2d") {
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    points.length > 10000 ||
    !points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ||
    !(width > 0 && height > 0) ||
    !["full2d", "full3d"].includes(mode)
  )
    throw Error("Нет пригодной геометрии для полного вида.");
  const tilt = mode === "full3d" ? 0.58 : 1;
  const projected = points.map((p) => ({ x: p.x, y: p.y * tilt }));
  const fit = fitGeometry(projected, width, height, 0, 28);
  if (!Number.isFinite(fit.scale) || fit.scale <= 0)
    throw Error("Геометрия не имеет пригодного масштаба.");
  return (p) => ({
    x: p.x * fit.scale + fit.x,
    y: p.y * tilt * fit.scale + fit.y,
  });
}
export function projectedHeading(pose, project) {
  const p = project(pose),
    next = project({
      x: pose.x + Math.cos(pose.heading),
      y: pose.y + Math.sin(pose.heading),
    });
  return Math.atan2(next.y - p.y, next.x - p.x);
}
export function overlayColor(kind, value) {
  if (!Number.isFinite(value)) return null;
  const fraction = Math.max(
    0,
    Math.min(1, value / (kind === "speed" ? 250 : 100)),
  );
  const hue = { speed: 210, brake: 2, throttle: 146 }[kind];
  return hue === undefined ? null : `hsl(${hue} 78% ${78 - 25 * fraction}%)`;
}
function stroke(ctx, points, project, color, width = 3, dash = []) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const q = project(p);
    i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}
export class FullTrackView {
  constructor(canvas, onResize = () => {}, onSeek = null, interactive = false) {
    this.canvas = canvas;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.interactive = interactive;
    this.onResize = onResize;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx)
      throw Error(
        "Canvas недоступен. Исходный вид и графики остаются доступны.",
      );
    this.background = document.createElement("canvas");
    this.key = null;
    this.observer = new ResizeObserver(() => {
      this.key = null;
      onResize();
    });
    this.observer.observe(canvas);
    this.onClick = (event) => {
      if (!onSeek || !this.data?.seekPoints) return;
      const rect = canvas.getBoundingClientRect(),
        point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      let nearest = null,
        best = Infinity;
      for (const p of this.data.seekPoints) {
        const screen = this.project(p),
          d = Math.hypot(screen.x - point.x, screen.y - point.y);
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      // Hit-testing is restricted to the visible educational window, never fabricated whole-lap playback.
      if (best < 28 && nearest) onSeek(nearest.progress);
    };
    canvas.addEventListener("click", this.onClick);
    if (interactive) {
      canvas.dataset.navigation = "pan";
      canvas.tabIndex = 0;
      this.onDown = (event) => {
        if (event.button !== 0 || this.drag) return;
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      };
      this.onMove = (event) => {
        if (this.drag?.id !== event.pointerId) return;
        this.move(event.clientX - this.drag.x, event.clientY - this.drag.y);
        this.drag.x = event.clientX;
        this.drag.y = event.clientY;
      };
      this.onEnd = () => {
        this.drag = null;
      };
      this.onWheel = (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        this.setZoom(this.zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2));
      };
      this.onKey = (event) => {
        const moves = {
          ArrowLeft: [-30, 0],
          ArrowRight: [30, 0],
          ArrowUp: [0, -30],
          ArrowDown: [0, 30],
        };
        if (moves[event.key]) {
          event.preventDefault();
          this.move(...moves[event.key]);
        } else if (["+", "=", "-", "0"].includes(event.key)) {
          event.preventDefault();
          event.key === "0"
            ? this.fit()
            : this.setZoom(this.zoom * (event.key === "-" ? 1 / 1.2 : 1.2));
        }
      };
      this.onFit = () => this.fit();
      canvas.addEventListener("pointerdown", this.onDown);
      canvas.addEventListener("pointermove", this.onMove);
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
        canvas.addEventListener(name, this.onEnd);
      canvas.addEventListener("wheel", this.onWheel, { passive: false });
      canvas.addEventListener("keydown", this.onKey);
      canvas.addEventListener("dblclick", this.onFit);
      window.addEventListener("blur", this.onEnd);
    }
  }
  invalidate() {
    this.key = null;
    this.onResize();
  }
  setZoom(value) {
    if (!Number.isFinite(value)) return;
    this.zoom = Math.max(1, Math.min(8, value));
    this.invalidate();
  }
  move(x, y) {
    const r = this.canvas.getBoundingClientRect();
    this.pan.x = Math.max(-4 * r.width, Math.min(4 * r.width, this.pan.x + x));
    this.pan.y = Math.max(
      -4 * r.height,
      Math.min(4 * r.height, this.pan.y + y),
    );
    this.invalidate();
  }
  fit() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.drag = null;
    this.invalidate();
  }
  render(data, mode, markers = []) {
    this.data = data;
    const rect = this.canvas.getBoundingClientRect(),
      w = rect.width,
      h = rect.height;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2),
      key = `${data.revision}:${mode}:${w}:${h}:${dpr}:${this.zoom}:${this.pan.x}:${this.pan.y}`;
    if (this.key !== key) {
      const fit = mapTransform(data.points, w, h, mode);
      this.project = (p) => {
        const q = fit(p);
        return {
          x: (q.x - w / 2) * this.zoom + w / 2 + this.pan.x,
          y: (q.y - h / 2) * this.zoom + h / 2 + this.pan.y,
        };
      };
      for (const canvas of [this.canvas, this.background]) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = this.background.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#101311";
      ctx.fillRect(0, 0, w, h);
      // Stroke width is a screen symbol; it is not a measured road corridor.
      stroke(ctx, data.points, this.project, "#79867d", 4);
      if (data.reference)
        stroke(ctx, data.reference, this.project, "#a3afa5", 2, [4, 4]);
      if (data.active)
        stroke(
          ctx,
          data.active,
          this.project,
          data.activeColor ?? "#c9fc60",
          3,
        );
      for (const segment of data.segments ?? []) {
        const color = overlayColor(data.overlay, segment.value);
        if (color) stroke(ctx, segment.points, this.project, color, 5);
      }
      for (const mark of data.marks ?? []) {
        const p = this.project(mark);
        ctx.fillStyle = mark.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      this.key = key;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.background, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const marker of markers) {
      const p = this.project(marker);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(projectedHeading(marker, this.project));
      ctx.fillStyle = marker.color ?? "#c9fc60";
      ctx.strokeStyle = "#101311";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-7, -6);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  dispose() {
    this.observer.disconnect();
    if (this.interactive) {
      this.canvas.removeEventListener("pointerdown", this.onDown);
      this.canvas.removeEventListener("pointermove", this.onMove);
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
        this.canvas.removeEventListener(name, this.onEnd);
      this.canvas.removeEventListener("wheel", this.onWheel);
      this.canvas.removeEventListener("keydown", this.onKey);
      this.canvas.removeEventListener("dblclick", this.onFit);
      window.removeEventListener("blur", this.onEnd);
      this.drag = null;
    }
    this.canvas.removeEventListener("click", this.onClick);
    this.background.width = 0;
    this.background.height = 0;
    this.data = null;
  }
}
