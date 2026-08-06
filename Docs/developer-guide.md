# AI 3D Studio - Developer Guide

> **Version**: 3.2.0 (uv-Only Package Management)  
> **Target Audience**: Developers contributing to AI 3D Studio

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Environment Setup](#development-environment-setup)
3. [Code Structure Overview](#code-structure-overview)
4. [Coding Standards](#coding-standards)
5. [Adding a New AI Provider](#adding-a-new-ai-provider)
6. [Adding API Endpoints](#adding-api-endpoints)
7. [Adding Frontend Components](#adding-frontend-components)
8. [Database Migrations](#database-migrations)
9. [Testing Guidelines](#testing-guidelines)
10. [Debugging Tips](#debugging-tips)
11. [Common Patterns](#common-patterns)
12. [Contributing Guidelines](#contributing-guidelines)

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.12+
- Git
- uv (hard dependency for Python env management)
- Code editor (VS Code recommended)

### VS Code Extensions (Recommended)

| Extension | Purpose |
|-----------|---------|
| **ESLint** | JavaScript/TypeScript linting |
| **Prettier** | Code formatting |
| **Python** | IntelliSense, debugging |
| **Tailwind CSS IntelliSense** | Class autocomplete |
| **PostgreSQL** | Database exploration |
| **Thunder Client** | API testing |

### Clone and Install

```bash
# Clone repository
git clone https://github.com/your-org/ai-3d-studio.git
cd ai-3d-studio

# Frontend dependencies
npm install

# Backend dependencies (uv is a hard dependency)
cd backend
uv venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
cd ..

# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env
```

---

## Development Environment Setup

### Start All Services

```bash
# Using setup scripts (recommended)
./scripts/setup.sh
./scripts/start.sh

# Or start individually for development:

# Terminal 1: Backend with hot reload
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Celery worker
cd backend
source .venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=info -Q generation images downloads

# Terminal 3: Frontend dev server
npm run dev
```

### Verify Setup

```bash
# Backend health check
curl http://localhost:8000/api/v1/health

# Frontend accessible at
open http://localhost:3000

# API docs
open http://localhost:8000/docs
```

---

## Code Structure Overview

### Frontend (`app/` and `features/`)

```
app/                              # Next.js App Router pages
├── layout.tsx                    # Root layout
├── page.tsx                      # Landing/workspace page
├── workspace/page.tsx            # Main generation workspace
├── generate/page.tsx             # Quick generate page
├── render/page.tsx               # Render view
├── texture/page.tsx              # Texture tools
├── settings/page.tsx             # Unified settings (imports admin tabs)
├── admin/page.tsx                # DEPRECATED — redirects to /settings?section=monitoring
└── api/v1/[...path]/route.ts     # Backend API proxy

features/                         # Feature modules (ROOT level, NOT under app/)
├── landing/                      # Marketing pages
├── workspace/                    # Main workspace UI
│   └── viewer/                   # Three.js 3D viewer
├── admin/tabs/                   # Admin dashboard tabs (12 tabs)
├── model-manager/                # Model management
│   ├── tabs/                     # Model tabs
│   └── components/               # Model components
├── settings/sections/            # Settings sections
├── render/                       # Render shell
├── texture/                      # Texture shell
└── workspace/                    # Workspace feature

components/                       # Reusable components
├── ui/                           # shadcn/ui base components
├── premium/                      # Styled premium components
└── motion/                       # Animation wrappers

stores/                           # Zustand state stores
├── useGenerationStore.ts
├── useProjectStore.ts
├── useThemeStore.ts
└── useUIStore.ts

services/                         # API client functions
├── apiClient.ts                  # Core HTTP client
├── generationService.ts          # Generation API
├── runtimeService.ts             # Runtime status/options
├── uploadService.ts              # File uploads
└── adminService.ts               # Admin/health/logs
```

### Backend (`backend/app/`)

```
backend/app/
├── main.py               # FastAPI application entry
├── config.py             # Pydantic settings
├── database.py           # SQLAlchemy async setup
│
├── api/v1/               # API route handlers
│   ├── __init__.py      # Router aggregation (16 routers)
│   ├── admin_router.py  # /admin
│   ├── generation_router.py # /generation
│   ├── jobs_router.py   # /jobs
│   ├── health_router.py # /health
│   ├── runtime_router.py # /runtime
│   ├── upload_router.py # /upload
│   ├── hf_token_router.py # /hf-token
│   ├── models_api.py    # /models (no prefix)
│   ├── discover_router.py # /discover
│   ├── download_router.py # /download
│   ├── pipelines_router.py # /pipelines
│   ├── plugin_manager_router.py # /plugin-manager
│   ├── system_router.py # /system
│   ├── settings_router.py # /settings
│   └── rigging_router.py # /rigging
│
├── core/                 # Business logic
│   ├── providers/        # AI model providers
│   ├── managers/         # Business managers
│   ├── downloader/       # Download utilities (mirror_fallback, checksum_validator)
│   ├── installer/        # Plugin installer (per-model venvs)
│   └── registry/         # Model registry
│
├── workers/              # Celery tasks
│   ├── celery_app.py     # Celery config
│   ├── tasks.py          # 3D generation
│   ├── download_workers.py # Download tasks
│   ├── installation_workers.py # Install tasks
│   ├── health_workers.py # Health tasks
│   └── vram_health_worker.py
│
├── models/               # SQLAlchemy models
│   ├── job.py            # Generation job
│   └── registry.py       # Model registry
│
├── schemas/              # Pydantic schemas
│   ├── generation.py
│   └── manifest.py
│
└── runtime/              # Runtime utilities
    ├── engine.py
    ├── gpu.py
    ├── health.py
    ├── installer.py      # resolve_install_targets(), full_install()
    ├── storage.py        # StorageConfig with per-model paths
    └── platform_detection.py
```

---

## Coding Standards

### TypeScript / React

```typescript
// Use "use client" directive for client components
"use client";

// Import order: react → internal → external
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

// Component naming: PascalCase
export function MyComponent({ 
  prop1, 
  prop2 = 'default' 
}: MyComponentProps) {
  // Hooks first, then effects, then derived state
  const [state, setState] = useState<string>('');
  
  useEffect(() => {
    // Effect logic
  }, [dependency]);
  
  // Event handlers
  const handleClick = () => {
    setState('new value');
  };
  
  // Render
  return (
    <Card className="p-4">
      <Button onClick={handleClick}>
        <Zap className="w-4 h-4 mr-2" />
        Click me
      </Button>
    </Card>
  );
}
```

### Python / FastAPI

```python
"""Module docstring explaining purpose."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/resource", tags=["resource"])


class ResourceRequest(BaseModel):
    """Request schema with validation."""
    name: str
    value: int = 0
    optional_field: Optional[str] = None


@router.get("/")
async def list_resources(
    db: Session = Depends(get_db),
    limit: int = 50,
) -> dict:
    """List resources with pagination.
    
    Args:
        db: Database session dependency
        limit: Maximum results to return
        
    Returns:
        Dict with success status and data list
    """
    try:
        query = db.query(Resource).limit(limit)
        results = [r.to_dict() for r in query.all()]
        
        return {"success": True, "data": results}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", status_code=201)
async def create_resource(
    request: ResourceRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Create a new resource."""
    resource = Resource(**request.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    
    return {
        "success": True,
        "data": resource.to_dict(),
        "message": "Resource created successfully"
    }
```

### File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React Components | `PascalCase.tsx` | `ModelDetailsModal.tsx` |
| Utilities | `camelCase.ts` | `apiClient.ts` |
| Python Modules | `snake_case.py` | `download_manager.py` |
| Python Classes | `PascalCase` | `DownloadManager` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_UPLOAD_SIZE` |
| Types/Interfaces | `PascalCase.ts` | `GenerationJob.ts` |

---

## Adding a New AI Provider

### Step 1: Create Provider File

```python
# backend/app/core/providers/my_provider.py

from .base import BaseProvider, ProviderResult
from ..managers.health_manager import HealthManager


class MyProvider(BaseProvider):
    """Custom AI provider implementation."""
    
    name = "my_provider"
    vram_required_mb = 8000  # Adjust based on requirements
    
    def __init__(self, config: dict = None):
        super().__init__(config)
        self.model = None
    
    async def initialize(self) -> bool:
        """Load model into memory."""
        try:
            # Your initialization code here
            import torch
            self.model = torch.load("path/to/model")
            return True
        except Exception as e:
            self.logger.error(f"Initialization failed: {e}")
            return False
    
    async def generate(
        self,
        prompt: str,
        **kwargs
    ) -> ProviderResult:
        """Run inference."""
        
        # Prepare inputs
        inputs = self._prepare_inputs(prompt, kwargs)
        
        # Run inference
        output = self.model(inputs)
        
        # Post-process output
        result_data = self._post_process(output)
        
        return ProviderResult(
            success=True,
            data=result_data,
            output_files=result_data.get("files", []),
            metadata={
                "provider": self.name,
                "inference_time_ms": result_data.get("time_ms"),
            }
        )
    
    def _prepare_inputs(self, prompt: str, kwargs: dict) -> any:
        """Prepare model inputs from prompt."""
        # Implementation specific
        pass
    
    def _post_process(self, output: any) -> dict:
        """Process raw model output."""
        # Implementation specific
        pass
    
    async def unload(self) -> None:
        """Free GPU memory."""
        if self.model:
            del self.model
            self.model = None
            
            import torch
            torch.cuda.empty_cache()
    
    async def health_check(self) -> dict:
        """Check provider health."""
        return {
            "name": self.name,
            "loaded": self.model is not None,
            "vram_usage_mb": self._get_vram_usage(),
        }
```

### Step 2: Register in Registry

```python
# backend/app/core/providers/registry.py

# Add to PROVIDER_REGISTRY dict
PROVIDER_REGISTRY = {
    # ... existing providers ...
    "my_provider": {
        "class": "MyProvider",
        "module": "app.core.providers.my_provider",
        "default_config": {}
    }
}

# Add to get_provider function
def get_provider(name: str, config: dict = None) -> BaseProvider:
    """Get provider instance by name."""
    if name == "my_provider":
        from .my_provider import MyProvider
        return MyProvider(config)
    # ... rest of function
```

### Step 3: Update Runtime Engine

```python
# backend/runtime/engine.py

# Add VRAM requirement
MODEL_VRAM_REQUIREMENTS = {
    # ... existing ...
    "my_provider": 8000,
}

# Add to priority list
PROVIDER_PRIORITY = [
    # ... existing ...
    "my_provider",
]
```

### Step 4: Update Configuration

```env
# .env
AI_PROVIDER=my_provider  # Or add to options
```

---

## Adding API Endpoints

### Step 1: Create Route File

```python
# backend/app/api/v1/my_feature.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db

router = APIRouter(prefix="/api/v1/my-feature", tags=["my-feature"])


# Request/Response schemas
class ItemCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ItemResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]


# Endpoints
@router.get("/", response_model=dict)
async def list_items(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """List all items with optional search."""
    query = db.query(Item)
    
    if search:
        query = query.filter(Item.name.ilike(f"%{search}%"))
    
    items = query.limit(limit).all()
    
    return {
        "success": True,
        "data": [item.to_dict() for item in items],
        "count": len(items)
    }


@router.post("/", response_model=dict, status_code=201)
async def create_item(
    request: ItemCreate,
    db: Session = Depends(get_db),
):
    """Create a new item."""
    item = Item(**request.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    
    return {
        "success": True,
        "data": item.to_dict(),
        "message": "Item created successfully"
    }


@router.get("/{item_id}", response_model=dict)
async def get_item(
    item_id: int,
    db: Session = Depends(get_db),
):
    """Get item by ID."""
    item = db.query(Item).filter(Item.id == item_id).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return {"success": True, "data": item.to_dict()}


@router.delete("/{item_id}", response_model=dict)
async def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
):
    """Delete an item."""
    item = db.query(Item).filter(Item.id == item_id).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    db.delete(item)
    db.commit()
    
    return {"success": True, "message": "Item deleted"}
```

### Step 2: Register Router

```python
# backend/app/api/v1/__init__.py

from .my_feature import router as my_feature_router

# Add to main router
router.include_router(my_feature_router)
```

### Step 3: Test Endpoint

```bash
# Test with curl
curl http://localhost:8000/api/v1/my-feature/
curl -X POST http://localhost:8000/api/v1/my-feature/ \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Item"}'
```

Or use Swagger UI at `/docs`.

---

## Adding Frontend Components

### Step 1: Create Component

```tsx
// features/my-feature/MyComponent.tsx

"use client";

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, Trash2 } from 'lucide-react';

interface Item {
  id: number;
  name: string;
  description?: string;
}

export function MyComponent() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  // Fetch data on mount
  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/my-feature/');
      const data = await res.json();
      if (data.success) {
        setItems(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  const createItem = async () => {
    if (!newName.trim()) return;

    try {
      const res = await fetch('/api/v1/my-feature/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });

      if (res.ok) {
        setNewName('');
        fetchItems(); // Refresh list
      }
    } catch (error) {
      console.error('Failed to create:', error);
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await fetch(`/api/v1/my-feature/${id}`, { method: 'DELETE' });
      fetchItems(); // Refresh list
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">My Feature</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchItems}
          disabled={loading}
          className="gap-2 border-white/20 text-white hover:bg-white/10"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Create Form */}
      <Card className="bg-white/5 border-white/10 p-4">
        <div className="flex gap-2">
          <Input
            placeholder="New item name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createItem()}
            className="bg-black/20 border-white/20 text-white"
          />
          <Button onClick={createItem} disabled={!newName.trim()}>
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>
      </Card>

      {/* Items List */}
      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id} className="bg-white/5 border-white/10 p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{item.name}</p>
              {item.description && (
                <p className="text-sm text-white/50">{item.description}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteItem(item.id)}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </Card>
        ))}

        {!loading && items.length === 0 && (
          <div className="text-center py-8 text-white/40">
            No items yet. Create one above!
          </div>
        )}
      </div>
    </div>
  );
}
```

### Step 2: Export from Index

```typescript
// features/my-feature/index.ts
export { MyComponent } from './MyComponent';
```

### Step 3: Use in Page

```tsx
// app/page.tsx or wherever needed
import { MyComponent } from '@/features/my-feature';

export default function Page() {
  return (
    <main className="container mx-auto py-8">
      <MyComponent />
    </main>
  );
}
```

---

## Database Migrations

### Creating New Migration

```bash
cd backend

# Generate migration file
alembic revision --autogenerate -m "Description of changes"

# Review generated file in alembic/versions/

# Apply migration
alembic upgrade head

# Rollback if needed
alembic downgrade -1
```

### Example Migration File

```python
"""Add benchmark_results table.

Revision ID: abc123
Revises: previous_revision
Create Date: 2026-01-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade():
    op.create_table(
        'benchmark_results',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('model_id', sa.String(), nullable=False),
        sa.Column('inference_time', sa.Float()),
        sa.Column('throughput', sa.Float()),
        sa.Column('memory_mb', sa.Float()),
        sa.Column('gpu_utilization', sa.Float()),
        sa.Column('timestamp', sa.DateTime(), server_default=sa.func.now()),
    )

def downgrade():
    op.drop_table('benchmark_results')
```

---

## Testing Guidelines

### Frontend Testing

```typescript
// __tests__/MyComponent.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyComponent } from '@/features/my-component';

// Mock fetch
global.fetch = jest.fn();

describe('MyComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state', () => {
    (fetch as jest.Mock).mockImplementationOnce(() => 
      Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) })
    );

    render(<MyComponent />);
    expect(screen.getByText(/refresh/i)).toBeInTheDocument();
  });

  it('displays items after fetch', async () => {
    const mockItems = [{ id: 1, name: 'Test Item' }];
    
    (fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockItems }) })
    );

    render(<MyComponent />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Item')).toBeInTheDocument();
    });
  });
});
```

### Backend Testing

```python
# tests/test_my_feature.py

import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def db_session():
    """Create test database session."""
    from app.database import SessionLocal
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()

def test_list_items(client, db_session):
    """Test listing items endpoint."""
    response = client.get("/api/v1/my-feature/")
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "data" in data

def test_create_item(client, db_session):
    """Test creating an item."""
    response = client.post(
        "/api/v1/my-feature/",
        json={"name": "Test Item"}
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["name"] == "Test Item"

def test_get_item_not_found(client):
    """Test getting non-existent item."""
    response = client.get("/api/v1/my-feature/99999")
    
    assert response.status_code == 404
```

### Running Tests

```bash
# Frontend
npm test

# Backend
cd backend
pytest tests/ -v

# With coverage
pytest tests/ --cov=app --cov-report=html
```

---

## Debugging Tips

### Frontend Debugging

```typescript
// 1. Use React DevTools browser extension
// 2. Console logging with context
console.log('[MyComponent] Items loaded:', items.length);

// 3. Error boundaries
<ErrorBoundary fallback={<ErrorUI />}>
  <MyComponent />
</ErrorBoundary>

// 4. Network tab to inspect API calls
// 5. React Profiler for performance
```

### Backend Debugging

```python
# 1. Enable debug mode
DEBUG=True

# 2. Use Python debugger
import pdb; pdb.set_trace()

# 3. Or ipdb (better)
import ipdb; ipdb.set_trace()

# 4. Log with context
import logging
logger = logging.getLogger(__name__)
logger.debug("Processing job %s", job_id)

# 5. Check logs via manager.sh
./scripts/manager.sh
```

### Common Issues

| Issue | Solution |
|-------|----------|
| CORS errors | Check `CORS_ORIGINS` in `.env` |
| Module not found | Check imports, reinstall deps |
| DB connection failed | Verify PostgreSQL running, check URL |
| GPU OOM | Reduce batch size, use smaller model |
| Slow queries | Add database indexes, use eager loading |

---

## Common Patterns

### API Service Pattern

```typescript
// services/myService.ts

const apiClient = getApiClient();

export const myService = {
  async getAll(params?: Record<string, string>) {
    const searchParams = new URLSearchParams(params).toString();
    const res = await apiClient.get(`/my-resource?${searchParams}`);
    return res.data;
  },

  async getById(id: string) {
    const res = await apiClient.get(`/my-resource/${id}`);
    return res.data;
  },

  async create(data: CreateData) {
    const res = await apiClient.post('/my-resource', data);
    return res.data;
  },
};
```

### Zustand Store Pattern

```typescript
// stores/useMyStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MyState {
  items: Item[];
  loading: boolean;
  
  // Actions
  fetchItems: () => Promise<void>;
  addItem: (item: Item) => void;
  clearItems: () => void;
}

export const useMyStore = create<MyState>()(
  persist(
    (set, get) => ({
      items: [],
      loading: false,

      fetchItems: async () => {
        set({ loading: true });
        try {
          const data = await myService.getAll();
          set({ items: data, loading: false });
        } catch (error) {
          set({ loading: false });
          throw error;
        }
      },

      addItem: (item) => {
        set((state) => ({ items: [...state.items, item] }));
      },

      clearItems: () => {
        set({ items: [] });
      },
    }),
    {
      name: 'my-store', // localStorage key
      partialize: (state) => ({ items: state.items }), // Only persist some fields
    }
  )
);
```

### Celery Task Pattern

```python
# workers/my_tasks.py

from celery import shared_task
from app.database import SessionLocal
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_something(self, item_id: str):
    """Process an item with retry support."""
    db = SessionLocal()
    
    try:
        item = db.query(Item).filter(Item.id == item_id).first()
        if not item:
            raise Exception("Item not found")
        
        # Do processing
        result = do_work(item)
        
        logger.info("Processed item %s successfully", item_id)
        return {"success": True, "result": result}
        
    except Exception as exc:
        logger.error("Failed to process %s: %s", item_id, exc)
        raise self.retry(exc=exc)
        
    finally:
        db.close()
```

---

## Contributing Guidelines

### Pull Request Process

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test && cd backend && pytest`
5. Lint code: `npm run lint`
6. Commit with conventional commits: `feat: add new provider`
7. Push to fork: `git push origin feature/my-feature`
8. Open PR with description

### Commit Message Format

```
type(scope): subject

body (optional)

footer (optional)
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(providers): add Stable Diffusion XL provider`
- `fix(download): handle network timeout gracefully`
- `docs(api): update authentication examples`
- `test(health): add unit tests for health manager`

### Code Review Checklist

- [ ] Code follows style guidelines
- [ ] No console.log/debug statements left
- [ ] Error handling implemented
- [ ] Types properly defined
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No security vulnerabilities

---

*For questions or discussions, open an issue or discussion on GitHub.*

## Pipelines & Runtime Integration

The current pipeline surface is split across a small set of files:

### Frontend

- `features/settings/sections/PipelinesSection.tsx` — renders the Settings → Pipelines page.
- `services/runtimeService.ts` — reads runtime status, options, verification, and HuggingFace token state.
- `hooks/useBackendData.ts` — central backend data hook used by runtime-related UI.
- `app/api/v1/[...path]/route.ts` — Next.js proxy route for backend API calls.

### Backend

- `backend/app/api/v1/pipelines.py` — pipeline snapshot, workspace-models, workspace-types, and feature gate toggle endpoints.
- `backend/app/api/v1/runtime.py` — runtime status, health, options, and install stream routes. Install endpoints now require an explicit model list (no bulk "install everything" mode).
- `backend/app/api/v1/generation.py` — generation endpoints with optional `workspace` field for provider/workspace compatibility validation.
- `backend/app/api/v1/hf_token_router.py` — HuggingFace token status and verification helpers.
- `backend/app/core/capability_matrix.py` — computes feature availability from installed models; includes `is_compatible_with_workspace()` and `filter_by_workspace()`.
- `backend/app/core/registry/model_registry.py` — source of truth for the current catalog; manifests include `workspace_compatibility`.
- `backend/runtime/installer.py` — `resolve_install_targets()` enforces explicit model lists; per-model venv creation via `uv venv`; `PROVIDER_METADATA` includes `workspace_compatibility`.
- `backend/runtime/storage.py` — `StorageConfig` now provides `get_model_venv_path()`, `get_model_venv_python()`, `get_model_weights_dir()`.

### Workspace Compatibility System

When adding a new model, declare its `workspace_compatibility` in both:
1. `backend/runtime/installer.py` → `PROVIDER_METADATA[model_id]["workspace_compatibility"]`
2. `backend/app/core/registry/model_registry.py` → model manifest `workspace_compatibility`

Valid workspace types: `mesh-generation`, `texture-generation`, `rigging`, `animation`, `segmentation`, `remesh`, `post-processing`.

The frontend uses `useWorkspaceModels(workspace)` to fetch only compatible models for each workspace tab.

### Current catalog

`hunyuan3d-2.1`, `triposr`, `trellis`, `triposg`, `triposf`, `unirig`, `holopart`

### Verification checklist

- `GET /api/v1/pipelines` returns the snapshot used by Settings → Pipelines.
- `GET /api/v1/pipelines/workspace-models?workspace=<type>` returns workspace-filtered models.
- `GET /api/v1/pipelines/workspace-types` returns all supported workspace types.
- `GET /api/v1/runtime/status` returns engine, provider, storage, and worker data.
- `GET /api/v1/runtime/options` exposes the runtime pickers used by the UI.
- There is no bare `GET /api/v1/runtime` route in the current router.
