# Assets

All assets are served locally; the site does not request external image or font hosts.

- `public/images/king-icon.png`, `king-mark.png`, `public/logo.png`, `public/king-icon.png`: the King app icon (`build/icon.png`, crown and globe), resized.
- `newtab.png`, `assistant.png`, `sync.png`: original repository screenshots. The assistant image is displayed as a CSS crop of the actual sidebar; no UI was invented or redrawn.
- `tour.webm`, `tour-poster.jpg`: existing King product walkthrough from `website/public/demo/`. The walkthrough is silent and has a descriptive text label.
- Manrope: installed through `@fontsource-variable/manrope`, served by Vite. Lucide icons: `lucide-react`.
- `alpine.webp`: generated for this website with the built-in image generation tool, then converted to WebP at quality 86 (approximately 135 KB).

## Landscape generation prompt

Use case: photorealistic-natural. Create a premium panoramic landscape asset for a sophisticated desktop browser website. Wide 16:9 composition. A dreamlike but photographic aerial landscape of pale ice-blue alpine mountain ridges with a calm turquoise lake and soft luminous clouds, morning light, powder blue and periwinkle shadows, extremely elegant quiet atmosphere. The top half is very pale almost white blue open sky and soft haze, the lower half has sweeping diagonal mountain ridges and the lake. Restrained editorial travel photography, medium format camera, realistic fine details, no grain, no people, no buildings. This is a website background behind a separate actual product screenshot. No text, no logos, no browser, no UI, no devices, no typography. Avoid oversaturated fantasy colors. Edge to edge image.

## New website product film

`king-tour.{en,ar,de}.mp4` and `king-tour.{en,ar,de}.poster.jpg` are the website product film, one render per site language. The 36-second, 1080p/30fps film was authored and rendered in Remotion from real screenshots of the current King interface in each language. It has no narration: all text is on screen, so no caption files are needed. Its instrumental score was synthesized for this project without third-party music. Editable source and render instructions: `video/src/KingWebsiteTour.tsx` and `video/WEBSITE-TOUR.md`.

## Updated tour screenshots — 2026-10-06

`newtab-current.jpg` and `assistant-current.jpg` are unaltered 1280 × 720 captures of King's current React renderer in the local web preview, using the light theme. They show the simplified shortcuts and assistant controls. The wallpaper credit remains visible in each screenshot. The tour contains the entire window rather than enlarging it beyond the panel. The sync screenshot remains the existing product capture; its CSS frame preserves the complete dialog.
