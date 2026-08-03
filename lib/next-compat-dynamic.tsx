import React, { Suspense, lazy } from 'react';

export default function dynamic(loadFn: () => Promise<any>, options?: any) {
  const LazyComponent = lazy(loadFn);
  return function DynamicWrapper(props: any) {
    const fallback = options?.loading ? options.loading() : <div>Loading...</div>;
    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
