// The "Install" button that puts the portal on the desktop. Served from the portal itself
// at /admin/install.js, like the copy script; only owner pages may run it.
//
// Chrome and Edge tell a page when it can be installed (the "beforeinstallprompt" event).
// Only then does this show the Install buttons; pressing one opens the browser's own
// "Install Accessibility portal?" box. In other browsers the buttons stay hidden and the
// written steps next to them do the job. Inside the installed app, the offer is hidden.

export const INSTALL_SCRIPT_PATH = "/admin/install.js";

export const INSTALL_SCRIPT = `"use strict";
(function () {
  var DISMISSED = "a11y-portal-install-dismissed";
  var buttons = document.querySelectorAll("[data-install]");
  var offers = document.querySelectorAll("[data-install-offer]");
  var statuses = document.querySelectorAll("[data-install-status]");
  var waiting = null;

  function each(list, fn) {
    for (var i = 0; i < list.length; i++) fn(list[i]);
  }
  function say(text) {
    each(statuses, function (s) { s.textContent = text; });
  }
  function dismissed() {
    try { return window.localStorage.getItem(DISMISSED) === "1"; } catch (e) { return false; }
  }
  function installed() {
    waiting = null;
    each(buttons, function (b) { b.hidden = true; });
    each(offers, function (o) { o.hidden = true; });
  }

  var inApp = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (inApp) {
    installed();
    say("You're using the installed portal app.");
    return;
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    waiting = event;
    each(buttons, function (b) { b.hidden = false; });
    if (!dismissed()) each(offers, function (o) { o.hidden = false; });
  });

  window.addEventListener("appinstalled", function () {
    installed();
    say("Installed. Look for Accessibility portal on your desktop or in your Start menu.");
  });

  each(buttons, function (button) {
    button.addEventListener("click", function () {
      if (!waiting) return;
      var prompt = waiting;
      prompt.prompt();
      prompt.userChoice.then(function (choice) {
        if (choice.outcome === "accepted") {
          installed();
          say("Installed. Look for Accessibility portal on your desktop or in your Start menu.");
        } else {
          // The browser's box can only be shown once per page; the written steps still work.
          waiting = null;
          each(buttons, function (b) { b.hidden = true; });
          say("Not installed. You can install it any time with the steps below, or reload this page to see the button again.");
        }
      });
    });
  });

  each(document.querySelectorAll("[data-install-dismiss]"), function (button) {
    button.addEventListener("click", function () {
      try { window.localStorage.setItem(DISMISSED, "1"); } catch (e) {}
      each(offers, function (o) { o.hidden = true; });
    });
  });
})();
`;
