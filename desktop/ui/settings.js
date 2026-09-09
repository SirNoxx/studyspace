const api = window.studyspaceDesktop;
const $ = (id) => document.getElementById(id);
let initialized = false;
function render(state) {
  $("version").textContent = `v${state.version}`;
  if (!initialized) {
    $("cloud").value = state.settings.cloudOrigin;
    $("automatic").checked = state.settings.automaticUpdates;
    initialized = true;
  }
  $("cloud-open").disabled = !state.settings.cloudOrigin;
  const update = state.updates;
  $("update-status").textContent = update.message;
  $("update-badge").textContent = update.phase.toUpperCase();
  $("progress").hidden = update.phase !== "downloading";
  $("progress").value = update.progress || 0;
  $("install").hidden = update.phase !== "ready";
  $("check").disabled = ["checking", "downloading", "ready"].includes(
    update.phase,
  );
}
async function action(fn) {
  try {
    $("feedback").textContent = "";
    $("feedback").className = "";
    await fn();
  } catch (error) {
    $("feedback").className = "error";
    $("feedback").textContent = error.message.replace(
      /^Error invoking remote method '[^']+': Error: /,
      "",
    );
  }
}
$("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void action(async () => {
    render(
      await api.save({
        cloudOrigin: $("cloud").value,
        automaticUpdates: $("automatic").checked,
      }),
    );
    $("feedback").textContent = "Settings saved.";
  });
});
$("local").addEventListener(
  "click",
  () => void action(() => api.openWorkspace("local")),
);
$("cloud-open").addEventListener(
  "click",
  () => void action(() => api.openWorkspace("cloud")),
);
$("guide").addEventListener("click", () => void action(() => api.openGuide()));
$("check").addEventListener(
  "click",
  () => void action(async () => render(await api.checkUpdates())),
);
$("install").addEventListener(
  "click",
  () => void action(() => api.installUpdate()),
);
api.subscribe(render);
void action(async () => render(await api.state()));
