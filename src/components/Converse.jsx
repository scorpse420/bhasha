import { useState } from "react";

function ConversationCard({
  language,
  nativeLanguage,
  message,
  translation,
}) {
  const [recording, setRecording] = useState(false);

  return (
    <div className="conversation-card">

      <div className="card-language">

        <div>
          <span className="label">
            LANGUAGE
          </span>

          <h3>
            {language}
          </h3>

          <p>
            {nativeLanguage}
          </p>
        </div>

        <button className="change-button">
          Change
        </button>

      </div>


      <div className="conversation-message">

        <p className="native-message">
          {message}
        </p>

        <p className="translated-message">
          {translation}
        </p>

      </div>


      <div className="waveform">

        {Array.from({ length: 35 }).map((_, index) => (

          <span
            key={index}
            style={{
              height: `${12 + ((index * 19) % 30)}px`,
            }}
          />

        ))}

      </div>


      <div className="mic-container">

        <button
          className={`mic-button ${
            recording ? "recording" : ""
          }`}
          onClick={() => setRecording(!recording)}
        >
          {recording ? "■" : "🎙"}
        </button>

        <p>
          {recording
            ? "Listening..."
            : "Tap to speak"}
        </p>

      </div>

    </div>
  );
}


function Converse() {
  return (
    <div className="conversation-grid">

      <ConversationCard
        language="Hindi"
        nativeLanguage="हिन्दी"
        message="नमस्ते! आप कैसे हैं?"
        translation="Hello! How are you?"
      />

      <ConversationCard
        language="Tamil"
        nativeLanguage="தமிழ்"
        message="வணக்கம்! நான் நன்றாக இருக்கிறேன்."
        translation="Hello! I am doing well."
      />

    </div>
  );
}

export default Converse;