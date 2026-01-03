# Voice to Text Desktop App (Tauri + Deepgram)

A Wispr Flow–style desktop prototype built with **Tauri** and **vanilla TypeScript**. The app provides a **push‑to‑talk** workflow for converting microphone input into live text using **Deepgram's streaming transcription API**.

The focus of this project is:

- Clean, maintainable code with clear separation of concerns.
- Reliable microphone capture and streaming.
- Correct, real‑time integration with Deepgram.
- Simple, understandable user workflow.

---

## Tech Stack

- **Tauri** (Rust shell) – cross‑platform desktop container.
- **Vite + TypeScript** – frontend tooling and type safety.
- **Vanilla DOM UI** – no heavy UI framework; small, explicit modules.
- **Deepgram Streaming API** – real‑time speech‑to‑text over WebSockets.

---

## Project Structure

Key files and folders:

- `index.html` – main HTML shell and layout.
- `src/styles.css` – layout and styling for the UI.
- `src/main.ts` – entrypoint, UI wiring, push‑to‑talk workflow.
- `src/audio.ts` – microphone capture and audio chunking.
- `src/deepgram.ts` – Deepgram WebSocket client (streaming transcription).
- `src-tauri/` – Tauri (Rust) configuration and bootstrap code.

### High‑Level Architecture

The app is split into three main concerns:

1. **UI Layer (`index.html`, `src/styles.css`, `src/main.ts`)**
   - Renders:
     - Header with app name and logo.
     - Transcript area with Copy / Clear actions.
     - Push‑to‑talk button and status indicator.
     - Debug / error section.
   - Manages user interactions and visual state via `UiController` in `main.ts`.

2. **Audio Capture (`src/audio.ts`)**
   - Wraps `navigator.mediaDevices.getUserMedia` + `AudioContext`.
   - Uses a `ScriptProcessorNode` to receive **Float32** PCM audio buffers.
   - Normalizes audio to mono and forwards each chunk to a callback.
   - Responsible only for microphone concerns (requesting permission, starting, stopping, and cleaning up streams).

3. **Transcription Integration (`src/deepgram.ts`)**
   - Manages a single **WebSocket** connection to Deepgram's streaming endpoint.
   - Configures parameters such as `encoding=linear16`, `sample_rate=16000`, `channels=1`, `language=en-US`, and `punctuate=true`.
   - Converts Float32 PCM chunks to signed 16‑bit PCM (`linear16`) before sending.
   - Parses `Results` messages from Deepgram and forwards non‑empty transcripts to the UI.
   - Handles connection lifecycle: connect, send audio, finalize, and close.

The **push‑to‑talk button** simply coordinates these pieces:

- **On press**: connect to Deepgram → start microphone capture.
- **While held**: stream mic chunks directly to Deepgram.
- **On release**: stop capture → send `Finalize` to Deepgram → close the socket.

This simple flow keeps responsibilities separate while staying easy to reason about.

---

## Setup & Running Locally

### Prerequisites

- **Node.js** (LTS recommended).
- **Rust toolchain** (via [`rustup`](https://www.rust-lang.org/tools/install)).
- A **Deepgram API key** (from the Deepgram dashboard).

Verify tools:

```bash
node -v
npm -v
rustc -V
cargo -V
```

### 1. Install Dependencies

From the project root (`voice-to-text-tauri`):

```bash
npm install
```

### 2. Configure Deepgram API Key

Create a `.env` file in the project root (this file is **git‑ignored** so your key is not committed):

```bash
VITE_DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY_HERE
```

> Do **not** wrap the key in quotes and do **not** add trailing spaces.

Restart the dev server after creating or changing `.env`.

### 3. Run in Development

```bash
npm run tauri dev
```

This compiles the frontend and launches a Tauri window. Any changes to `src/*.ts`, `index.html`, or `src/styles.css` hot‑reload automatically.

### 4. Build a Release Binary

```bash
npm run tauri build
```

Tauri will generate a platform‑specific installer / binary in `src-tauri/target/release` (exact path depends on OS and config).

---

## Using the App

1. Start the app (`npm run tauri dev` or use the built binary).
2. On first use, grant **microphone permission** when prompted.
3. Press and hold **"Hold to Talk"**:
   - Status changes to **"Listening – streaming audio to Deepgram."**
   - Your audio is captured and streamed in real time.
4. Speak naturally into the mic.
5. Release the button:
   - The app sends a `Finalize` message to Deepgram.
   - Final transcript text appears in the **Transcript** area.
6. Use **Copy** to copy the entire transcript to the clipboard.
7. Use **Clear** to clear the transcript and reset state.

---

## Manual Test Plan

These manual tests were used to verify core functionality:

### 1. First‑Run and Permissions

- Start the app with `npm run tauri dev`.
- Expectation: a Tauri window opens without console errors.
- Press and hold **Hold to Talk** for the first time.
- Expectation: OS/webview prompts for microphone permission; after granting, status changes from `Idle` to `Listening`.

### 2. Basic Transcription

- Hold **Hold to Talk**, say a clear sentence (e.g., "This is a voice to text test"), then release.
- Expectation:
  - Status shows **"Listening – streaming audio to Deepgram."** while held.
  - After release, a readable transcript appears in the **Transcript** area.

### 3. Multiple Interactions in One Session

- Perform several push‑to‑talk cycles without restarting the app.
- Expectation:
  - Each press connects and starts streaming without errors.
  - Transcript keeps appending phrases and the UI remains responsive.

### 4. Error Handling – Missing API Key

- Temporarily rename `.env` to something else (e.g. `.env.bak`).
- Restart dev server and reopen the Tauri window.
- Expectation:
  - Status shows **"Deepgram key not configured"**.
  - Debug section explains how to set `VITE_DEEPGRAM_API_KEY`.

### 5. Error Handling – Microphone Unavailable

- Disable or revoke mic permissions for the app (via OS settings) and try to record.
- Expectation:
  - Status switches to **"Microphone error"**.
  - Debug text explains that microphone access failed.

### 6. Clipboard & Clear Actions

- With some transcript text present:
  - Click **Copy**.
    - Expectation: status briefly shows **"Transcript copied to clipboard."** and the clipboard contains the transcript.
  - Click **Clear**.
    - Expectation: transcript area and error panel are emptied; status shows **"Transcript cleared."**

These tests demonstrate that the push‑to‑talk workflow, Deepgram integration, and basic error handling behave as expected.

---

## Known Limitations & Design Tradeoffs

- **Accuracy depends on Deepgram and environment**
  - Rare words, names, or sensitive terms may be misrecognized.
  - No custom language model or vocabulary is used in this prototype.

- **Streaming & Chunking**
  - Uses a `ScriptProcessorNode`, which is formally deprecated in favor of `AudioWorkletNode`, but is simpler and widely supported.
  - Audio is chunked in small buffers (~4096 samples); the model may occasionally repeat or rephrase as it refines interim results.

- **Single language / model**
  - Hard‑coded to `en-US`, with a single Deepgram model (e.g. `nova-3` if configured).
  - No runtime UI for changing language or model.

- **No automated tests**
  - Testing is currently manual via the scenarios above.
  - For a production app, unit tests for the Deepgram client and UI logic, plus integration tests, would be added.

- **Desktop‑only prototype**
  - Built and tested primarily on a single desktop OS; not yet hardened for all platforms.

---

## Possible Future Improvements

- Replace `ScriptProcessorNode` with `AudioWorkletNode` for lower‑latency and future‑proof audio processing.
- Add settings for language/model selection and basic audio level indicators.
- Introduce a small state store (or lightweight framework) as complexity grows.
- Add automated tests (unit + integration) and CI to run them on each commit.
- Persist transcripts to disk or export them as text files.

---

## GitHub Repository Guidance

To publish this project to GitHub:

1. Initialize a local repository (from the project root):

   ```bash
   git init
   git add .
   git commit -m "Initial voice-to-text Tauri + Deepgram prototype" \
     -m "Co-Authored-By: Warp <agent@warp.dev>"
   ```

2. Create an empty GitHub repository (via the GitHub UI) and copy its HTTPS URL.

3. Add the remote and push:

   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

Your repository will then contain the full codebase, this README, and the documented architecture and limitations.
