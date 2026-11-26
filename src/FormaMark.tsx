import type { SVGProps } from 'react';

/** Forma's mark turns the sample knot into a compact 3D/2D hybrid. */
export function FormaMark({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden={title ? undefined : true} {...props}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id="forma-mark-tube" x1="8" y1="8" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E3D7FF" />
          <stop offset=".42" stopColor="#B69AFF" />
          <stop offset=".72" stopColor="#805ED5" />
          <stop offset="1" stopColor="#C5ADFF" />
        </linearGradient>
        <linearGradient id="forma-mark-line" x1="9" y1="36" x2="39" y2="11" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D8C9FF" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="14" fill="url(#forma-mark-bg)" />
      <defs>
        <linearGradient id="forma-mark-bg" x1="5" y1="4" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8061D5" />
          <stop offset="1" stopColor="#5637A7" />
        </linearGradient>
      </defs>
      {/* Shadowed tube strokes give the tiny knot a dimensional, braided feel. */}
      <path d="M10 17.5C14.6 10 20.2 11.2 24 19.5C27.8 27.8 33.4 29 38 21.5" stroke="#39256D" strokeWidth="8" strokeLinecap="round" />
      <path d="M10 30.5C14.6 38 20.2 36.8 24 28.5C27.8 20.2 33.4 19 38 26.5" stroke="#39256D" strokeWidth="8" strokeLinecap="round" />
      <path d="M10 17.5C14.6 10 20.2 11.2 24 19.5C27.8 27.8 33.4 29 38 21.5" stroke="url(#forma-mark-tube)" strokeWidth="6" strokeLinecap="round" />
      <path d="M10 30.5C14.6 38 20.2 36.8 24 28.5C27.8 20.2 33.4 19 38 26.5" stroke="url(#forma-mark-tube)" strokeWidth="6" strokeLinecap="round" />
      <path d="M12 15.7C15.8 11.3 19.5 13.3 22.2 18.6M25.8 29.4C28.5 24.7 32.2 23 36 25.2" stroke="white" strokeOpacity=".58" strokeWidth="1.25" strokeLinecap="round" />
      {/* A precise 2D construction line and anchor nodes bridge the 3D mark to editing. */}
      <path d="M8.5 39.5H17.5L21 36" stroke="url(#forma-mark-line)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="39.5" r="1.5" fill="#FFF" />
      <circle cx="21" cy="36" r="1.5" fill="#D8C9FF" />
    </svg>
  );
}
