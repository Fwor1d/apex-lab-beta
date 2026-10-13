const signals = [
  ["speedMps", "Скорость", "км/ч", "--speed", 3.6],
  ["brake", "Тормоз", "%", "--brake", 100],
  ["throttle", "Газ", "%", "--throttle", 100],
  ["steeringNormalized", "Положение руля", "%", "--steering", 100],
  ["deltaS", "Дельта B − A", "с", "--delta", 1],
];
const valid = Number.isFinite;
export class Traces {
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
    this.data = null;
    this.cursor = 0;
    this.zoom = false;
    this.layers = [];
    this.resize = new ResizeObserver(() => {
      if (this.data) {
        this.draw();
        this.drawCursor();
      }
    });
    this.resize.observe(container);
  }
  prepare(data) {
    this.data = data;
    this.region = null;
    this.container.replaceChildren();
    this.layers = [];
    for (const [key, title, unit, color, factor] of signals) {
      const section = document.createElement("section");
      section.className = "chart";
      const heading = document.createElement("h3");
      heading.textContent = `${title}, ${unit}`;
      const plot = document.createElement("div");
      plot.className = "plot";
      const base = document.createElement("canvas"),
        cursor = document.createElement("canvas");
      cursor.className = "cursor-layer";
      cursor.setAttribute("aria-hidden", "true");
      base.setAttribute(
        "aria-label",
        `${title}: A сплошная линия, B штриховая. Показания доступны в таблице.`,
      );
      base.setAttribute("role", "img");
      plot.append(base, cursor);
      const legend = document.createElement("p");
      legend.className = "muted chart-legend";
      legend.textContent =
        key === "deltaS"
          ? "B − A · одинаковая дистанция, метры"
          : "A — сплошная · B — штриховая · дистанция, метры";
      section.append(heading, legend, plot);
      this.container.append(section);
      base.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const rect = base.getBoundingClientRect(),
          fraction = Math.max(
            0,
            Math.min(1, (event.clientX - rect.left - 52) / (rect.width - 66)),
          );
        this.onSelect(
          this.domain[0] + fraction * (this.domain[1] - this.domain[0]),
        );
      });
      this.layers.push({ key, color, factor, base, cursor });
    }
    this.draw();
    this.drawCursor();
  }
  setRegion(range) {
    this.region =
      Array.isArray(range) &&
      range.length === 2 &&
      range.every(Number.isFinite) &&
      range[1] >= range[0]
        ? range
        : null;
    this.drawCursor();
  }
  setCursor(value, zoom) {
    const changed = zoom !== this.zoom;
    this.cursor = value;
    this.zoom = zoom;
    if (changed || zoom) this.draw();
    this.drawCursor();
  }
  context(canvas) {
    const rect = canvas.getBoundingClientRect(),
      ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    return { ctx, w: rect.width, h: rect.height };
  }
  draw() {
    if (!this.data) return;
    const d = this.data.distanceM;
    this.domain = this.zoom
      ? [
          Math.max(d[0], this.cursor - 200),
          Math.min(d.at(-1), this.cursor + 200),
        ]
      : [d[0], d.at(-1)];
    const css = getComputedStyle(document.documentElement);
    for (const layer of this.layers) {
      const { ctx, w, h } = this.context(layer.base),
        left = 52,
        right = w - 14,
        top = 12,
        bottom = h - 26;
      const arrays =
        layer.key === "deltaS"
          ? [this.data.deltaS]
          : [this.data.a[layer.key], this.data.b[layer.key]];
      let lo = Infinity,
        hi = -Infinity;
      for (const values of arrays)
        for (let i = 0; i < d.length; i++)
          if (
            d[i] >= this.domain[0] &&
            d[i] <= this.domain[1] &&
            valid(values[i])
          ) {
            lo = Math.min(lo, values[i] * layer.factor);
            hi = Math.max(hi, values[i] * layer.factor);
          }
      if (!valid(lo)) {
        lo = 0;
        hi = 1;
      }
      if (["brake", "throttle"].includes(layer.key)) {
        lo = 0;
        hi = 100;
      } else if (layer.key === "steeringNormalized") {
        lo = -100;
        hi = 100;
      } else if (layer.key === "speedMps") {
        lo = 0;
        hi = Math.max(10, hi * 1.05);
      } else {
        const pad = Math.max(0.1, (hi - lo) * 0.08);
        lo -= pad;
        hi += pad;
      }
      if (hi === lo) hi = lo + 1;
      ctx.font = "12px system-ui";
      ctx.fillStyle = css.getPropertyValue("--muted");
      ctx.strokeStyle = css.getPropertyValue("--line");
      ctx.lineWidth = 1;
      for (let i = 0; i <= 2; i++) {
        const y = top + ((bottom - top) * i) / 2;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(
          (hi - ((hi - lo) * i) / 2).toFixed(layer.key === "deltaS" ? 1 : 0),
          left - 8,
          y + 4,
        );
      }
      ctx.textAlign = "left";
      ctx.fillText(this.domain[0].toFixed(0) + " м", left, h - 5);
      ctx.textAlign = "right";
      ctx.fillText(this.domain[1].toFixed(0) + " м", right, h - 5);
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, right - left, bottom - top);
      ctx.clip();
      for (let a = 0; a < arrays.length; a++) {
        ctx.strokeStyle = css.getPropertyValue(layer.color);
        ctx.lineWidth = a ? 1.6 : 2;
        ctx.setLineDash(a ? [6, 4] : []);
        ctx.beginPath();
        let drawing = false;
        for (let i = 0; i < d.length; i++) {
          const value = arrays[a][i];
          if (!valid(value)) {
            drawing = false;
            continue;
          }
          const x =
              left +
              ((d[i] - this.domain[0]) / (this.domain[1] - this.domain[0])) *
                (right - left),
            y =
              bottom -
              ((value * layer.factor - lo) / (hi - lo)) * (bottom - top);
          if (drawing) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
          drawing = true;
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  drawCursor() {
    if (!this.data) return;
    for (const layer of this.layers) {
      const { ctx, w, h } = this.context(layer.cursor),
        x =
          52 +
          ((this.cursor - this.domain[0]) / (this.domain[1] - this.domain[0])) *
            (w - 66);
      const scale = (v) =>
        52 +
        ((v - this.domain[0]) / (this.domain[1] - this.domain[0])) * (w - 66);
      if (this.region) {
        const lo = Math.max(this.region[0], this.domain[0]),
          hi = Math.min(this.region[1], this.domain[1]);
        ctx.fillStyle = "rgba(201,252,96,0.10)";
        if (hi >= lo)
          ctx.fillRect(scale(lo), 10, scale(hi) - scale(lo), h - 36);
        layer.cursor.dataset.regionStart = String(this.region[0]);
        layer.cursor.dataset.regionEnd = String(this.region[1]);
      } else {
        delete layer.cursor.dataset.regionStart;
        delete layer.cursor.dataset.regionEnd;
      }
      ctx.strokeStyle = getComputedStyle(
        document.documentElement,
      ).getPropertyValue("--text");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.lineTo(x, h - 26);
      ctx.stroke();
      layer.cursor.dataset.position = String(x);
    }
  }
  clear() {
    this.data = null;
    this.region = null;
    this.layers = [];
    this.container.replaceChildren();
  }
}
export const SIGNALS = signals;
