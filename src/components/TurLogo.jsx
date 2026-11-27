import React from 'react';

export default function TurLogo({ size = 'md' }) {
  const imgSize =
    size === 'sm'
      ? 'h-6 sm:h-7'
      : size === 'lg'
      ? 'h-9 sm:h-11'
      : 'h-7 sm:h-9';

  return (
    <div className="bg-white px-2.5 py-1.5 rounded-xl shadow-md ring-1 ring-lime-400/40 shrink-0 inline-flex items-center">
      <img
        src="/tur-logo.jpg"
        alt="TUR Taiwan Ultra Runners"
        className={`${imgSize} w-auto object-contain select-none`}
      />
    </div>
  );
}
