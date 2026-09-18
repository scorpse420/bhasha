import { useState } from "react";

function ListenRead() {

  const [text, setText] = useState("");

  return (
    <div className="listen-card">

      <div className="listen-grid">

        <div className="text-panel">

          <span className="label">
            YOU SAID
          </span>

          <h3>
            English
          </h3>

          <div className="text-output">

            {text || (
              <span className="placeholder">
                Your speech will appear here...
              </span>
            )}

          </div>

        </div>


        <div className="center-mic">

          <button
            className="large-mic"
            onClick={() =>
              setText(
                "Start speaking to see your transcript here."
              )
            }
          >
            🎙
          </button>

        </div>


        <div className="text-panel">

          <span className="label">
            TRANSCRIPT
          </span>

          <h3>
            English
          </h3>

          <div className="text-output">

            {text || (
              <span className="placeholder">
                Your transcript will appear here...
              </span>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}

export default ListenRead;