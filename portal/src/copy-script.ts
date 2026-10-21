// The "Copy" buttons on owner pages (one of two small scripts; see scan-script.ts). Served from the
// portal itself at /admin/copy.js, and only owner pages are allowed to run it (see the
// Content-Security-Policy in index.tsx). Visitors' pages have no JavaScript at all.
//
// The buttons start hidden. This script shows them, then copies with the modern
// clipboard; if the browser blocks that (some company computers and built-in browsers
// do), it falls back to the older copy command. If both fail, it says so, and people
// select the text and copy it as before.

export const COPY_SCRIPT_PATH = "/admin/copy.js";

export const COPY_SCRIPT = `"use strict";
(function () {
  function oldStyleCopy(text) {
    var box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.setAttribute("aria-hidden", "true");
    box.style.position = "fixed";
    box.style.top = "-1000px";
    document.body.appendChild(box);
    box.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(box);
    return ok;
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return oldStyleCopy(text); }
      );
    }
    return Promise.resolve(oldStyleCopy(text));
  }

  var buttons = document.querySelectorAll("[data-copy-target], [data-copy-text]");
  for (var i = 0; i < buttons.length; i++) {
    (function (button) {
      var status = document.getElementById(button.getAttribute("data-copy-status"));
      button.hidden = false;
      button.addEventListener("click", function () {
        var targetId = button.getAttribute("data-copy-target");
        var target = targetId ? document.getElementById(targetId) : null;
        var text = target ? target.value : button.getAttribute("data-copy-text");
        copy(text).then(function (ok) {
          if (!status) return;
          status.textContent = ok ? "Copied \\u2713" : "Couldn't copy. Please select the text and copy it instead.";
          if (ok) setTimeout(function () { status.textContent = ""; }, 4000);
        });
      });
    })(buttons[i]);
  }
})();
`;
