/**
 * DeepgramClient
 *
 * Handles the WebSocket connection from the app to Deepgram.
 * - connect(): open WebSocket
 * - sendAudioChunk(): send 16‑bit PCM audio
 * - finalizeAndClose(): flush and close stream
 */

export type TranscriptHandler = (text: string) => void;
export type DeepgramErrorHandler = (message: string) => void;

function float32ToLinear16(chunk: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(chunk.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < chunk.length; i++) {
    let s = chunk[i];
    // clamp between -1 and 1
    s = Math.max(-1, Math.min(1, s));
    // scale to 16-bit signed int
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, int16, true); // little-endian
  }

  return buffer;
}

export class DeepgramClient {
  private apiKey: string;
  private socket: WebSocket | null = null;
  private onTranscript: TranscriptHandler;
  private onError: DeepgramErrorHandler;

  constructor(apiKey: string, onTranscript: TranscriptHandler, onError: DeepgramErrorHandler) {
    this.apiKey = apiKey;
    this.onTranscript = onTranscript;
    this.onError = onError;
  }

  get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    // Basic configuration: 16kHz mono, linear16 PCM, English with punctuation and interim results.
    const url = new URL("wss://api.deepgram.com/v1/listen");
    url.searchParams.set("encoding", "linear16");
    url.searchParams.set("sample_rate", "16000");
    url.searchParams.set("channels", "1");
    url.searchParams.set("language", "en-US");
    url.searchParams.set("punctuate", "true");
    url.searchParams.set("interim_results", "true");

    return new Promise((resolve, reject) => {
      console.log("[Deepgram] Connecting to:", url.toString());
      const ws = new WebSocket(url.toString(), ["token", this.apiKey]);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        console.log("[Deepgram] WebSocket open");
        this.socket = ws;
        resolve();
      };

      ws.onerror = (event) => {
        console.error("[Deepgram] WebSocket error", event);
        this.onError("Deepgram WebSocket error.");
        reject(new Error("Deepgram WebSocket error: " + JSON.stringify(event)));
      };

      ws.onclose = (event) => {
        console.log("[Deepgram] WebSocket closed", event.code, event.reason);
        this.socket = null;
      };

      ws.onmessage = (event) => {
        try {
          const raw = event.data as string;
          const data = JSON.parse(raw);

          // Helpful for debugging while developing.
          console.log("[Deepgram] message:", data);

          // Deepgram may send different message types: Results, Metadata, etc.
          const type: string = (data.type || "").toString();
          if (type.toLowerCase() === "results") {
            const alt = data.channel?.alternatives?.[0];
            const transcript: string | undefined = alt?.transcript;

            console.log("[Deepgram] alt:", alt);
            console.log("[Deepgram] transcript field:", transcript);

            // For this prototype, treat any non-empty transcript as something
            // we want to show, whether it's interim or final.
            if (transcript && transcript.trim().length > 0) {
              this.onTranscript(transcript);
            }
          }
        } catch (err) {
          console.error("Failed to parse Deepgram message", err);
        }
      };
    });
  }

  sendAudioChunk(chunk: Float32Array): void {
    if (!this.isConnected || !this.socket) return;

    const buffer = float32ToLinear16(chunk);
    this.socket.send(buffer);
  }

  async finalizeAndClose(): Promise<void> {
    if (!this.socket) return;

    try {
      // Ask Deepgram to flush remaining audio and send final transcript.
      this.socket.send(JSON.stringify({ type: "Finalize" }));
    } catch (err) {
      console.error("Error sending Finalize message", err);
    }

    this.socket.close();
    this.socket = null;
  }
}