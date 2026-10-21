# License and Attribution Analysis — King Browser

> Status: **Complete** (evidence-based)
> Date: 2026-10-17
> Purpose: Establish what may legally be reused from each investigated repository, and what attribution obligations follow.

---

## 1. Findings

### 1.1 BrowserOS — AGPL-3.0

- `LICENSE` = GNU Affero General Public License v3.0.
- Additionally ships `LICENSE.ungoogled_chromium` and `CLA.md`.
- **Implication:** AGPL-3.0 is a strong copyleft license. If any AGPL-licensed code were incorporated into King Browser, the **entire combined work** (and, for AGPL, even network-interactive use) would be bound by AGPL terms: full source disclosure under AGPL, no relicensing under MIT, anti-DRM clauses, etc.
- **Decision:** **Zero code reuse.** BrowserOS may be *read* for architectural ideas and product concepts. Ideas are not copyrightable; copying expression (code, comments, non-trivial structure) is prohibited.

### 1.2 AgenticBrowser — No License (All Rights Reserved)

- GitHub API reports `license: null`; the repository contains **no** LICENSE, LICENCE, or COPYING file (verified in local clone).
- `package.json` states `"license": "MIT"`. This is a metadata field, **not a license grant**. Without the actual license text and grant, default copyright applies: nobody may copy, modify, or distribute the code.
- **Decision:** **Zero code reuse.** Conceptual study only. Any similar feature (e.g., approval/supervisor UX) must be implemented **clean-room**:
  - Design notes are written from observed *behavior* and *public descriptions*, not by copying code.
  - No source files, CSS, comments, or naming structures are carried over.
  - Implementation is written from scratch by a developer (or agent) not transcribing the original.

### 1.3 Nova Browser — MIT

- `LICENSE` confirmed: "MIT License — Copyright (c) 2026 Nova Browser (unitybtw)".
- MIT is permissive: use, copy, modify, merge, publish, distribute, sublicense, and sell are permitted, **provided** the copyright notice and permission notice are preserved.
- **Decision:** **Full reuse permitted** with attribution. Suitable as the King Browser foundation.

---

## 2. Attribution Obligations for King Browser

### 2.1 If Nova Browser is adopted as the foundation

King Browser must:

1. Keep the original MIT license text from Nova Browser, including the copyright line, in the repository.
2. Include a `NOTICE` / `THIRD_PARTY_LICENSES.md` file stating that King Browser is derived in part from Nova Browser, with repository URL.
3. Preserve license headers in files carried over from Nova, if any exist.
4. Because King Browser will itself be distributed as open source (target: MIT), the derived code remains MIT — no conflict.

### 2.2 Draft attribution block (to be placed in THIRD_PARTY_LICENSES.md)

```text
King Browser includes code derived from:
- Nova Browser (https://github.com/unitybtw/nova-browser)
  Copyright (c) 2026 Nova Browser (unitybtw)
  Licensed under the MIT License. Full text in ./licenses/nova-browser-LICENSE.
```

### 2.3 Ideas from BrowserOS and AgenticBrowser

- BrowserOS (AGPL) and AgenticBrowser (no license): **ideas only, no attribution obligation, no code.**
- If inspiration is acknowledged publicly for clarity (recommended but not legally required), use wording like:
  "Design concepts were informed by studying BrowserOS and AgenticBrowser; no code was reused."

---

## 3. King Browser's Own License (proposal)

- **Recommended:** MIT (matches the foundation, maximizes reuse and auditability, no copyleft friction with the local-only agent tooling).
- Must include in the final repository:
  - `LICENSE` (MIT, with King Browser copyright holder).
  - `THIRD_PARTY_LICENSES.md` (see above).
  - `docs/ATTRIBUTION.md` (human-readable summary).

---

## 4. Third-Party Dependencies (inherited via Nova)

Nova Browser's dependency tree will be carried over almost entirely. Compliance actions:

1. Generate the dependency license list during the build-gate phase (e.g., `license-checker` or `licensee`) once the install is verified.
2. Flag any dependency with AGPL/GPL/SSPL or unknown license for review before release.
3. Record the results in `THIRD_PARTY_LICENSES.md` (auto-generated section).

> Note: This is an engineering research record, not legal advice. Before public distribution, the summary here should be confirmed by a qualified reviewer if the project is commercialized.
