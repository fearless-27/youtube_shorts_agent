import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { observationConfig } from '../config';

gsap.registerPlugin(ScrollTrigger);

export default function Observation() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [coords, setCoords] = useState({
    lat: observationConfig.initialLat,
    lon: observationConfig.initialLon,
  });

  useEffect(() => {
    setCoords({
      lat: observationConfig.initialLat,
      lon: observationConfig.initialLon,
    });
  }, [observationConfig.initialLat, observationConfig.initialLon]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCoords((prev) => ({
        lat: parseFloat((prev.lat + (Math.random() - 0.5) * 0.02).toFixed(2)),
        lon: parseFloat((prev.lon + (Math.random() - 0.5) * 0.03).toFixed(2)),
      }));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!sectionRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        videoRef.current,
        { opacity: 0, scale: 0.95 },
        {
          opacity: 1,
          scale: 1,
          duration: 1.5,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 60%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  if (!observationConfig.sectionLabel && !observationConfig.videoPath) {
    return null;
  }

  return (
    <section
      ref={sectionRef}
      id="observation"
      style={{
        background: '#000',
        color: '#fff',
        padding: '120px 40px',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <h3
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '17.5px',
          fontWeight: 400,
          lineHeight: '20px',
          textTransform: 'uppercase',
          color: '#fff',
          margin: '0 0 48px 0',
          alignSelf: 'flex-start',
        }}
      >
        {observationConfig.sectionLabel}
      </h3>

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '1200px',
        }}
      >
        {observationConfig.videoPath && (
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              aspectRatio: '16/9',
              objectFit: 'cover',
              opacity: 0,
            }}
          >
            <source src={observationConfig.videoPath} type="video/mp4" />
          </video>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            fontWeight: 400,
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            background: 'rgba(0,0,0,0.5)',
            padding: '6px 10px',
          }}
        >
          {observationConfig.latLabel} {coords.lat.toFixed(2)}, {observationConfig.lonLabel} {coords.lon.toFixed(2)}
        </div>

        {observationConfig.statusText && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '12px',
              fontWeight: 400,
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#fff',
                display: 'inline-block',
                animation: 'pulse 2s ease-in-out infinite',
              }}
            />
            {observationConfig.statusText}
          </div>
        )}
      </div>
    </section>
  );
}
