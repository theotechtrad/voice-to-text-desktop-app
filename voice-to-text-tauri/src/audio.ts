/**
 * AudioCapture
 *
 * This is like a small Python class that:
 * - asks for microphone permission
 * - captures audio samples in small chunks
 * - calls a callback with each chunk
 *
 * For now, we just prove that recording works. Later we will send
 * these chunks to Deepgram over WebSocket.
 */

export type AudioChunkHandler = (chunk: Float32Array) => void;

export class AudioCapture {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private readonly onChunk: AudioChunkHandler;

  constructor(onChunk: AudioChunkHandler) {
    this.onChunk = onChunk;
  }

  get isActive(): boolean {
    return this.audioContext !== null;
  }

  async start(): Promise<void> {
    if (this.isActive) {
      return;
    }

    // 1) Ask for microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // 2) Create an AudioContext.
    // We would like 16kHz for Deepgram, but some browsers ignore this sampleRate.
    this.audioContext = new AudioContext({
      sampleRate: 16000,
    });

    // 3) Hook the MediaStream into the AudioContext
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // 4) Create a ScriptProcessorNode to get raw PCM data callbacks.
    // 4096 samples per buffer is a decent default; mono in/out.
    const bufferSize = 4096;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      const inputBuffer = event.inputBuffer;
      // We just take the first channel (mono).
      const channelData = inputBuffer.getChannelData(0);
      const chunk = new Float32Array(channelData.length);
      chunk.set(channelData);

      this.onChunk(chunk);
    };

    // 5) Connect nodes in the graph.
    this.sourceNode.connect(this.processorNode);
    // We don't need to output to speakers, but some environments require the
    // processor to be connected somewhere to run, so connect to destination.
    this.processorNode.connect(this.audioContext.destination);
  }

  stop(): void {
    // Disconnect audio graph
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }

    // Stop microphone tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    // Close AudioContext
    if (this.audioContext) {
      this.audioContext.close().catch((err) => {
        console.error("Error closing audio context", err);
      });
    }

    this.mediaStream = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.processorNode = null;
  }
}