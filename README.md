CryptoGuard

Your device works for you. Not for hidden crypto miners.

CryptoGuard is a Manifest V3 browser extension that detects cryptojacking — the covert use of your CPU to mine cryptocurrency without your knowledge — while it's actually happening inside a browser tab, rather than relying solely on lists of known-bad domains that attackers can trivially route around by rotating infrastructure or renaming scripts.

Most cryptojacking detection historically relies on static blocklists of known mining-pool domains. That approach breaks the moment an attacker uses a new, unlisted pool or a self-hosted mining script. CryptoGuard instead watches for the behavior that cryptomining code exhibits regardless of where it's hosted: real-world miners almost universally compile their hashing routines to WebAssembly for performance, and parallelize the work across Web Workers — typically one worker per CPU core, to maximize throughput.

How it works
1. Behavioral detection

CryptoGuard hooks WebAssembly.instantiate / WebAssembly.instantiateStreaming and the Worker constructor directly in the page's own execution context — not just the extension's isolated sandbox, which cannot see or intercept the page's real JavaScript objects. This is combined with PerformanceObserver('longtask') to catch sustained main-thread blocking as a secondary signal.

Signal	Why it matters
WebAssembly.instantiate calls	Mining hash functions are almost always shipped as WASM for speed
Worker creation count	Miners typically spawn one worker per CPU core (navigator.hardwareConcurrency)
Workers from blob:/data: URLs	Common obfuscation technique to hide the worker's source
Long Tasks (>50ms)	Sustained blocking indicates heavy, continuous computation

These signals are combined into a live 0–100 risk score per tab, with a plain-language breakdown of exactly which behaviors contributed — not a black-box verdict.

2. Network blocking

A static declarativeNetRequest ruleset blocks requests to known mining-pool domains (CoinHive-successors, JSEcoin, Crypto-Loot, and others) before they ever load.

3. Response

When a tab is flagged, you can allowlist a site you trust or close the tab directly from the popup.

Privacy

No data leaves your browser. No telemetry, no analytics, no external servers. Detection runs entirely client-side, and the only network requests CryptoGuard itself makes are the blocklist checks handled natively by Chrome's declarativeNetRequest API.

Install (developer mode)
Clone or download this repository
Open chrome://extensions (or edge://extensions, brave://extensions)
Enable Developer mode (top right)
Click Load unpacked and select the browser-extension folder
Pin the CryptoGuard icon to your toolbar
Testing it safely

Included in this repo is safe-harness.html — a local test page that reproduces the behavioral signatures of cryptojacking (WASM instantiation, worker fan-out, main-thread blocking) without any real mining, network activity, or malicious code. Open it locally, click "Simulate mining behavior," and watch the CryptoGuard popup for that tab to confirm detection is working.

This project was validated exclusively against this synthetic harness — never against live malicious sites — since visiting an active cryptojacking page means your CPU actually gets hijacked for as long as you're on it, and such pages frequently bundle other malicious payloads beyond the miner itself.

Limitations
Heuristic, not proof. A high score means the observed behavior resembles cryptomining — it is not a certainty. Legitimate WASM-heavy sites (Figma, Google Earth, WebGL games) may occasionally register low/medium scores; allowlist sites you trust.
Domain blocklist is static and incomplete. New or self-hosted mining pools not in the list won't be blocked at the network layer — behavioral detection is the primary defense against these.
Browser-scoped only. CryptoGuard cannot see or protect against native cryptomining malware installed as a downloaded executable — that requires OS-level monitoring, which is outside a browser extension's sandbox by design.
Not a certified security product. This is a working prototype built to explore whether meaningful cryptojacking detection is achievable using only the APIs a standard browser extension already has, without invasive system access.
Why this matters

Cryptojacking doesn't announce itself — no ransom note, no popup. Just a hot laptop, a loud fan, a draining battery, and a slightly higher electricity bill. It's easy to misattribute to normal wear, which is exactly why it persists. Traditional antivirus often misses it because the code is deliberately designed to look like ordinary browser activity. CryptoGuard exists to make that activity visible.
