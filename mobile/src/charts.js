import { signalsAt, getDrivingProfile } from "./model.js";
import { clamp } from "./geometry.js";

import { readPalette } from "./visual-tokens.js";
const palette = readPalette();
const LEFT = 30;
const curve = (fn, right) =>
  Array.from(
    { length: 201 },
    (_, i) =>
      `${i ? "L" : "M"}${(LEFT + ((right - LEFT) * i) / 200).toFixed(2)},${fn(i / 200).toFixed(2)}`,
  ).join(" ");
export class SignalCharts {
  constructor(element, onSeek) {
    this.element = element;
    element.innerHTML = [
      ["pedals", "Педали<br>%"],
      ["speed", "Скорость<br>км/ч"],
      ["steering", "Руль<br>усл. %"],
    ]
      .map(
        ([id, label]) =>
          `<div class="chart-row"><span>${label}</span><svg data-chart="${id}" viewBox="0 0 560 90" preserveAspectRatio="none" role="img" aria-label="График ${id === "pedals" ? "тормоза и газа" : id === "speed" ? "скорости" : "нормированного руля"}"><g class="chart-grid"></g><g class="chart-curves"></g><line class="chart-cursor" x1="30" x2="30" y1="10" y2="70" stroke="#d4e2c5" stroke-width="1"/><g class="chart-dots"></g></svg></div>`,
      )
      .join("");
    this.rows = [...element.querySelectorAll("svg")];
    this.rows.forEach((svg) => {
      const seek = (event) => {
        const rect = svg.getBoundingClientRect();
        onSeek(
          clamp(
            (event.clientX - rect.left - LEFT) /
              (Number(svg.dataset.right) - LEFT),
            0,
            1,
          ),
        );
      };
      let pointer = null;
      svg.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        pointer = event.pointerId;
        svg.setPointerCapture(pointer);
        seek(event);
      });
      svg.addEventListener("pointermove", (event) => {
        if (pointer === event.pointerId) seek(event);
      });
      const stop = () => {
        pointer = null;
      };
      svg.addEventListener("pointerup", stop);
      svg.addEventListener("pointercancel", stop);
      svg.addEventListener("lostpointercapture", stop);
    });
    this.observer = new ResizeObserver(() => {
      if (this.corner) this.update(this.corner, this.settings);
      if (this.lastSignals) this.render(this.lastSignals);
    });
    this.observer.observe(element);
  }
  update(corner, settings) {
    this.corner = corner;
    this.settings = settings;
    this.maxSpeed =
      Math.ceil(
        Math.max(
          ...getDrivingProfile(corner, settings).samples.map(
            (sample) => sample.speed,
          ),
        ) / 20,
      ) * 20;
    const colors = {
      brake: palette.red,
      throttle: palette.green,
      speed: palette.blue,
      steering: palette.purple,
    };
    this.rows.forEach((svg) => {
      const width = Math.max(150, svg.getBoundingClientRect().width);
      const right = width - 16;
      svg.setAttribute("viewBox", `0 0 ${width} 90`);
      svg.dataset.right = right;
      const id = svg.dataset.chart,
        labels =
          id === "steering"
            ? [100, 0, -100]
            : id === "speed"
              ? [this.maxSpeed, this.maxSpeed / 2, 0]
              : [100, 50, 0];
      svg.querySelector(".chart-grid").innerHTML =
        labels
          .map(
            (label, i) =>
              `<line x1="${LEFT}" x2="${right}" y1="${10 + i * 30}" y2="${10 + i * 30}" stroke="#3e483b" stroke-dasharray="2 5"/><text x="24" y="${14 + i * 30}" text-anchor="end" fill="#a3afa5" font-size="12">${label}</text>`,
          )
          .join("") +
        [0, 25, 50, 75, 100]
          .map(
            (v) =>
              `<line x1="${LEFT + ((right - LEFT) * v) / 100}" x2="${LEFT + ((right - LEFT) * v) / 100}" y1="10" y2="70" stroke="#343e31" stroke-dasharray="2 6"/>${id === "steering" ? `<text x="${LEFT + ((right - LEFT) * v) / 100}" y="85" text-anchor="middle" fill="#a3afa5" font-size="12">${v}%</text>` : ""}`,
          )
          .join("");
      const channels = id === "pedals" ? ["brake", "throttle"] : [id];
      svg.querySelector(".chart-curves").innerHTML = channels
        .map(
          (channel) =>
            `<path data-channel="${channel}" d="${curve((p) => this.y(channel, signalsAt(p, corner, settings)[channel]), right)}" fill="none" stroke="${colors[channel]}" stroke-width="1.8" stroke-linejoin="round"/>`,
        )
        .join("");
      svg.querySelector(".chart-dots").innerHTML = channels
        .map(
          (channel) =>
            `<circle data-channel="${channel}" cx="30" cy="70" r="3" fill="${colors[channel]}" stroke="#192018" stroke-width="1"/>`,
        )
        .join("");
    });
  }
  y(channel, value) {
    return channel === "steering"
      ? 40 - value * 0.3
      : channel === "speed"
        ? 70 - (value / this.maxSpeed) * 60
        : 70 - value * 0.6;
  }
  render(signals) {
    this.lastSignals = signals;
    this.rows.forEach((svg) => {
      const x = LEFT + (Number(svg.dataset.right) - LEFT) * signals.progress;
      const cursor = svg.querySelector(".chart-cursor");
      cursor.setAttribute("x1", x);
      cursor.setAttribute("x2", x);
      svg.querySelectorAll("circle").forEach((dot) => {
        dot.setAttribute("cx", x);
        dot.setAttribute(
          "cy",
          this.y(dot.dataset.channel, signals[dot.dataset.channel]),
        );
      });
    });
  }
}
