# Proposal: harden the rolling nightly release flow (post PR #15)

Status: applied. The diff below was applied verbatim to
`.github/workflows/release.yml` on `main` (overwrite-in-place replaced
delete-before-upload). Kept as the reviewed rationale record. Nothing here
blocks a versioned release.

## What PR #15 does and why it is good

Every push to `main` rebuilds macOS, Windows and Linux installers and replaces a
single rolling pre-release named "nightly". Users always get one fresh download
of `main`; the auto-updater and `/releases/latest` ignore pre-releases. The
concurrency group serializes same-ref runs, and `versioned` releases are
guarded by a tag-existence check in a `check` job. Both are sound.

## Risks in the nightly publish step (delete-before-upload)

The `publish` job runs, in order:

1. `gh release delete nightly --cleanup-tag --yes || true`
2. `softprops/action-gh-release@v2` creates the release and uploads assets.

Three failure modes follow from deleting before uploading, not before building:

- R1 - Destruction on publish failure. A successful build can still fail to
  publish (API hiccup, rate limit). After step 1 the old nightly is gone, so a
  failure in step 2 leaves the repository with NO nightly at all until the next
  successful push to `main`. The nightly is a human download, so a missing
  release is a broken public link on every push until then.
- R2 - `|| true` masks deletion failures. If step 1 fails silently (network,
  permissions), the stale release survives and step 2 uploads into it.
  `action-gh-release` v2 does not replace same-named assets by default, so the
  run can end half-updated: some assets from the previous commit, some from the
  new one, with `SHA256SUMS.txt` matching neither consistently.
- R3 - Transient download gap. Between step 1 and step 2 the nightly URL 404s.
  Short, but it repeats on every push to `main`, which is the workflow's most
  frequent trigger.

## Minimal fix: overwrite in place, never delete

Upload the new assets into the existing nightly release instead of destroying
it first. `softprops/action-gh-release@v2` supports `overwrite_files: true`
(added in v2.2.0) which replaces same-named assets. Same-name collisions are
impossible here because the asset set comes from one verified build with a
stable matrix. The pin `@v2` resolves to v2.2.0 or newer, so the input is
available.

```diff
--- a/.github/workflows/release.yml
+++ b/.github/workflows/release.yml
@@ -160,13 +160,14 @@
-      # Replace nightly completely (assets and tag), so no stale files from an
-      # older version number remain in it.
-      - name: Remove the previous nightly
-        if: needs.check.outputs.nightly == 'true'
-        run: gh release delete nightly --cleanup-tag --yes || true
-
       - name: Publish nightly
         if: needs.check.outputs.nightly == 'true'
         uses: softprops/action-gh-release@v2
         with:
           tag_name: nightly
           name: Nightly (latest build of main)
           target_commitish: ${{ github.sha }}
           prerelease: true
           make_latest: 'false'
           draft: false
+          # Refresh the rolling nightly in place: same-named assets are
+          # replaced, so a failed run can never delete the nightly and the
+          # download link never 404s between pushes. The git tag stays where
+          # the previous successful build put it; the release body names the
+          # exact commit these assets were built from.
+          overwrite_files: true
           body: |
             Rolling build of `main` at commit ${{ github.sha }}. It is
```

(Line numbers are indicative; feed the patch with `git apply --recount` or
apply the three-way intent manually.)

## What this changes and what it deliberately changes

- Downside accepted: the `nightly` git tag stays on the commit of the previous
  successful build; `target_commitish` only takes effect when softprops creates
  the tag. Cosmetic only - the release body states the exact commit of the
  assets, and `SHA256SUMS.txt` is regenerated every run and always matches the
  attached files.
- Upside gained: no destroy-on-failure (R1), no silent mixed-asset states from
  masked delete failures (R2), no polling gap (R3), and no tag churn for
  developers who fetched `nightly` before.
- A failed publish leaves the previous nightly fully usable; the next push to
  `main` completes the replacement because the concurrency group serializes
  runs and `overwrite_files` finishes the job.

## Alternative considered and rejected

Moving the tag after a successful upload (`git push origin :refs/tags/nightly`
+ recreate + push) would keep the tag accurate, but deleting a ref that a
published release points at races with GitHub's release bookkeeping and adds a
second failure path. The nightly tag has no consumers that care about moving
one push earlier; avoid it.

## Follow-up (not part of this fix)

Nightly asset names embed package.json's version, so pushes that do not bump
the version reuse asset names like `King-0.0.5.exe`. That is fine for a
rolling download, but worth remembering if a future change makes nightly feed
the auto-updater: the updater compares version numbers and would never offer a
same-version update. The workflow already documents this constraint.

## Related finding on main: release builds compile without King Cloud endpoints

`base1` and `origin/main` carry two independently developed release workflows
(the merge-base cc26aa0 contains neither). `base1`'s version passes the build
secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; `origin/main`'s version
(PR #15 lineage) does not. `src/services/supabaseClient.ts` reads those vars at
`getSupabaseConfig()` and falls back to empty endpoints, so installers released
from `origin/main` silently ship in local-vault-only mode: no crash, no error,
just a missing feature, unless the user configures a Supabase project in the
UI. Suggested fix as part of the same follow-up PR on main:

```diff
         env:
           CSC_LINK: ${{ matrix.os == 'windows-latest' && secrets.WIN_CSC_LINK || secrets.CSC_LINK }}
           CSC_KEY_PASSWORD: ${{ matrix.os == 'windows-latest' && secrets.WIN_CSC_KEY_PASSWORD || secrets.CSC_KEY_PASSWORD }}
+          # King Cloud auth is compiled in by Vite. Without these the released
+          # binary runs only in local-vault mode; leaving them unset is not an
+          # error, and the local-only behaviour is preserved.
+          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
+          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

Resolved: this exact env block is present in the merged release workflow on
`main` (verified against `1c50ddf`), so versioned installers compile King Cloud
in instead of silently shipping local-vault-only.
