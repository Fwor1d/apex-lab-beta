import { motionMode, motionEvents } from "./motion.js";

// Presentation only: no minimum display time, work queue or synthetic percentage.
export function createLoading(host) {
  const panel = document.createElement("section");
  panel.className = "operation-loading";
  panel.hidden = true;
  const visual = document.createElement("div");
  visual.className = "operation-dial";
  visual.setAttribute("aria-hidden", "true");
  const body = document.createElement("div");
  const label = document.createElement("p");
  label.className = "operation-label";
  const note = document.createElement("p");
  note.className = "muted";
  const retry = document.createElement("button");
  retry.textContent = "Повторить";
  retry.hidden = true;
  body.append(label, note, retry);
  panel.append(visual, body);
  host.append(panel);
  let timer,
    island,
    generation = 0,
    running = false,
    progress = null,
    retryAction,
    mounting = 0;
  const props = () => ({ progress, motion: motionMode() });
  function unmount() {
    island?.destroy();
    island = null;
    visual.replaceChildren();
  }
  async function show(token) {
    if (token !== generation || !running || document.hidden) return;
    const request = ++mounting;
    panel.hidden = false;
    try {
      const { mountDial } = await import("./islands.js");
      if (
        token !== generation ||
        request !== mounting ||
        !running ||
        document.hidden
      )
        return;
      unmount();
      island = mountDial(visual, props());
    } catch {
      note.textContent =
        "Операция продолжается. Визуальный индикатор недоступен.";
    }
  }
  function update(text, value = null) {
    progress = Number.isFinite(value)
      ? Math.min(100, Math.max(0, value))
      : null;
    label.textContent = text;
    panel.setAttribute("role", "progressbar");
    panel.setAttribute("aria-label", text);
    panel.setAttribute("aria-valuemin", "0");
    panel.setAttribute("aria-valuemax", "100");
    if (progress === null) panel.removeAttribute("aria-valuenow");
    else panel.setAttribute("aria-valuenow", String(progress));
    note.textContent =
      progress === null
        ? "Выполняется · объём оставшейся работы неизвестен"
        : `${Math.round(progress)}% выполнено`;
    island?.update(props());
  }
  function finish(state = "success", text = "Готово", action) {
    running = false;
    clearTimeout(timer);
    generation++;
    unmount();
    panel.dataset.state = state;
    panel.removeAttribute("aria-valuenow");
    panel.removeAttribute("aria-valuemin");
    panel.removeAttribute("aria-valuemax");
    panel.removeAttribute("aria-label");
    panel.setAttribute("role", "status");
    label.textContent = text;
    note.textContent = "";
    retryAction = action;
    retry.hidden = !action;
    // Ready content is never held behind a cosmetic completion animation.
    panel.hidden = state === "success" || state === "cancelled";
  }
  function start(text, value = null) {
    clearTimeout(timer);
    generation++;
    unmount();
    running = true;
    panel.hidden = true;
    panel.dataset.state = "working";
    retry.hidden = true;
    retryAction = null;
    update(text, value);
    const token = generation;
    timer = setTimeout(() => show(token), 280);
  }
  retry.addEventListener("click", () => retryAction?.());
  const preferenceChanged = () => island?.update(props());
  const visibility = () => {
    if (document.hidden) unmount();
    else if (running) show(generation);
  };
  motionEvents.addEventListener("change", preferenceChanged);
  document.addEventListener("visibilitychange", visibility);
  function destroy() {
    clearTimeout(timer);
    generation++;
    running = false;
    unmount();
    panel.remove();
    motionEvents.removeEventListener("change", preferenceChanged);
    document.removeEventListener("visibilitychange", visibility);
  }
  return { start, update, finish, destroy };
}
