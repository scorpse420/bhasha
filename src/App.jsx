import { LANGUAGES } from "./data/languages";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import bhashaLogo from "./assets/bhasha-logo.png";
import backgroundImage from "./assets/bhasha-background.png";
import {
  translateText,
  speakText,
  transcribeAudio,
  getServiceInfo,
} from "./api";

const modes = [
  { id: "converse", label: "Converse", sub: "Speech-to-Speech", icon: "💬" },
  { id: "listen", label: "Listen & Read", sub: "Speech-to-Text", icon: "🎙" },
  { id: "write-translate", label: "Write & Translate", sub: "Text-to-Text", icon: "文" },
  { id: "write-speak", label: "Write & Speak", sub: "Text-to-Speech", icon: "🔊" },
];

const scenarios = {
  tourism: {
    p1Text: "I would like information about this heritage site.",
    p1Trans: "मुझे इस विरासत स्थल के बारे में जानकारी चाहिए।",
    p2Text: "मुझे इस विरासत स्थल के बारे में जानकारी चाहिए।",
    p2Trans: "I would like information about this heritage site.",
  },
  railway: {
    p1Text: "When is the next train to Mumbai?",
    p1Trans: "मुंबई जाने वाली अगली ट्रेन कब है?",
    p2Text: "मुंबई जाने वाली अगली ट्रेन कब है?",
    p2Trans: "When is the next train to Mumbai?",
  },
  market: {
    p1Text: "How much does this handmade item cost?",
    p1Trans: "इस हस्तनिर्मित वस्तु की कीमत कितनी है?",
    p2Text: "इस हस्तनिर्मित वस्तु की कीमत कितनी है?",
    p2Trans: "How much does this handmade item cost?",
  },
};

/* ─────────────────────────────────────────────────────────────
   Language-code bridges
   UI speaks FLORES-200 (hin_Deva). Whisper wants ISO-639-1 (hi).
   Browsers want BCP-47 (hi-IN).
   ───────────────────────────────────────────────────────────── */

const NLLB_TO_BCP47 = {
  asm_Beng: "as-IN",
  ben_Beng: "bn-IN",
  guj_Gujr: "gu-IN",
  hin_Deva: "hi-IN",
  kan_Knda: "kn-IN",
  mal_Mlym: "ml-IN",
  mar_Deva: "mr-IN",
  npi_Deva: "ne-NP",
  ory_Orya: "or-IN",
  pan_Guru: "pa-IN",
  san_Deva: "sa-IN",
  snd_Arab: "sd-IN",
  tam_Taml: "ta-IN",
  tel_Telu: "te-IN",
  urd_Arab: "ur-IN",
  eng_Latn: "en-IN",
};

const WHISPER_TO_NLLB = {
  as: "asm_Beng",
  bn: "ben_Beng",
  gu: "guj_Gujr",
  hi: "hin_Deva",
  kn: "kan_Knda",
  ml: "mal_Mlym",
  mr: "mar_Deva",
  ne: "npi_Deva",
  or: "ory_Orya",
  pa: "pan_Guru",
  sa: "san_Deva",
  sd: "snd_Arab",
  ta: "tam_Taml",
  te: "tel_Telu",
  ur: "urd_Arab",
  en: "eng_Latn",
};

const NLLB_TO_WHISPER = {
  asm_Beng: "as",
  ben_Beng: "bn",
  guj_Gujr: "gu",
  hin_Deva: "hi",
  kan_Knda: "kn",
  mal_Mlym: "ml",
  mar_Deva: "mr",
  npi_Deva: "ne",
  ory_Orya: "or",
  pan_Guru: "pa",
  san_Deva: "sa",
  snd_Arab: "sd",
  tam_Taml: "ta",
  tel_Telu: "te",
  urd_Arab: "ur",
  eng_Latn: "en",
};

function toNllb(whisperCode) {
  if (!whisperCode) return null;
  return WHISPER_TO_NLLB[String(whisperCode).toLowerCase().slice(0, 2)] || null;
}

/* FLORES-200 → ISO-639-1, what Whisper's `language` param expects.
   Returns null for anything unsupported, which makes /stt auto-detect. */
function toWhisper(nllbCode) {
  if (!nllbCode) return null;
  return NLLB_TO_WHISPER[nllbCode] || null;
}

function languageLabel(nllbCode) {
  if (!nllbCode) return null;
  const entry = LANGUAGES.find((l) => l.code === nllbCode);
  return entry ? `${entry.name} — ${entry.nativeName}` : nllbCode;
}

/* Browser-TTS fallback: pick a voice from the script if no code is known. */
function sniffBcp47(text) {
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  if (/[\u0980-\u09FF]/.test(text)) return "bn-IN";
  if (/[\u0A00-\u0A7F]/.test(text)) return "pa-IN";
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu-IN";
  if (/[\u0B00-\u0B7F]/.test(text)) return "or-IN";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te-IN";
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn-IN";
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml-IN";
  if (/[\u0600-\u06FF]/.test(text)) return "ur-IN";
  return "en-IN";
}

function browserSpeak(text, nllbCode) {
  if (!text || typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = NLLB_TO_BCP47[nllbCode] || sniffBcp47(text);
  window.speechSynthesis.speak(u);
}

/* ─────────────────────────────────────────────────────────────
   Recorder: mic → 16 kHz mono 16-bit WAV blob
   ───────────────────────────────────────────────────────────── */

const TARGET_SAMPLE_RATE = 16000;

function encodeWav(float32, sampleRate) {
  const ratio = sampleRate / TARGET_SAMPLE_RATE;
  const length = Math.max(1, Math.floor(float32.length / ratio));
  const samples = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, float32.length - 1);
    const frac = pos - i0;
    samples[i] = float32[i0] * (1 - frac) + float32[i1] * frac;
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

function useRecorder() {
  const [recording, setRecording] = useState(false);
  const liveRef = useRef(null);

  const start = useCallback(async () => {
    if (liveRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone unavailable — needs HTTPS or localhost");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });

    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const silence = ctx.createGain();
    silence.gain.value = 0;

    const chunks = [];
    processor.onaudioprocess = (e) => {
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    source.connect(processor);
    processor.connect(silence);
    silence.connect(ctx.destination);

    liveRef.current = { ctx, stream, source, processor, silence, chunks };
    setRecording(true);
  }, []);

  const stop = useCallback(async () => {
    const live = liveRef.current;
    liveRef.current = null;
    setRecording(false);
    if (!live) return null;

    try {
      live.processor.onaudioprocess = null;
      live.processor.disconnect();
      live.source.disconnect();
      live.silence.disconnect();
    } catch {
      /* already torn down */
    }

    live.stream.getTracks().forEach((t) => t.stop());
    const rate = live.ctx.sampleRate;
    try {
      await live.ctx.close();
    } catch {
      /* ignore */
    }

    const total = live.chunks.reduce((n, c) => n + c.length, 0);
    if (!total) return null;

    const merged = new Float32Array(total);
    let offset = 0;
    for (const c of live.chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    return encodeWav(merged, rate);
  }, []);

  useEffect(
    () => () => {
      const live = liveRef.current;
      if (!live) return;
      liveRef.current = null;
      try {
        live.processor.disconnect();
        live.source.disconnect();
        live.silence.disconnect();
      } catch {
        /* ignore */
      }
      live.stream.getTracks().forEach((t) => t.stop());
      live.ctx.close().catch(() => {});
    },
    []
  );

  return { recording, start, stop };
}

/* ─────────────────────────────────────────────────────────────
   Presentational pieces
   ───────────────────────────────────────────────────────────── */

function LanguageSelect({ value, onChange, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="appearance-none bg-white border border-lavender-200 hover:border-lavender-400 rounded-full py-1.5 pl-3.5 pr-8 text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-lavender-300 transition cursor-pointer"
      >
        {children}
      </select>

      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
        ▼
      </span>
    </div>
  );
}

function Waveform({ active }) {
  return (
    <div
      className={`flex items-center justify-center gap-1 h-8 transition-opacity ${
        active ? "opacity-100" : "opacity-30"
      }`}
    >
      <span className="wave-1 w-1 rounded-full bg-lavender-400" />
      <span className="wave-2 w-1 rounded-full bg-lavender-500" />
      <span className="wave-3 w-1 rounded-full bg-lavender-600" />
      <span className="wave-4 w-1 rounded-full bg-lavender-500" />
      <span className="wave-5 w-1 rounded-full bg-lavender-400" />
    </div>
  );
}

function Modal({ open, title, children, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl border border-lavender-200 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-lavender-100">
              <h2 className="font-bold text-slate-900">{title}</h2>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-5 text-sm text-slate-600 leading-relaxed">
              {children}
            </div>

            <div className="p-4 border-t border-lavender-100">
              <button
                onClick={onClose}
                className="w-full py-2 bg-lavender-600 hover:bg-lavender-700 text-white rounded-xl text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 20, x: "-50%" }}
          className="fixed bottom-6 left-1/2 z-[120] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-xl"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MicButton({ active, color = "lavender", onClick }) {
  const gradient =
    color === "peach"
      ? "from-peach-500 to-amber-500"
      : "from-lavender-600 to-lavender-500";

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`relative w-14 h-14 rounded-full bg-gradient-to-tr ${gradient} text-white flex items-center justify-center shadow-lg ${
        color === "peach" ? "shadow-peach-200" : "shadow-lavender-300/50"
      } ${active ? "mic-active-pulse" : ""}`}
    >
      <span className="text-xl">{active ? "■" : "🎙"}</span>
    </motion.button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Converse
   ───────────────────────────────────────────────────────────── */

function Converse({
  p1Lang,
  setP1Lang,
  p2Lang,
  setP2Lang,
  p1Active,
  p2Active,
  toggleMic,
  p1Text,
  p1Trans,
  p2Text,
  p2Trans,
  loadScenario,
  speak,
}) {
  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between pb-4 mb-4 border-b border-lavender-100 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-slate-700 tracking-wide uppercase">
            Bilingual Bi-Directional Dialogue
          </span>
        </div>

        <span className="flex items-center gap-1 bg-lavender-50 text-lavender-700 px-2.5 py-1 rounded-full border border-lavender-100 text-xs font-medium">
          ⚡ Pinned to selected languages
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 relative gap-0 bg-sand-50/40 rounded-2xl border border-lavender-100/80 overflow-hidden">
        <div className="hidden md:flex absolute inset-y-0 left-1/2 -ml-px w-0.5 bg-gradient-to-b from-lavender-100 via-lavender-300 to-lavender-100 z-10 items-center justify-center pointer-events-none">
          <div className="w-7 h-7 rounded-full bg-white border border-lavender-200 shadow-sm flex items-center justify-center text-lavender-500">
            ⇄
          </div>
        </div>

        <PersonPanel
          person="A"
          number="1"
          lang={p1Lang}
          setLang={setP1Lang}
          text={p1Text}
          translation={p1Trans}
          otherLang={p2Lang}
          active={p1Active}
          toggle={() => toggleMic("p1")}
          speak={speak}
          color="lavender"
        />

        <PersonPanel
          person="B"
          number="2"
          lang={p2Lang}
          setLang={setP2Lang}
          text={p2Text}
          translation={p2Trans}
          otherLang={p1Lang}
          active={p2Active}
          toggle={() => toggleMic("p2")}
          speak={speak}
          color="peach"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] text-slate-400">Try a scenario:</span>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => loadScenario("tourism")}
            className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-lavender-100 hover:text-lavender-800 transition text-xs"
          >
            Heritage Tourism
          </button>

          <button
            onClick={() => loadScenario("railway")}
            className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-lavender-100 hover:text-lavender-800 transition text-xs"
          >
            IRCTC Railway Enquiry
          </button>

          <button
            onClick={() => loadScenario("market")}
            className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-lavender-100 hover:text-lavender-800 transition text-xs"
          >
            Local Artisan Market
          </button>
        </div>
      </div>
    </section>
  );
}

function PersonPanel({
  person,
  number,
  lang,
  setLang,
  text,
  translation,
  otherLang,
  active,
  toggle,
  speak,
  color,
}) {
  return (
    <div
      className={`p-5 sm:p-7 flex flex-col justify-between min-h-[440px] ${
        person === "A" ? "border-b md:border-b-0 md:border-r" : ""
      } border-lavender-100 bg-white/60`}
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-lavender-100 text-lavender-700 flex items-center justify-center text-xs font-bold">
              {number}
            </div>

            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Person {person}
            </span>
          </div>

          <LanguageSelect value={lang} onChange={setLang}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} — {l.nativeName}
              </option>
            ))}
          </LanguageSelect>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-2">
              Live Transcript
            </p>

            <div className="min-h-[90px] rounded-2xl bg-white border border-lavender-100 p-4 text-sm text-slate-700 leading-relaxed">
              {text}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold tracking-widest uppercase text-lavender-500">
                Translation
              </p>

              <button
                onClick={() => speak(translation, otherLang)}
                className="text-lavender-600 hover:text-lavender-800 p-1 transition"
              >
                🔊
              </button>
            </div>

            <div className="min-h-[80px] rounded-2xl bg-lavender-50/60 border border-lavender-100 p-4 text-sm text-slate-700 leading-relaxed">
              {translation}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center pt-6">
        <Waveform active={active} />

        <MicButton active={active} color={color} onClick={toggle} />

        <span className="mt-3 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
          {active ? "Listening..." : "Tap to speak"}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Listen & Read — STT in the input language, TTT to output language
   ───────────────────────────────────────────────────────────── */

function Listen({ speak, setToast }) {
  const [active, setActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [translation, setTranslation] = useState("");
  const [inputLang, setInputLang] = useState("hin_Deva");
  const [outputLang, setOutputLang] = useState("eng_Latn");
  const [busy, setBusy] = useState(false);
  const recorder = useRecorder();

  const copy = async (text) => {
    if (!text) {
      setToast("Nothing to copy yet");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied to clipboard");
    } catch {
      setToast("Clipboard access unavailable");
    }
  };

  const toggle = async () => {
    if (busy) return;

    if (active) {
      setActive(false);
      setBusy(true);
      try {
        const blob = await recorder.stop();
        if (!blob) {
          setToast("No audio captured");
          return;
        }

        const sttLang = toWhisper(inputLang);
        setToast(
          sttLang
            ? `Transcribing in ${languageLabel(inputLang)}…`
            : `Transcribing in ${languageLabel(inputLang)}…`
        );

        const result = await transcribeAudio(blob, {
          task: "transcribe",
          language: sttLang,
        });
        const text = (result?.text || "").trim();

        if (!text) {
          setToast("No speech detected");
          return;
        }

        setTranscript(text);

        if (inputLang === outputLang) {
          setTranslation(text);
        } else {
          try {
            const { translation: out } = await translateText(
              text,
              inputLang,
              outputLang
            );
            setTranslation(out);
          } catch (e) {
            setToast(`Translation unavailable: ${e.message}`);
          }
        }
      } catch (e) {
        setToast(`Could not transcribe: ${e.message}`);
      } finally {
        setBusy(false);
      }
    } else {
      setTranscript("");
      setTranslation("");
      try {
        await recorder.start();
        setActive(true);
      } catch (e) {
        setToast(e.message || "Microphone unavailable");
      }
    }
  };

  const transcriptView =
    transcript || (active ? "Listening…" : "Tap the microphone to start speaking...");

  const translationView =
    translation || (active ? "Translating…" : "Your translated text will appear here.");

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <div className="grid md:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-lavender-100 bg-white p-5">
          <div className="flex items-center justify-between mb-3 gap-2">
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
              Live Transcript
            </p>

            <LanguageSelect
              value={inputLang}
              onChange={(e) => setInputLang(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} — {l.nativeName}
                </option>
              ))}
            </LanguageSelect>
          </div>

          <div className="min-h-[170px] text-sm leading-relaxed text-slate-700">
            {transcriptView}
          </div>

          <div className="flex justify-between items-center border-t border-lavender-100 pt-3">
            <Waveform active={active} />

            <button
              onClick={() => copy(transcript)}
              className="text-xs text-slate-500 hover:text-lavender-700 font-medium"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-lavender-100 bg-lavender-50/40 p-5">
          <div className="flex items-center justify-between mb-3 gap-2">
            <p className="text-[10px] uppercase tracking-widest font-bold text-lavender-500">
              Translation
            </p>

            <LanguageSelect
              value={outputLang}
              onChange={(e) => setOutputLang(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} — {l.nativeName}
                </option>
              ))}
            </LanguageSelect>
          </div>

          <div className="min-h-[170px] text-sm leading-relaxed text-slate-700">
            {translationView}
          </div>

          <div className="flex justify-end gap-3 border-t border-lavender-100 pt-3">
            <button
              onClick={() => speak(translation, outputLang)}
              className="text-xs text-lavender-700 font-medium"
            >
              🔊 Speak
            </button>

            <button
              onClick={() => copy(translation)}
              className="text-xs text-lavender-700 font-medium"
            >
              Copy
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-center mt-7">
        <MicButton active={active} onClick={toggle} />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Write & Translate
   ───────────────────────────────────────────────────────────── */

function WriteTranslate({ speak, setToast }) {
  const [source, setSource] = useState("");
  const [output, setOutput] = useState("");
  const [sourceLang, setSourceLang] = useState("eng_Latn");
  const [targetLang, setTargetLang] = useState("hin_Deva");
  const [loading, setLoading] = useState(false);

  const translate = async () => {
    if (!source.trim()) {
      setToast("Enter some text first");
      return;
    }
    if (loading) return;

    setLoading(true);
    try {
      const { translation } = await translateText(source, sourceLang, targetLang);
      setOutput(translation);
    } catch (e) {
      setToast(`Translation failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const swap = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSource(output || "");
    setOutput(source || "");
  };

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Text Translation
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Write naturally and translate instantly.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
        <div className="rounded-2xl border border-lavender-100 bg-white overflow-hidden">
          <div className="p-3 border-b border-lavender-100 flex justify-between">
            <LanguageSelect
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} — {l.nativeName}
                </option>
              ))}
            </LanguageSelect>

            <button
              onClick={() => setSource("")}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          </div>

          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Type something..."
            className="w-full min-h-[230px] resize-none p-5 outline-none text-sm text-slate-700 placeholder:text-slate-300"
          />

          <div className="p-3 border-t border-lavender-100 flex justify-between text-xs text-slate-400">
            <button
              onClick={async () => {
                try {
                  setSource(await navigator.clipboard.readText());
                } catch {
                  setToast("Clipboard access unavailable");
                }
              }}
              className="hover:text-lavender-700"
            >
              📋 Paste
            </button>

            <span>{source.length} characters</span>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <button
            onClick={swap}
            className="w-9 h-9 rounded-full bg-lavender-50 border border-lavender-200 hover:bg-lavender-100 text-lavender-700 flex items-center justify-center transition shadow-sm"
          >
            ⇄
          </button>
        </div>

        <div className="rounded-2xl border border-lavender-100 bg-lavender-50/50 overflow-hidden">
          <div className="p-3 border-b border-lavender-100">
            <LanguageSelect
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} — {l.nativeName}
                </option>
              ))}
            </LanguageSelect>
          </div>

          <div className="min-h-[230px] p-5 text-sm text-slate-700 leading-relaxed">
            {output || (
              <span className="text-slate-300">
                Translation will appear here...
              </span>
            )}
          </div>

          <div className="p-3 border-t border-lavender-100 flex justify-end gap-4 text-xs">
            <button
              onClick={() => speak(output, targetLang)}
              className="text-lavender-700 hover:text-lavender-900"
            >
              🔊 Listen
            </button>

            <button
              onClick={async () => {
                if (!output) {
                  setToast("Nothing to copy yet");
                  return;
                }
                try {
                  await navigator.clipboard.writeText(output);
                  setToast("Copied");
                } catch {
                  setToast("Clipboard access unavailable");
                }
              }}
              className="text-lavender-700 hover:text-lavender-900"
            >
              Copy
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-center mt-5">
        <button
          onClick={translate}
          className="px-5 py-2.5 bg-lavender-600 hover:bg-lavender-700 text-white rounded-full text-xs font-semibold shadow-md transition"
        >
          Translate
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Write & Speak
   ───────────────────────────────────────────────────────────── */

function WriteSpeak({ speak, setToast }) {
  const [text, setText] = useState("");
  const [lang, setLang] = useState("eng_Latn");
  const [busy, setBusy] = useState(false);

  const handleSpeak = async () => {
    if (!text.trim()) {
      setToast("Write something first");
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      await speak(text, lang);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl border border-lavender-100 bg-white overflow-hidden">
        <div className="p-4 border-b border-lavender-100 flex justify-between items-center">
          <LanguageSelect value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} — {l.nativeName}
              </option>
            ))}
          </LanguageSelect>

          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            Text-to-Speech
          </span>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write what you want Bhasha to speak..."
          className="w-full min-h-[260px] resize-none p-5 outline-none text-sm text-slate-700 placeholder:text-slate-300"
        />

        <div className="p-4 border-t border-lavender-100 flex gap-3">
          <button
            onClick={() => setText("")}
            className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold transition hover:bg-slate-50"
          >
            Clear
          </button>

          <button
            onClick={handleSpeak}
            className="flex-1 py-3 bg-lavender-600 hover:bg-lavender-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-2"
          >
            🔊 Speak
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   App
   ───────────────────────────────────────────────────────────── */

export default function App() {
  const [mode, setMode] = useState("converse");

  const [p1Lang, setP1Lang] = useState("eng_Latn");
  const [p2Lang, setP2Lang] = useState("hin_Deva");

  const [p1Active, setP1Active] = useState(false);
  const [p2Active, setP2Active] = useState(false);

  const [dialogue, setDialogue] = useState({
    p1Text: "Hello! What would you like to know about this place?",
    p1Trans: "नमस्ते! आप इस जगह के बारे में क्या जानना चाहते हैं?",
    p2Text: "नमस्ते! आप इस जगह के बारे में क्या जानना चाहते हैं?",
    p2Trans: "Hello! What would you like to know about this place?",
  });

  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");

  const recorder = useRecorder();
  const busyRef = useRef(false);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (mode === "converse") return;
    if (!recorder.recording) return;
    recorder.stop();
    setP1Active(false);
    setP2Active(false);
  }, [mode, recorder]);

  useEffect(
    () => () => {
      try {
        audioRef.current?.stop?.();
      } catch {
        /* ignore */
      }
      window.speechSynthesis?.cancel();
    },
    []
  );

  const speak = useCallback(async (text, nllbCode) => {
    if (!text) return;

    try {
      audioRef.current?.stop?.();
    } catch {
      /* ignore */
    }
    window.speechSynthesis?.cancel();

    try {
      const handle = await speakText(text);
      audioRef.current = handle;
    } catch (e) {
      console.warn("[tts] server TTS failed, falling back to browser voice:", e);
      browserSpeak(text, nllbCode);
    }
  }, []);

  /* ── One recorded utterance → pinned-language STT → TTT → TTS ── */
  const handleUtterance = useCallback(
    async (person, blob) => {
      const srcLang = person === "p1" ? p1Lang : p2Lang;
      const tgtLang = person === "p1" ? p2Lang : p1Lang;

      // Pin Whisper to the language the speaker selected. If the picker
      // holds a language Whisper doesn't know, toWhisper returns null and
      // /stt falls back to auto-detect for this utterance only.
      const sttLang = toWhisper(srcLang);

      try {
        setToast(
          sttLang
            ? `Transcribing in ${languageLabel(srcLang)}…`
            : `Transcribing (auto) — ${languageLabel(srcLang)} unsupported…`
        );

        const result = await transcribeAudio(blob, {
          task: "transcribe",
          language: sttLang,
        });
        const text = (result?.text || "").trim();

        if (!text) {
          setToast("No speech detected");
          return;
        }

        setDialogue((d) => ({ ...d, [`${person}Text`]: text }));

        // Translation source is the picker's language — the user told us
        // what they were speaking, so we trust that over a re-detect.
        const from = srcLang;

        if (from === tgtLang) {
          setDialogue((d) => ({ ...d, [`${person}Trans`]: text }));
          speak(text, tgtLang);
          return;
        }

        const { translation } = await translateText(text, from, tgtLang);
        setDialogue((d) => ({ ...d, [`${person}Trans`]: translation }));
        speak(translation, tgtLang);
      } catch (e) {
        setToast(`Voice input failed: ${e.message}`);
      }
    },
    [p1Lang, p2Lang, speak]
  );

  const toggleMic = useCallback(
    async (person) => {
      if (busyRef.current) return;

      const isActive = person === "p1" ? p1Active : p2Active;

      if (isActive) {
        setP1Active(false);
        setP2Active(false);
        busyRef.current = true;
        try {
          const blob = await recorder.stop();
          if (!blob) {
            setToast("No audio captured");
            return;
          }
          await handleUtterance(person, blob);
        } finally {
          busyRef.current = false;
        }
        return;
      }

      setP1Active(person === "p1");
      setP2Active(person === "p2");

      try {
        await recorder.start();
      } catch (e) {
        setP1Active(false);
        setP2Active(false);
        setToast(e.message || "Microphone unavailable");
      }
    },
    [p1Active, p2Active, recorder, handleUtterance]
  );

  const loadScenario = (type) => {
    setDialogue(scenarios[type]);
    setToast("Scenario loaded");
  };

  return (
    <div className="min-h-screen antialiased pb-12 relative bg-[#fcfbff]">
      <div
        className="absolute top-0 left-0 right-0 h-[760px] pointer-events-none z-0"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "100% 100%",
          backgroundPosition: "top center",
          backgroundRepeat: "no-repeat",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 72%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 72%, transparent 100%)",
        }}
      />

      <div
        className="absolute top-[560px] left-0 right-0 h-[220px] pointer-events-none z-0"
        style={{
          background: "linear-gradient(to bottom, transparent 0%, #fcfbff 90%)",
        }}
      />

      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-lavender-100 px-4 lg:px-10 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 2 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative w-10 h-10 rounded-2xl overflow-hidden bg-white border border-lavender-200 shadow-sm flex items-center justify-center"
            >
              <img
                src={bhashaLogo}
                alt="Bhasha"
                className="w-full h-full object-contain p-1"
              />
            </motion.div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-lavender-800 to-lavender-600 bg-clip-text text-transparent">
                  Bhasha
                </span>

                <span className="text-xs px-2 py-0.5 rounded-full bg-lavender-100 text-lavender-700 font-medium font-indic">
                  भाषा
                </span>
              </div>

              <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
                Serene Indic Voice & Script
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              onClick={() => setModal("about")}
              className="hover:text-lavender-700 transition-colors"
            >
              About
            </button>

            <button
              onClick={() => setModal("languages")}
              className="hover:text-lavender-700 transition-colors flex items-center gap-1.5"
            >
              Supported Languages
              <span className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded-full text-slate-500 font-bold">
                22
              </span>
            </button>

            <button
              onClick={() => setModal("help")}
              className="hover:text-lavender-700 transition-colors"
            >
              Help Center
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                try {
                  const info = await getServiceInfo();
                  setToast(info?.status ? `Engine: ${info.status}` : "Indic TTS Engine ready");
                } catch (e) {
                  setToast(`Engine unreachable: ${e.message}`);
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-sand-100 text-slate-700 border border-sand-200 hover:bg-sand-200 transition-all"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="hidden sm:inline">Indic TTS Engine</span>
              🔊
            </button>

            <button className="w-9 h-9 rounded-full bg-lavender-100 text-lavender-800 flex items-center justify-center font-semibold text-xs border border-lavender-200 hover:bg-lavender-200 transition-colors">
              भा
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lavender-50 border border-lavender-200/80 mb-3.5 shadow-sm">
            <span className="text-xs">🔔</span>

            <span className="text-xs font-semibold text-lavender-900 tracking-wide">
              Honoring the cadence of 22 Indian tongues
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
            Translate seamlessly across India's living languages
          </h1>

          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-xl mx-auto">
            A tranquil linguistic sanctuary. Speak, listen, write, and converse
            naturally with dialect-aware translation and authentic native script
            rendering.
          </p>
        </div>

        <div className="flex justify-center mb-6">
          <div className="inline-flex p-1.5 bg-white/90 backdrop-blur border border-lavender-200/80 rounded-2xl shadow-sm overflow-x-auto max-w-full gap-1">
            {modes.map((item) => {
              const active = mode === item.id;

              return (
                <motion.button
                  key={item.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setMode(item.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm transition-all duration-200 ${
                    active
                      ? "bg-lavender-600 text-white shadow-md shadow-lavender-300/40 font-semibold"
                      : "font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <span>{item.icon}</span>

                  <span className="whitespace-nowrap">
                    {item.label}{" "}
                    <span className="text-[10px] opacity-75 font-normal">
                      ({item.sub})
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="relative bg-white rounded-3xl border border-lavender-200/90 shadow-xl shadow-lavender-200/30 overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-lavender-400 via-peach-500 to-lavender-600 opacity-85" />

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {mode === "converse" && (
                <Converse
                  p1Lang={p1Lang}
                  setP1Lang={(e) => setP1Lang(e.target.value)}
                  p2Lang={p2Lang}
                  setP2Lang={(e) => setP2Lang(e.target.value)}
                  p1Active={p1Active}
                  p2Active={p2Active}
                  toggleMic={toggleMic}
                  {...dialogue}
                  loadScenario={loadScenario}
                  speak={speak}
                />
              )}

              {mode === "listen" && (
                <Listen speak={speak} toast={toast} setToast={setToast} />
              )}

              {mode === "write-translate" && (
                <WriteTranslate speak={speak} setToast={setToast} />
              )}

              {mode === "write-speak" && (
                <WriteSpeak speak={speak} setToast={setToast} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <Modal
        open={modal === "about"}
        title="About Bhasha"
        onClose={() => setModal(null)}
      >
        Bhasha is a multilingual Indian language interface designed around
        natural conversation, native scripts and speech-based interaction.
      </Modal>

      <Modal
        open={modal === "languages"}
        title="Supported Languages"
        onClose={() => setModal(null)}
      >
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((language) => (
            <div
              key={language.code}
              className="px-3 py-2 rounded-xl bg-lavender-50 border border-lavender-100 text-xs"
            >
              {language.name} — {language.nativeName}
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={modal === "help"}
        title="Help Center"
        onClose={() => setModal(null)}
      >
        Choose a mode above, select your languages and start speaking or
        writing. The microphone controls activate speech interaction while
        the speaker buttons use your browser's speech synthesis engine.
      </Modal>

      <Toast message={toast} />
    </div>
  );
}