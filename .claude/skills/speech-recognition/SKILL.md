---
name: speech-recognition
description: "On-device speech recognition in King Browser: Whisper tiny through transformers.js, microphone permission, audio resampling, language handling, model cache, and the claim that audio never leaves the device. Use when changing localSpeechRecognition.ts, voice input UI, microphone permissions or STT model settings."
---

# Speech recognition

## Facts (`src/services/localSpeechRecognition.ts`)
- `webkitSpeechRecognition` cannot work in Electron (needs Chrome's Google API key and would stream audio to Google); replaced by Whisper (`onnx-community/whisper-tiny`, about 41 MB q8 shards) via `transformers.pipeline('automatic-speech-recognition', ...)`.
- Audio is resampled to 16 kHz, capped at 120 s per clip.
- Model shards are cached by the main process (see `local-ai`). The first use downloads them from Hugging Face; after that recognition runs locally.
- Microphone permission flows through the session permission handlers and `src/hooks/usePermissionRequests.ts`; on macOS/Windows `open-system-settings` can open the OS microphone pane.
- Text-to-speech is separate: `src/services/tts.ts`.

## Claims discipline
"Audio never leaves the device" is true for the recognition step; the model download is a network request. Keep README wording consistent with that.

## Manual test (needs a microphone or a fake capture device, and internet for the first run)
1. Start the app, trigger voice input, allow the microphone.
2. Speak English, then Arabic, then German; check transcripts and that the language setting is passed.
3. Disconnect the network after the first run and confirm recognition still works.
4. Deny the permission and confirm a clear error, no silent hang.

## Verify
`npm test` for surrounding logic; the manual steps above for real audio. Report which steps you could not run.

## Done when
Recognition is local after the model is cached, errors are surfaced, and docs make no stronger claim than verified.
