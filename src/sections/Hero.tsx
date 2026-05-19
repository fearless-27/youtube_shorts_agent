import AsciiCanvas from '../components/AsciiCanvas';
import { heroConfig, navigationConfig } from '../config';

export default function Hero() {
  const notes = heroConfig.supportingNotes.slice(0, 3);
  const hasHeroContent =
    navigationConfig.brandName ||
    navigationConfig.links.length > 0 ||
    heroConfig.eyebrow ||
    heroConfig.titleLines.length > 0 ||
    heroConfig.leadText ||
    notes.length > 0;

  if (!hasHeroContent) {
    return null;
  }

  return (
    <section
      id="hero"
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '40%',
          minWidth: '320px',
          background: '#000',
          overflow: 'hidden',
        }}
      >
        {/* Navigation */}
        <nav
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '40%',
            minWidth: '320px',
            zIndex: 50,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px 40px',
            background: 'transparent',
            fontFamily: "'IBM Plex Mono', monospace",
            boxSizing: 'border-box',
          }}
        >
          <span
            style={{
              fontSize: '18px',
              fontWeight: 400,
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {navigationConfig.brandName}
          </span>
          <div style={{ display: 'flex', gap: '32px' }}>
            {navigationConfig.links.map((item, index) => (
              <div key={`${item.label}-${item.href}`} style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                <a
                  href={item.href}
                  style={{
                    fontSize: '12px',
                    fontWeight: 400,
                    color: '#fff',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    letterSpacing: '0.08em',
                    borderBottom: '1px solid transparent',
                    transition: 'border-color 0.2s',
                    paddingBottom: '2px',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.borderBottomColor = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.borderBottomColor = 'transparent';
                  }}
                >
                  {item.label}
                </a>
                {index < navigationConfig.links.length - 1 && (
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>·</span>
                )}
              </div>
            ))}
          </div>
        </nav>

        {/* Hero Title */}
        <div
          style={{
            position: 'absolute',
            left: '40px',
            right: '24px',
            top: '22vh',
            zIndex: 10,
            width: 'calc(100% - 64px)',
            maxWidth: 'none',
          }}
        >
          <p
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '11px',
              fontWeight: 400,
              lineHeight: 1.6,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.42)',
              margin: '0 0 22px 0',
            }}
          >
            {heroConfig.eyebrow}
          </p>
          <h1
            style={{
              fontFamily: "'Geist Pixel', monospace",
              fontSize: 'clamp(44px, 5.6vw, 82px)',
              fontWeight: 400,
              lineHeight: 0.96,
              color: '#fff',
              textTransform: 'uppercase',
              margin: 0,
              textWrap: 'balance',
              letterSpacing: '0.015em',
            }}
          >
            {heroConfig.titleLines.map((line, index) => (
              <span key={`${line}-${index}`}>
                {line}
                {index < heroConfig.titleLines.length - 1 && <br />}
              </span>
            ))}
          </h1>

          <div
            style={{
              position: 'relative',
              marginTop: '54px',
              width: '100%',
              height: '430px',
            }}
          >
            {[
              {
                text: heroConfig.leadText,
                left: '0px',
                top: '0px',
                transform: 'none',
              },
              {
                text: notes[0] ?? '',
                left: 'auto',
                right: '40px',
                top: '96px',
                transform: 'none',
              },
              {
                text: notes[1] ?? '',
                left: '46%',
                top: '208px',
                transform: 'translateX(-50%)',
              },
              {
                text: notes[2] ?? '',
                left: '68%',
                top: '320px',
                transform: 'translateX(-50%)',
              },
            ].filter((item) => item.text).map((item) => (
              <p
                key={item.text}
                style={{
                  position: 'absolute',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '12px',
                  fontWeight: 400,
                  lineHeight: 1.95,
                  color: 'rgba(255,255,255,0.56)',
                  margin: 0,
                  width: '34ch',
                  left: item.left,
                  right: item.right,
                  top: item.top,
                  transform: item.transform,
                }}
              >
                {item.text}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          width: '60%',
          background: '#000',
          overflow: 'hidden',
        }}
      >
        <AsciiCanvas />
      </div>
    </section>
  );
}
