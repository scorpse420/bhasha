const languages = [
  "हिन्दी",
  "मराठी",
  "বাংলা",
  "தமிழ்",
  "తెలుగు",
  "ગુજરાતી",
  "ಕನ್ನಡ",
  "ਪੰਜਾਬੀ",
  "മലയാളം",
  "ଓଡ଼ିଆ",
];

function LanguagePalette() {

  return (
    <section className="language-section">

      <div className="language-card">

        <p>
          Explore India's languages
        </p>

        <div className="language-list">

          {languages.map((language) => (

            <span key={language}>
              {language}
            </span>

          ))}

        </div>

      </div>

    </section>
  );
}

export default LanguagePalette;