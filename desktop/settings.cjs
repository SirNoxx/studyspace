const { cloudOrigin } = require("./policy.cjs");
const DEFAULT_CLOUD_ORIGIN = "https://studyspace-noxx-studios.vercel.app";

function defaultSettings(hasLocalWorkspace = false) {
  return {
    cloudOrigin: DEFAULT_CLOUD_ORIGIN,
    automaticUpdates: true,
    lastWorkspace: "local",
  };
}

function restoreSettings(saved) {
  return {
    cloudOrigin: cloudOrigin(saved.cloudOrigin || DEFAULT_CLOUD_ORIGIN),
    automaticUpdates: saved.automaticUpdates !== false,
    // An upgrade must not move an existing user's local workspace.
    lastWorkspace: "local",
  };
}

module.exports = { DEFAULT_CLOUD_ORIGIN, defaultSettings, restoreSettings };
