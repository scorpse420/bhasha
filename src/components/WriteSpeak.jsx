import { useState } from "react";

function WriteSpeak() {

  const [text, setText] = useState("");

  const speak = () => {

    if (!text.trim()) return;

    const utterance =
      new SpeechSynthesisUtterance(text);

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="speak-card">

      <div className="speak-content">

        <span className="label">
          SCRIPT
        </span>

        <h3>
          Write something to hear it spoken
        </h3>


        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter your text..."
        />


        <div className="speak-controls">

          <button className="voice-button">
            Voice: Default
          </button>

          <button
            className="speak-button"
            onClick={speak}
          >
            🔊 Speak
          </button>

        </div>

      </div>

    </div>
  );
}

export default WriteSpeak;