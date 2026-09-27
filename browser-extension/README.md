# CryptoGuard Browser Extension

Load this directory as an unpacked extension in Chrome 111+, Edge, or Brave. The MAIN-world hook is required because isolated content scripts cannot patch the page's WebAssembly or Worker objects. Findings cross to the isolated script through `window.postMessage`, and the service worker scores worker fan-out, WASM use, and long tasks.

`rules.json` is a static Manifest V3 declarativeNetRequest ruleset for known legacy pool domains. The popup can close the current tab or allowlist its hostname for scoring; allowlisting does not override the static network blocks.

Behavioral evidence uses a rolling 60-second window and resets on full-page or SPA history navigation. A service-worker alarm refreshes scores as events expire. The popup keeps a capped, session-only score timeline; when the score is above 50, **Why this score?** shows recent evidence and offers a user-triggered JSON export for the current tab.

Open `safe-harness.html` locally to exercise the behavioral hooks without real mining or remote requests. For a `file://` page, enable the extension's “Allow access to file URLs” option in the browser's extension details first.

Run the deterministic scoring tests from the repository root with `node --test browser-extension/tests/risk-engine.test.js`.