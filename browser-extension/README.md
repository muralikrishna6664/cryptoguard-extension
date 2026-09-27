# CryptoGuard Browser Extension

Load this directory as an unpacked extension in Chrome 111+, Edge, or Brave. The MAIN-world hook is required because isolated content scripts cannot patch the page's WebAssembly or Worker objects. Findings cross to the isolated script through `window.postMessage`, and the service worker scores worker fan-out, WASM use, and long tasks.

`rules.json` is a static Manifest V3 declarativeNetRequest ruleset for known legacy pool domains. The popup can close the current tab or allowlist its hostname for scoring; allowlisting does not override the static network blocks.

Behavioral evidence uses a rolling 60-second window and resets on full-page or SPA history navigation. A service-worker alarm refreshes scores as events expire. The popup keeps a capped, session-only score timeline; when the score is above 50, **Why this score?** shows recent evidence and offers a user-triggered JSON export for the current tab.

Load this directory as an unpacked extension from the browser's extensions page. For normal websites, make sure the extension has access to the current site and reload the page after changing access.

To run the safe harness, start a local server from this directory with `python -m http.server 8000 --bind 127.0.0.1`, then open `http://127.0.0.1:8000/safe-harness.html` in the same browser profile. Click **Run all tests**, wait a few seconds, and reopen the CryptoGuard popup; it should show WebAssembly, worker, and long-task signals. Click **Stop idle workers** when finished.

Run the deterministic tests from this repository's root with `node --test tests/*.test.js`.