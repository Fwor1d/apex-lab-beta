// Keep an actionable error outside the dependency tree that may fail to load.
import("./app.js").catch(() => {
  document.getElementById("startupError").hidden = false;
  const status = document.getElementById("offlineStatus");
  status.textContent = "Приложение не загружено";
  status.dataset.ready = "false";
  document
    .querySelectorAll("main button,main input")
    .forEach((control) => (control.disabled = true));
  document
    .getElementById("retryStartup")
    .addEventListener("click", () => location.reload());
});
