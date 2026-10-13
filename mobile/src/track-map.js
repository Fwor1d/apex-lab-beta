import { fitGeometry } from "./geometry.js";
import { APEX_PROGRESS, vehiclePose } from "./model.js";

export class TrackMap {
  constructor(element, onSelect) {
    this.element = element;
    this.onSelect = onSelect;
    this.observer = new ResizeObserver(() => {
      if (this.circuit) this.update(this.circuit, this.selected);
    });
    this.observer.observe(element);
  }
  update(circuit, selected) {
    this.selected = selected;
    const width = Math.max(150, this.element.getBoundingClientRect().width);
    if (this.circuit !== circuit || this.width !== width) {
      this.width = width;
      this.circuit = circuit;
      this.fit = fitGeometry(circuit.geometry.samples, width, 200, 0, 28);
      const map = (p) =>
        `${(p.x * this.fit.scale + this.fit.x).toFixed(2)},${(p.y * this.fit.scale + this.fit.y).toFixed(2)}`;
      const path = circuit.geometry.samples
        .map((p, i) => `${i ? "L" : "M"}${map(p)}`)
        .join(" ");
      this.element.innerHTML = `<svg viewBox="0 0 ${width} 200" role="group" aria-label="Карта Sebring: выберите T1, T7 или T17"><path class="map-outline" d="${path}"/><circle class="map-vehicle" r="3"/>${circuit.corners
        .map((c) => {
          const p = c.path.point(APEX_PROGRESS),
            x = p.x * this.fit.scale + this.fit.x,
            y = p.y * this.fit.scale + this.fit.y;
          return `<g role="button" tabindex="0" data-map-corner="${c.id}" aria-label="Выбрать ${c.number}" transform="translate(${x},${y})"><circle class="map-hit" r="26"/><circle class="map-pin" r="16"/><text text-anchor="middle" y="4">${c.number}</text></g>`;
        })
        .join("")}</svg>`;
      this.element.querySelectorAll("[data-map-corner]").forEach((node) => {
        const select = () => this.onSelect(node.dataset.mapCorner);
        node.addEventListener("click", select);
        node.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select();
          }
        });
      });
      this.vehicle = this.element.querySelector(".map-vehicle");
    }
    this.element
      .querySelectorAll("[data-map-corner]")
      .forEach((node) =>
        node.setAttribute(
          "aria-pressed",
          String(node.dataset.mapCorner === selected),
        ),
      );
    if (this.lastState) this.render(this.lastState);
  }
  render(state) {
    const pose = vehiclePose(
      state.progress,
      state.corner.path,
      state.corner,
      state.settings,
    );
    this.lastState = state;
    this.vehicle.setAttribute("cx", pose.x * this.fit.scale + this.fit.x);
    this.vehicle.setAttribute("cy", pose.y * this.fit.scale + this.fit.y);
  }
}
