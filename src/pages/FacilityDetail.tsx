import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { facilitiesConfig, navigationConfig } from '../config';

export default function FacilityDetail() {
  const { slug } = useParams<{ slug: string }>();

  const facility = useMemo(
    () => facilitiesConfig.items.find((item) => item.slug === slug) ?? null,
    [slug]
  );

  if (!facility) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#fff',
          color: '#000',
          fontFamily: "'IBM Plex Mono', monospace",
          padding: '40px',
        }}
      >
        <p>{facilitiesConfig.detailNotFoundText}</p>
        <Link to="/" style={{ color: '#000', textDecoration: 'underline' }}>
          {facilitiesConfig.detailReturnText}
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fff',
        color: '#000',
        fontFamily: "'IBM Plex Mono', monospace",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <nav
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '24px 40px',
          borderBottom: '1px solid #000',
        }}
      >
        <span
          style={{
            fontSize: '18px',
            fontWeight: 400,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {navigationConfig.brandName}
        </span>
        <Link
          to="/#facilities"
          style={{
            fontSize: '12px',
            fontWeight: 400,
            textTransform: 'uppercase',
            color: '#000',
            textDecoration: 'none',
            borderBottom: '1px solid #000',
            paddingBottom: '2px',
          }}
        >
          {facilitiesConfig.detailBackText}
        </Link>
      </nav>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
        }}
      >
        <div
          style={{
            flex: 1,
            padding: '60px 48px',
            borderRight: '1px solid #000',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <h1
            style={{
              fontSize: '28px',
              fontWeight: 400,
              lineHeight: '34px',
              textTransform: 'uppercase',
              margin: '0 0 40px 0',
            }}
          >
            {facility.article.title}
          </h1>
          <div style={{ maxWidth: '520px' }}>
            {facility.article.paragraphs.map((paragraph, index) => (
              <p
                key={`${facility.slug}-${index}`}
                style={{
                  fontSize: '13px',
                  fontWeight: 400,
                  lineHeight: '22px',
                  margin: '0 0 20px 0',
                }}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#000',
          }}
        >
          {facility.image ? (
            <img
              src={facility.image}
              alt={facility.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'grayscale(100%)',
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                textTransform: 'uppercase',
                color: '#fff',
              }}
            >
              No Image
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
