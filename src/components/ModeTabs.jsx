const modes = [
  {
    id: "converse",
    icon: "◉",
    title: "Converse",
    subtitle: "Speech-to-Speech",
  },
  {
    id: "listen",
    icon: "◌",
    title: "Listen & Read",
    subtitle: "Speech-to-Text",
  },
  {
    id: "translate",
    icon: "文",
    title: "Write & Translate",
    subtitle: "Text-to-Text",
  },
  {
    id: "speak",
    icon: "♪",
    title: "Write & Speak",
    subtitle: "Text-to-Speech",
  },
];

function ModeTabs({ activeMode, setActiveMode }) {
  return (
    <section className="mode-section">

      <div className="mode-tabs">

        {modes.map((mode) => (

          <button
            key={mode.id}
            className={`mode-tab ${
              activeMode === mode.id ? "active" : ""
            }`}
            onClick={() => setActiveMode(mode.id)}
          >

            <span className="mode-icon">
              {mode.icon}
            </span>

            <span className="mode-text">

              <strong>
                {mode.title}
              </strong>

              <small>
                {mode.subtitle}
              </small>

            </span>

          </button>

        ))}

      </div>

    </section>
  );
}

export default ModeTabs;