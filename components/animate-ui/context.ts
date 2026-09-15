import * as React from 'react';

/**
 * Creates a React context with guaranteed existence checking.
 */
export function createStrictContext<T>(name: string) {
  const Context = React.createContext<T | undefined>(undefined);
  Context.displayName = name;

  function useStrictContext(): T {
    const context = React.useContext(Context);
    if (context === undefined) {
      throw new Error(`use${name} must be used within a ${name}Provider`);
    }
    return context;
  }

  return [Context.Provider, useStrictContext] as const;
}
