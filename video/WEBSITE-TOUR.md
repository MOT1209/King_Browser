# King website product film

36 seconds, 1920×1080, 30 fps, rendered once per website language: Arabic, English and German. Warm white, Manrope type (Noto Sans Arabic for Arabic) and cobalt blue follow the website.

The film has **no narration**. Every message appears as on-screen text in the viewer's language, so the three renders need no captions and no speech service. The quiet original score is synthesized by `scripts/generate-website-score.py` (no third-party music).

It combines real screenshots of the current King interface, captured in each language, with illustrative motion graphics: the King mark, clipped word reveals, workspace cards, a device/CPU path, a drawn code window and platform capsules. The graphics illustrate feature concepts; they do not record live browser interactions. Animation is deterministic and frame-driven (`src/KingWebsiteTour.tsx`, `src/components/TourMotion.tsx`). Arabic renders right to left with no negative letter-spacing, and the King wordmark stays left to right.

Timeline: introduction (0–5.5s), workspaces (5.5–14.5s), local assistant (14.5–23.5s), open source (23.5–30s), invitation (30–36s). Scenes overlap by 0.6 seconds. Local AI requires a model download and compatible hardware. No sync-code pairing claim is made.

## Assets

`video/public/king-tour/`:

- `workspaces-{en,ar,de}.jpg`, `assistant-{en,ar,de}.jpg`: the current King interface in light theme. Captured with Playwright from a production build (`npx vite build && npx vite preview`), with the language, vertical tabs, a sample folder and the AI side panel seeded through local storage.
- `king-icon.png`: the app icon (same file as `website/public/images/king-icon.png`).
- `noto-sans-arabic.woff2`: Noto Sans Arabic variable font from `@fontsource-variable/noto-sans-arabic` 5.3.0, SIL Open Font License 1.1.

The score and Manrope are shared with the older films in `video/public/website-tour/`.

## Re-render from the repository root

Requires the project's installed Remotion CLI and ffmpeg. Where Remotion cannot download its own headless Chrome, pass an installed one with `--browser-executable`.

```sh
python3 video/scripts/generate-website-score.py
for l in En Ar De; do
  npx remotion render video/src/index.ts KingWebsiteTour$l video/out/king-tour-$l-master.mp4 --public-dir=video/public --codec=h264 --crf=18 --concurrency=4
done
for l in en ar de; do
  L=$(echo ${l:0:1} | tr a-z A-Z)${l:1}
  ffmpeg -y -i video/out/king-tour-$L-master.mp4 -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -af volume=12dB -c:a aac -b:a 128k -movflags +faststart website/public/images/king-tour.$l.mp4
  ffmpeg -y -ss 9 -i website/public/images/king-tour.$l.mp4 -frames:v 1 -q:v 3 website/public/images/king-tour.$l.poster.jpg
done
```

The website plays `king-tour.<language>.mp4` with the matching poster for the language the visitor picked.
