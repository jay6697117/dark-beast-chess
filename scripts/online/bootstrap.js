import { OnlineBattlePanel } from "./online-panel.js";

function initOnlinePanel() {
  if (!document.getElementById("onlineStatus")) {
    return;
  }
  const panel = new OnlineBattlePanel();
  window.onlineBattlePanel = panel;
}

document.addEventListener("DOMContentLoaded", () => {
  initOnlinePanel();
});
