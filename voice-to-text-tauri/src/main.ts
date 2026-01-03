import { AudioCapture } from "./audio";
import { DeepgramClient } from "./deepgram";

type StatusKind = "idle" | "listening" | "error";

class UiController {
  private transcriptEl: HTMLElement;
  private statusEl: HTMLElement;
  private errorEl: HTMLElement;

  constructor() {
    const transcript = document.querySelector<HTMLElement>("#transcript");
    const status = document.querySelector<HTMLElement>("#status-text");
    const error = document.querySelector<HTMLElement>("#error-text");

    if (!transcript || !status || !error) {
      throw new Error("UI elements not found – check index.html IDs.");
    }

    this.transcriptEl = transcript;
    this.statusEl = status;
    this.errorEl = error;
  }

  setStatus(kind: StatusKind, message: string) {
    this.statusEl.textContent = message;
    this.statusEl.classList.remove("idle", "listening", "error");
    this.statusEl.classList.add(kind);
  }

  appendText(text: string) {
    if (!text) return;
    console.log("[UI] appending text:", text);
    const current = this.transcriptEl.textContent ?? "";
    const separator = current.endsWith("\n") || current.length === 0 ? "" : " ";
    this.transcriptEl.textContent = current + separator + text;
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
  }

  clearTranscript() {
    this.transcriptEl.textContent = "";
  }

  setError(message: string) {
    this.errorEl.textContent = message;
  }

  clearError() {
    this.errorEl.textContent = "";
  }

  getTranscript(): string {
    return this.transcriptEl.textContent ?? "";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const ui = new UiController();

  const apiKey = (import.meta as any).env.VITE_DEEPGRAM_API_KEY as string | undefined;
  if (!apiKey) {
    ui.setStatus("error", "Deepgram key not configured");
    ui.setError("Set VITE_DEEPGRAM_API_KEY in a .env file at the project root.");
    return;
  }

  const deepgram = new DeepgramClient(
    apiKey,
    (text) => {
      ui.appendText(text);
    },
    (message) => {
      ui.setError(message);
      ui.setStatus("error", "Deepgram error");
    }
  );

  // Audio capture: send every chunk straight to Deepgram.
  const audioCapture = new AudioCapture((chunk) => {
    deepgram.sendAudioChunk(chunk);
  });

  const pttButton = document.querySelector<HTMLButtonElement>("#ptt-button");
  const copyButton = document.querySelector<HTMLButtonElement>("#copy-button");
  const clearButton = document.querySelector<HTMLButtonElement>("#clear-button");

  if (!pttButton) {
    ui.setError("Push-to-talk button not found.");
    return;
  }

  ui.setStatus("idle", "Idle");

  let isHolding = false;

  async function startPushToTalk() {
    if (isHolding) return;
    isHolding = true;
    ui.clearError();

    ui.setStatus("listening", "Connecting to Deepgram and microphone...");

    try {
      await deepgram.connect();
    } catch (err) {
      console.error("Deepgram connection error", err);
      isHolding = false;
      ui.setError("Failed to connect to Deepgram. Check API key and internet.");
      ui.setStatus("error", "Deepgram connection error");
      return;
    }

    try {
      await audioCapture.start();
      ui.setStatus("listening", "Listening – streaming audio to Deepgram.");
    } catch (err) {
      console.error("Microphone error", err);
      isHolding = false;
      await deepgram.finalizeAndClose();
      ui.setError(
        "Failed to access microphone. Check permissions and that a recording device is available."
      );
      ui.setStatus("error", "Microphone error");
    }
  }

  function stopPushToTalk() {
    if (!isHolding) return;
    isHolding = false;
    audioCapture.stop();
    void deepgram.finalizeAndClose();
    ui.setStatus("idle", "Idle");
  }

  // Mouse interactions
  pttButton.addEventListener("mousedown", () => {
    void startPushToTalk();
  });
  pttButton.addEventListener("mouseup", stopPushToTalk);
  pttButton.addEventListener("mouseleave", () => {
    if (isHolding) {
      stopPushToTalk();
    }
  });

  // Keyboard accessibility: space / enter
  pttButton.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      void startPushToTalk();
    }
  });
  pttButton.addEventListener("keyup", (event) => {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      stopPushToTalk();
    }
  });

  // Copy transcript to clipboard
  copyButton?.addEventListener("click", async () => {
    ui.clearError();
    const text = ui.getTranscript();
    if (!text.trim()) {
      ui.setError("Nothing to copy – transcript is empty.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      ui.setStatus("idle", "Transcript copied to clipboard.");
    } catch (err) {
      ui.setError("Failed to copy to clipboard.");
      ui.setStatus("error", "Copy failed");
      console.error(err);
    }
  });

  // Clear transcript
  clearButton?.addEventListener("click", () => {
    ui.clearTranscript();
    ui.clearError();
    ui.setStatus("idle", "Transcript cleared.");
  });
});