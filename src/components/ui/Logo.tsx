export default function Logo({ size = 'md', showText = true }: { size?: 'sm' | 'md' | 'lg'; showText?: boolean }) {
  const sizes = {
    sm: { icon: 28, text: 18, tagline: 10 },
    md: { icon: 36, text: 24, tagline: 12 },
    lg: { icon: 48, text: 32, tagline: 14 },
  };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2">
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="48" height="48" rx="12" fill="#006B55" />
        <path
          d="M24 12c-3.5 0-6.5 1.8-8 4.5-1.5-2.7-3.5-3.5-6-2.5-3.5 1.8-4 6.2-1.5 9L24 38l15.5-15c2.5-2.8 2-6.2-1.5-9-2.5-1-4.5-.2-6 2.5C30.5 13.8 27.5 12 24 12z"
          fill="white"
          opacity="0.95"
        />
        <path
          d="M14 24h5l3-6 3 9 3-6h5"
          stroke="#006B55"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showText && (
        <div className="flex flex-col">
          <span
            className="font-bold leading-tight"
            style={{ fontSize: s.text, color: '#006B55' }}
          >
            ZCare
          </span>
        </div>
      )}
    </div>
  );
}
