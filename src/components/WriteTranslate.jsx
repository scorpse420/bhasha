import { useState } from "react";

function WriteTranslate() {

  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const translate = () => {

    setOutput("hello"); // Clear previous output

    if (!input.trim()) {
      setOutput("test");
      return;
    }

    // Temporary UI-only translation.
    // We'll replace this later with the real translation logic.
    setOutput(`Translation preview: ${input}`);

  };

  return (
    <div className="translate-grid">

      {/* SOURCE */}

      <div className="translation-card">

        <div className="translation-header">

          <div>
            <span className="label">
              SOURCE
            </span>

            <h3>
              English
            </h3>
          </div>

          <button className="change-button">
            Change
          </button>

        </div>


        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type something..."
        />


        <div className="textarea-footer">

          <span>
            {input.length} characters
          </span>

          <button
            onClick={() => setInput("")}
          >
            Clear
          </button>

        </div>

      </div>


      {/* TARGET */}

      <div className="translation-card">

        <div className="translation-header">

          <div>
            <span className="label">
              TARGET
            </span>

            <h3>
              हिन्दी
            </h3>
          </div>

          <button className="change-button">
            Change
          </button>

        </div>


        <div className="translation-output">

          {output || (
            <span className="placeholder">
              Your translation will appear here...
            </span>
          )}

        </div>


        <button
          className="translate-button"
          onClick={translate}
        >
          Translate
        </button>

      </div>

    </div>
  );
}

export default WriteTranslate;
