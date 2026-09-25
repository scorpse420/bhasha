// ─────────────────────────────────────────────────────────────
// Single API client for the Flask backend (TTT + TTS + STT)
// Configure via REACT_APP_API_BASE in .env
// ─────────────────────────────────────────────────────────────

export const API_BASE = (import.meta.env.VITE_API_BASE || "https://battalion-denote-cyclist.ngrok-free.dev").replace(/\/+$/, "");
if (!API_BASE) {
  console.warn(
    "[api] REACT_APP_API_BASE is not set — requests will go to the current origin."
  );
}

// ngrok's free tier serves an HTML interstitial unless this header is present.
// Harmless for non-ngrok backends.
const BASE_HEADERS = {
  "ngrok-skip-browser-warning": "true",
};

// ── helpers ──────────────────────────────────────────────────

async function readError(res) {
  let msg = `HTTP ${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body?.error) msg = body.error;
  } catch {
    /* body wasn't JSON — leave the HTTP message */
  }
  return msg;
}

async function postJson(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...BASE_HEADERS },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

// ── TTT ──────────────────────────────────────────────────────

/**
 * Translate text.
 * @returns {Promise<{translation: string, input: string, src_lang: string, tgt_lang: string}>}
 */
export async function translateText(text, srcLang = "eng_Latn", tgtLang = "hin_Deva") {
  return postJson("/ttt", { text, src_lang: srcLang, tgt_lang: tgtLang });
}

// ── TTS ──────────────────────────────────────────────────────

/**
 * Synthesize speech. Returns a blob: URL ready for <audio src>.
 * Caller is responsible for URL.revokeObjectURL() when done.
 */
export async function synthesizeSpeech(text, { refWavPath = null, maxNewTokens } = {}) {
  const res = await fetch(`${API_BASE}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...BASE_HEADERS },
    body: JSON.stringify({
      text,
      ref_wav_path: refWavPath,
      ...(maxNewTokens != null && { max_new_tokens: maxNewTokens }),
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Convenience: synthesize + play. Returns a stop() function.
 * Revokes the blob URL when playback ends or stop() is called.
 */


export async function speakText(text, opts) {
  const url = await synthesizeSpeech(text, opts);
  const audio = new Audio(url);
  const cleanup = () => URL.revokeObjectURL(url);
  audio.addEventListener("ended", cleanup, { once: true });
  audio.addEventListener("error", cleanup, { once: true });
  await audio.play();
  return {
    stop: () => {
      audio.pause();
      cleanup();
    },
  };
}

// ── STT ──────────────────────────────────────────────────────

/**
 * Transcribe audio.
 * @param {Blob} audioBlob  — WAV recommended; see note below about WebM.
 * @param {{language?: string, task?: "transcribe"|"translate", audioPath?: string}} opts
 * @returns {Promise<{text: string, language: string|null, task: string, sample_rate_in: number}>}
 */
export async function transcribeAudio(audioBlob, { language = null, task = "transcribe" } = {}) {
  const fd = new FormData();
  fd.append("audio", audioBlob, "recording.wav");
  if (language) fd.append("language", language);
  fd.append("task", task);

  const res = await fetch(`${API_BASE}/stt`, {
    method: "POST",
    // Do NOT set Content-Type — the browser sets the multipart boundary.
    headers: { ...BASE_HEADERS },
    body: fd,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/**
 * Transcribe a file already on the Colab disk (JSON body, no upload).
 */
export async function transcribePath(audioPath, { language = null, task = "transcribe" } = {}) {
  return postJson("/stt", { audio_path: audioPath, language, task });
}

// ── misc ─────────────────────────────────────────────────────

export async function getServiceInfo() {
  const res = await fetch(`${API_BASE}/`, { headers: { ...BASE_HEADERS } });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}