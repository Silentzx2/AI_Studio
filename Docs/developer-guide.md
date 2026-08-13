# Developer Guide

## Project Structure

### Architecture Overview
The project follows a layered architecture with clear separation:

1. **Frontend**: React with TypeScript, using Next.js 16.3
2. **State Management**: Custom hooks with `useRef`-based patterns
3. **Backend Integration**: API proxy at `/api/v1/*` with runtime BACKEND_URL
4. **Build**: Turbopack optimized, TypeScript strict mode enabled

### Component Guidelines

#### State Management
- **Anti-pattern**: Direct `setState` inside `useEffect` without guards
- **Pattern**: Use `useRef` for mutable values, guard state updates
- **Dependency arrays**: Always include all reactive values

```tsx
// Good pattern
useEffect(() => {
  if (ready && !initialized) {
    init();
    setInitialized(true);
  }
}, [ready, initialized]);

// Avoid
useEffect(() => {
  setState(value); // Potential cascading render
}, [value]);
```

#### Backend Integration
- All API calls go through `/api/v1/*` routes
- BACKEND_URL env var must be set for production
- Error handling: always check `response.ok` before `.json()`

### Build Commands
```bash
npm run build    # Production build
npm run dev      # Development with Turbopack
npm run lint     # Lint check
npm run typecheck # TypeScript verification
```

### Adding New Features
1. Create API route in `app/api/v1/*`
2. Add corresponding hook in `hooks/`
3. Implement component in `features/`
4. Update docs in `Docs/`
5. Run typecheck + lint