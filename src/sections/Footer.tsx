import { footerConfig } from '../config';

export default function Footer() {
  if (!footerConfig.copyrightText && !footerConfig.statusText) {
    return null;
  }

  return (
    <footer
      style={{
        background: '#ffffff',
        color: '#000000',
        borderTop: '1px solid #000',
        padding: '32px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '12px',
        fontWeight: 400,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
      >
      <span>{footerConfig.copyrightText}</span>
      <span>{footerConfig.statusText}</span>
    </footer>
  );
}
