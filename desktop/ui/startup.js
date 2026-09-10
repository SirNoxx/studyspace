const params = new URLSearchParams(location.search);
if (params.get("error") === "1") {
  document.body.classList.add("failed");
  document.getElementById("status-text").textContent =
    "Your workspace couldn’t open.";
  document.getElementById("detail").textContent =
    params.get("workspace") === "cloud"
      ? "Check your internet connection and the app address in Desktop settings."
      : "The local workspace couldn’t start. Your saved notes are still on this computer.";
  if (params.get("workspace") === "cloud")
    document.getElementById("help").textContent =
      "To work offline, choose Studyspace → Local workspace from the top menu.";
  document.getElementById("help").hidden = false;
}
