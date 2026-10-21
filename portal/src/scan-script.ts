// The script that keeps "Check my website" going: it checks one page at a time by
// pressing the "Check the next page" button for the owner, and reads out progress.
// Served from the portal itself at /admin/scan.js, like the copy script; only owner
// pages may run it. Without it, the owner presses the button themself.

export const SCAN_SCRIPT_PATH = "/admin/scan.js";

export const SCAN_SCRIPT = `"use strict";
(function () {
  var form = document.querySelector("form[data-scan-step]");
  if (!form || !window.fetch) return;
  var status = document.getElementById(form.getAttribute("data-scan-status"));
  var button = form.querySelector("button");
  var failures = 0;

  function say(text) {
    if (status) status.textContent = text;
  }

  function step() {
    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (result) {
        failures = 0;
        say(result.message);
        if (result.state === "running") {
          setTimeout(step, result.waitMs || 0);
        } else {
          window.location.assign(form.getAttribute("data-scan-done"));
        }
      })
      .catch(function () {
        failures++;
        if (failures < 3) {
          setTimeout(step, 5000);
        } else {
          say("We lost touch with the check. Press Check the next page to carry on.");
          if (button) button.hidden = false;
        }
      });
  }

  if (button) button.hidden = true;
  step();
})();
`;
