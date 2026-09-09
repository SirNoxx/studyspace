const { URL, pathToFileURL } = require("node:url");
function cloudOrigin(value) {
  if (!value || !value.trim()) return "";
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new Error(
      "Enter the HTTPS origin of your hosted Studyspace app, for example https://studyspace.example.com.",
    );
  return url.origin;
}
function externalUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function settingsSender(event, window, settingsPath) {
  return (
    !!window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === pathToFileURL(settingsPath).href
  );
}
function serverEnvironment(port, source = process.env) {
  const env = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "COMSPEC",
  ])
    if (source[key]) env[key] = source[key];
  return {
    ...env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
  };
}
module.exports = {
  cloudOrigin,
  externalUrl,
  settingsSender,
  serverEnvironment,
};
