import React from 'react';

export default function Image({ src, alt, width, height, className, priority, ...props }: any) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      referrerPolicy="no-referrer"
      {...props}
    />
  );
}
