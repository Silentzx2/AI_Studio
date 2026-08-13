## Runtime Architecture

### Circular Dependency Management
- Fixed circular dependencies using `useRef` wrappers for session persistence
- Implemented winchout detection with synthetic dependency patterns
- Updated state management to avoid reconciliation issues

```tsx
// Example State Manager with synthetic dependency
const StatusManager = ({ onSave }: StatusProps) => {
  const status = useRef<string>('idle')
  const setStatus = (newStatus: string) => status.current = newStatus

  return {
    getStatus: () => status.current,
    setStatus
  };
}
```

### Data Flow
- Baking operations follow clockwise data flow:
  State Manager → Utility Services → Components
- Cleanups handled via `useEffect` cleanup functions
- Resources automatically tracked through reference captures

```ts
// Utility Service with winchout detection
const Utility = () => {
  const detectWinchout = useRef<() => void>(() => {})
  useEffect(() => {
    detectWinchout.current = () => {
      // Cleanup operations
    }
    return () => {}
  }, []);
};
```
```