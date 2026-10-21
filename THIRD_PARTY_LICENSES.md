# Third-Party Licenses and Attribution — King Browser

King Browser is derived in part from open-source software. This file records the required attributions.

## 1. Nova Browser (primary code foundation)

King Browser includes code derived from:

```text
Nova Browser (https://github.com/unitybtw/nova-browser)
Copyright (c) 2026 Nova Browser (unitybtw)
Licensed under the MIT License.
```

- Base commit: `778503ca29ae5496119ac59efb73a2abd6caff8a` (branch `main`, snapshot 2026-10-17)
- Full license text: [`licenses/nova-browser-LICENSE`](licenses/nova-browser-LICENSE)
- Details of what was taken and modified: [`docs/UPSTREAM.md`](docs/UPSTREAM.md)

## 2. Studied but not reused (reference only)

| Project | License | Reuse | Notes |
|---|---|---|---|
| BrowserOS (https://github.com/browseros-ai/BrowserOS) | AGPL-3.0 | **None** — design reference only | No code copied; concepts studied only. |
| AgenticBrowser (https://github.com/tushar-alt/AgenticBrowser) | None (all rights reserved) | **None** — concept reference only | No license file exists; no code copied; ideas re-implemented clean-room where applicable. |

## 3. Dependency licenses

The dependency tree is inherited from the Nova Browser snapshot above (via `package-lock.json`).

- Pre-release gate: run an automated license sweep (e.g., `license-checker` / `licensee`) over the full dependency tree.
- Any dependency with AGPL/GPL/SSPL or unknown/absent license must be reviewed before distribution.

```text
Sweep: 2026-10-19 — package-lock.json, 1130 entries, license metadata only.

Production dependencies: no GPL/AGPL/SSPL/UNLICENSED entries found.
- jszip is dual-licensed "(MIT OR GPL-3.0-or-later)"; distribution uses the MIT option.

Dev-only tooling (not packaged with the app, no source imports):
- @img/sharp-* platform binaries: LGPL-3.0-or-later.
- remotion / @remotion/*: Remotion License; several platform packages carry no
  license field in the lockfile. Review the Remotion License before using the
  generated output commercially.

27 MPL-2.0 packages remain in the tree (file-level copyleft); retain their notices.
This is a metadata scan, not a legal review. Rerun the sweep before each release.
```

## 4. King Browser itself

King Browser is licensed under the MIT License. See [`LICENSE`](LICENSE).

> This file is an engineering compliance record, not legal advice. Before commercial distribution, a qualified reviewer should confirm the combined-work analysis.
