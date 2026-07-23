interface GradientBlobProps {
  className?: string;
}

export default function GradientBlob({ className = '' }: GradientBlobProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* Primary cyan blob */}
      <div
        className="absolute animate-blob-morph"
        style={{
          width: '40vw',
          height: '40vw',
          maxWidth: '600px',
          maxHeight: '600px',
          left: '-5%',
          top: '-10%',
          background: 'radial-gradient(circle, rgba(0,240,255,0.12) 0%, rgba(0,240,255,0) 70%)',
          filter: 'blur(60px)',
          animation: 'blob-morph 12s ease-in-out infinite, float-slow 8s ease-in-out infinite',
        }}
      />

      {/* Purple blob */}
      <div
        className="absolute animate-blob-morph"
        style={{
          width: '35vw',
          height: '35vw',
          maxWidth: '500px',
          maxHeight: '500px',
          right: '-8%',
          top: '15%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.10) 0%, rgba(168,85,247,0) 70%)',
          filter: 'blur(60px)',
          animation: 'blob-morph 15s ease-in-out infinite reverse, float-slow 10s ease-in-out infinite 2s',
        }}
      />

      {/* Magenta blob */}
      <div
        className="absolute animate-blob-morph"
        style={{
          width: '30vw',
          height: '30vw',
          maxWidth: '450px',
          maxHeight: '450px',
          left: '30%',
          bottom: '-5%',
          background: 'radial-gradient(circle, rgba(236,72,153,0.08) 0%, rgba(236,72,153,0) 70%)',
          filter: 'blur(60px)',
          animation: 'blob-morph 18s ease-in-out infinite 3s, float-slow 12s ease-in-out infinite 4s',
        }}
      />

      {/* Emerald accent blob */}
      <div
        className="absolute animate-blob-morph"
        style={{
          width: '25vw',
          height: '25vw',
          maxWidth: '380px',
          maxHeight: '380px',
          right: '20%',
          bottom: '10%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0) 70%)',
          filter: 'blur(60px)',
          animation: 'blob-morph 20s ease-in-out infinite 5s, float-slow 14s ease-in-out infinite 6s',
        }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
}
