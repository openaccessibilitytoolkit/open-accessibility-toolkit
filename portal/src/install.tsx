// "Put the portal on your desktop": a box on Check my setup with an Install button and
// written steps for every browser, and a small offer on the Reports page. The buttons
// stay hidden until the browser says it can install the portal (see install-script.ts).

import { INSTALL_SCRIPT_PATH } from "./install-script.js";

/** The box on Check my setup. Works without the script: then only the steps show. */
export function InstallCard() {
  return (
    <section class="card" id="desktop" aria-labelledby="desktop-heading">
      <h2 id="desktop-heading">Put the portal on your desktop</h2>
      <p>
        Install the portal like a program: it gets its own icon on your desktop and in your Start menu, and opens
        in its own window. It's still this website, so it's always up to date.
      </p>
      <p>
        <button type="button" data-install hidden>
          Install
        </button>
      </p>
      <p class="field-status" role="status" data-install-status></p>
      <details>
        <summary>Steps for your browser</summary>
        <ul>
          <li>
            <strong>Chrome or Microsoft Edge on a computer:</strong> click <strong>Install</strong> above if you see
            it. Otherwise, click the install icon at the right end of the address bar (a small screen with an arrow),
            or open the browser's menu (the three dots at the top right) and look for <strong>Install</strong>.
          </li>
          <li>
            <strong>Safari on a Mac:</strong> open the <strong>File</strong> menu and choose{" "}
            <strong>Add to Dock</strong>.
          </li>
          <li>
            <strong>iPhone or iPad:</strong> tap the <strong>Share</strong> button, then{" "}
            <strong>Add to Home Screen</strong>.
          </li>
          <li>
            <strong>Android phone:</strong> open the browser's menu and tap <strong>Install app</strong> or{" "}
            <strong>Add to Home screen</strong>.
          </li>
          <li>
            <strong>Firefox:</strong> it can't install websites as apps. Use Chrome or Edge for this, or bookmark the
            portal.
          </li>
        </ul>
      </details>
      <script src={INSTALL_SCRIPT_PATH} defer></script>
    </section>
  );
}

/** A small offer on the Reports page. Only appears when the browser can install the portal, until "Not now". */
export function InstallOffer() {
  return (
    <div class="notice install-offer" data-install-offer hidden>
      <p>
        <strong>Put the portal on your desktop</strong> to open it like a program.
      </p>
      <p class="install-actions">
        <button type="button" data-install hidden>
          Install
        </button>{" "}
        <button type="button" class="secondary-button" data-install-dismiss>
          Not now
        </button>
      </p>
      <p class="field-status" role="status" data-install-status></p>
      <script src={INSTALL_SCRIPT_PATH} defer></script>
    </div>
  );
}
