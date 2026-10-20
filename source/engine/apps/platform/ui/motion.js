const query = matchMedia("(prefers-reduced-motion: reduce)");
const choices = ["system", "full", "minimal", "off"];
let preference = "system";
try {
  const saved = localStorage.getItem("apex-motion");
  if (choices.includes(saved)) preference = saved;
} catch {
  /* unavailable storage */
}
export const motionMode = () =>
  preference === "system" ? (query.matches ? "minimal" : "full") : preference;
export const motionEvents = new EventTarget();
let anime;
const active = new Map();
function stop() {
  for (const a of active.values()) a.revert();
  active.clear();
}
function changed() {
  document.documentElement.dataset.motion = motionMode();
  stop();
  motionEvents.dispatchEvent(new Event("change"));
}
export function setMotion(value) {
  if (!choices.includes(value)) return;
  preference = value;
  try {
    localStorage.setItem("apex-motion", value);
  } catch {
    /* optional preference only */
  }
  changed();
}
query.addEventListener("change", changed);
changed();

export async function emphasize(element, kind = "selection") {
  if (!element || motionMode() !== "full" || document.hidden) return;
  anime ??= import("./anime.js");
  const { animate } = await anime;
  if (!element.isConnected || motionMode() !== "full" || document.hidden)
    return;
  active.get(element)?.revert();
  const a = animate(element, {
    opacity: kind === "map" ? [0.45, 1] : [0.7, 1],
    duration: kind === "map" ? 320 : 180,
    ease: "outExpo",
    onComplete: () => {
      if (active.get(element) === a) {
        active.delete(element);
        a.revert();
      }
    },
  });
  active.set(element, a);
}

export function setupMotion() {
  if (document.getElementById("motion-preference")) return;
  const details = document.createElement("details");
  details.className = "motion-preference";
  details.id = "motion-preference";
  const summary = document.createElement("summary");
  const group = document.createElement("div");
  group.className = "motion-options";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Режим анимации");
  const options = [
    ["system", "По системе"],
    ["full", "Полная"],
    ["minimal", "Минимальная"],
    ["off", "Выключена"],
  ];
  const sync = () => {
    summary.textContent =
      "Анимация: " +
      options.find(([value]) => value === preference)[1].toLowerCase();
    for (const button of group.children)
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.motionChoice === preference),
      );
  };
  for (const [value, text] of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.dataset.motionChoice = value;
    button.addEventListener("click", () => {
      setMotion(value);
      sync();
      details.open = false;
      summary.focus({ preventScroll: true });
    });
    group.append(button);
  }
  details.append(summary, group);
  sync();
  details.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      details.open = false;
      summary.focus();
    }
  });
  (
    document.querySelector(".platform-header") ||
    document.querySelector(".work-controls")
  )?.append(details);
  document.addEventListener(
    "toggle",
    (event) => {
      if (event.target instanceof HTMLDetailsElement && event.target.open) {
        // Animate content only, leaving the focused summary and its hit area fixed.
        for (const child of event.target.children)
          if (child.tagName !== "SUMMARY") emphasize(child);
      }
    },
    true,
  );
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});
window.addEventListener("pagehide", stop);
