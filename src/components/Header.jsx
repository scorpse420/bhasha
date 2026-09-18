function Header() {
  return (
    <header className="header">

      <div className="header-inner">

        <div className="brand">

          <div className="brand-icon">
            भ
          </div>

          <div>
            <h1>Bhasha</h1>
            <p>India's multilingual companion</p>
          </div>

        </div>


        <nav className="nav">

          <button>About</button>
          <button>Languages</button>
          <button>Help</button>

        </nav>


        <div className="header-right">

          <div className="engine-status">

            <span className="status-dot"></span>

            <span>
              TTS Engine Ready
            </span>

          </div>

          <div className="profile">
            👤
          </div>

        </div>

      </div>

    </header>
  );
}

export default Header;