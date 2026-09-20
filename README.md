<!-- ===================== HERO BANNER ===================== -->

<p align="center">
  <img src="https://i.postimg.cc/2ScFBzgs/file-000000006864720bb59405440766bb68-2.jpg" alt="AI 3D Studio Banner" width="100%">
</p>

<h1 align="center">
    AI 3D Studio
</h1>

<p align="center">
  <strong>Production-Grade AI 3D Generation, Optimization & Game-Ready Asset Pipeline</strong><br>
  Neural Reconstruction • Safe Post-Processing • Multi-Tier LODs • Physics Colliders • Automated QA • Multi-Format Export
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-6.0.0-8A2BE2?style=for-the-badge" alt="Version 6.0.0">
  <img src="https://img.shields.io/badge/Engine-ComfyUI_0.36.0-FF6B6B?style=for-the-badge" alt="ComfyUI">
  <img src="https://img.shields.io/badge/3D_Layer-ComfyUI--3D--Pack-4ECDC4?style=for-the-badge" alt="ComfyUI-3D-Pack">
  <img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.12+">
  <img src="https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Next.js-16.x-Frontend-000000?style=for-the-badge&logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/Blender-4.x_Headless-F5792A?style=for-the-badge&logo=blender&logoColor=white" alt="Blender 4.x">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License MIT">
</p>

---

<p align="center">
  <strong>⭐ Star this repo if you find it useful!</strong>
</p>

---

## 📖 Table of Contents

- [⚡ Overview](#-overview)
- [🏗️ System Architecture](#️-system-architecture)
- [🔄 3D Quality Pipeline Workflow](#-3d-quality-pipeline-workflow)
- [🎯 Target Platform Polygon Budgets](#-target-platform-polygon-budgets)
- [📈 Multi-Tier Level of Detail (LOD) Cascade](#-multi-tier-level-of-detail-lod-cascade)
- [📊 Automated QA Validation Rubric](#-automated-qa-validation-rubric)
- [📦 Structured Export Archive](#-structured-export-archive)
- [🚀 Features & Capabilities](#-features--capabilities)
- [🆕 What's New in V6](#-whats-new-in-v6)
- [🤖 Supported Model Catalog](#-supported-model-catalog)
- [🛠️ Technology Stack](#️-technology-stack)
- [📦 Installation & Quick Start](#-installation--quick-start)
  - [Prerequisites](#prerequisites)
  - [Automated Setup](#automated-setup)
  - [Google Colab 1-Click Launch](#google-colab-1-click-launch)
  - [Access Points](#access-points)
  - [Manual Development Setup](#manual-development-setup)
- [⚙️ Configuration](#️-configuration)
- [🎮 Application Usage](#-application-usage)
- [🔌 API Endpoints Reference](#-api-endpoints-reference)
- [🛠️ Development & Testing](#️-development--testing)
- [📁 Project Structure](#-project-structure)
- [🔧 Troubleshooting](#-troubleshooting)
- [📊 Pipeline Status](#-pipeline-status)
- [🔐 Security](#-security)
- [📚 Documentation Index](#-documentation-index)
- [📄 License](#-license)

---

## ⚡ Overview

**AI 3D Studio** is an open-source generative 3D asset factory. Built on top of **ComfyUI 0.36.0** as the execution core and **ComfyUI-3D-Pack** as the 3D node suite, it bridges state-of-the-art neural shape and texture synthesis models (**Hunyuan3D-2.1**, **TRELLIS**, **TripoSR**, **TripoSF**, **SV3D**) with a non-destructive production pipeline that preserves raw master geometry while generating engine-compliant game assets with automated Level-of-Detail (LOD) cascades, physics collision hulls, and objective QA validation scores.

### Key Highlights
- **ComfyUI 0.36.0 Core Engine**: Robust, node-based computational graph execution with prompt queuing, WebSocket event streaming, and native custom node extensibility.
- **ComfyUI-3D-Pack Integration**: Native custom nodes for generative 3D, Marching Cubes, FlexiCubes, texture baking, and remeshing.
- **Performance Optimized**: Built-in `--enable-compress-response-body`, `--mmap-torch-files`, `--use-split-cross-attention` (CPU), and `--async-offload 2` (GPU) for minimal latency and maximum VRAM efficiency.
- **FastAPI Product & Gateway Layer**: High-throughput REST and WebSocket proxy with persistent TCP connection pooling (`aiohttp.TCPConnector`), micro-caching, and PostgreSQL 16 persistence.
- **Master Asset Preservation**: Always archives the original byte-for-byte neural output (`source.glb`) alongside optimized game meshes.
- **Automated LOD Generation**: Generates LOD0 (100%), LOD1 (50%), LOD2 (25%), and LOD3 (12.5%) variants with UV and material preservation.
- **Convex Hull Physics Colliders**: Produces watertight simplified collision geometry for immediate game engine physics.
- **Objective QA Diagnostic Engine**: Analyzes non-manifold edges, UV overlap, component counts, and poly budgets with a composite 0–100 score.
- **Modular Game-Ready Export**: One-click download of structured ZIP packages formatted for Unreal Engine 5, Unity, and Godot 4.

---

## 🏗️ System Architecture

```mermaid
graph TB
    subgraph Client["Presentation & Workspace (Next.js 16 + Three.js)"]
        UI_VIEW["Interactive 3D Viewport<br/>(WebGL / OrbitControls / Matcaps)"]
        UI_GEN["Generate Panel<br/>(Platform Budgets & LOD Cascade)"]
        UI_EXP["Export Engine Modal<br/>(Variants, Conversions & ZIP Packaging)"]
        UI_MODELS["AI Models & Pipeline Telemetry"]
    end

    subgraph API["Backend Gateway (FastAPI / AsyncIO :8000)"]
        ROUTER_GEN["/api/v1/generation"]
        ROUTER_EXP["/api/v1/project/export"]
        ROUTER_MODELS["/api/v1/models"]
        ROUTER_RUN["/api/v1/runtime"]
        ROUTER_SYS["/api/v1/system"]
        COMFY_CLIENT["ComfyUI Client<br/>(TCP Connection Pool & WS Stream)"]
        DB[("PostgreSQL :5432<br/>Jobs & Metadata")]
    end

    subgraph Engine["ComfyUI Execution Core (:8188)"]
        COMFY_CORE["ComfyUI 0.36.0 Engine<br/>(mmap Tensors & Compress Body)"]
        QUEUE["Prompt Execution Queue"]
        CACHE["RAM/VRAM Cache Management"]
    end

    subgraph Nodes["ComfyUI-3D-Pack Node Suite"]
        HY21["Hunyuan3D-2.1 (Shape + Paint)"]
        TREL["TRELLIS (FlexiCubes PBR)"]
        TSG["TripoSR / TripoSF (Fast Mesh)"]
        SV3D["SV3D (Multi-view Synthesis)"]
        REMESH["Remesh & Optimization Nodes"]
    end

    subgraph Output["Production Asset Delivery"]
        MASTER["source.glb (Untouched Master)"]
        GAME["game_ready.glb (Engine Optimized)"]
        LODS["lods/lod0..3.glb (LOD Cascade)"]
        HULL["collision.glb (Physics Collider)"]
        ZIP["Structured ZIP Package"]
    end

    Client <==>|REST / Next.js Proxy| API
    API --> DB
    API <==>|HTTP Connection Pool / WS| Engine
    Engine --> Nodes
    Nodes -->|Raw Neural Mesh| API
    API -->|Master, LODs, Colliders| Output
    Output -->|Static Delivery| Client
```

---

## 🔄 3D Quality Pipeline Workflow

```mermaid
flowchart TD
    classDef stage fill:#1e1e24,stroke:#6366f1,stroke-width:2px,color:#fff;
    classDef file fill:#18181b,stroke:#22c55e,stroke-width:1.5px,color:#fff;
    classDef guard fill:#18181b,stroke:#f59e0b,stroke-width:1.5px,color:#fff;
    classDef client fill:#1e1e2d,stroke:#a855f7,stroke-width:2px,color:#fff;

    UI[1-Click Mesh Quality Toolbar<br/>• Low: 256³ / 20 steps<br/>• Medium: 384³ / 35 steps<br/>• High: 512³ / 50 steps<br/>• Ultra: 640³ / 75 steps<br/>• Raw: 640³ Master / Full Poly]:::client --> IN[Input Image / Prompt]
    
    IN --> P1[1. Preprocessing & Background Separation<br/>• Transparent alpha detection<br/>• RemBG / BriaRMBG silhouette extraction]:::stage
    
    P1 --> P2[2. Neural Provider Inference<br/>• Hunyuan3D (Dynamic 256³–640³ Octree Grid)<br/>• TRELLIS (FlexiCubes PBR, 2048x2048 Textures)<br/>• TripoSG (Dense Isosurface)]:::stage
    
    P2 --> TEX_GUARD{Mesh Has Real Textures?}:::guard
    TEX_GUARD -->|No: Untextured Raw Mesh| PROJ[Occlusion-Aware PBR Texture Projection<br/>• Tangent-space Normal Map Baking<br/>• Metallic/Roughness/AO Synthesis<br/>• Sharp eyes, nostrils, teeth relief]:::stage
    TEX_GUARD -->|Yes: Already Textured| RAW[(source.glb / master.glb<br/>Untouched Raw Master Asset)]:::file
    PROJ --> RAW

    RAW --> ROUTE{Optimization Mode?}:::guard
    
    ROUTE -->|RAW Preset: auto_optimize=false| RAW_DELIVER[Direct Master Delivery<br/>• Zero decimation<br/>• Sub-millimeter micro-details intact]:::stage
    RAW_DELIVER --> RAW_OUT[(source.glb active in Viewport)]:::file

    ROUTE -->|Game-Ready: auto_optimize=true| P3[3. OpenX Clay Post-Processing<br/>• C++ meshoptimizer SIMD Decimation<br/>• Preserves UVs and PBR Textures<br/>• xatlas Conformal Unwrapping when untextured]:::stage

    P3 --> G1{Safe Component Guard<br/>Islands ≥ 0.5% vertices or ≥ 15 verts?}:::guard
    G1 -->|Yes| KEEP[Preserve Ears, Horns, Tails, Claws & Accessories]
    G1 -->|No| PRUNE[Purge Floating Disconnected Noise]

    KEEP --> BASE[(game_ready.glb<br/>Optimized Deliverable)]:::file
    PRUNE --> BASE

    BASE --> P5[4. Multi-Tier LOD Cascade<br/>• meshoptimizer with Texture Retention]:::stage
    P5 --> L0[(LOD0: 100% Master)]:::file
    P5 --> L1[(LOD1: 50% Polycount)]:::file
    P5 --> L2[(LOD2: 25% Polycount)]:::file
    P5 --> L3[(LOD3: 12.5% Polycount)]:::file

    BASE --> P6[5. Physics Collision Mesh<br/>• Trimesh Convex Hull]:::stage
    P6 --> C_OUT[(collision.glb<br/>Physics Collider)]:::file

    BASE --> P7[6. Geometry QA Diagnostics<br/>• Manifoldness & Normal Inspection<br/>• UV & Texture Verification]:::stage
    P7 --> QA_OUT[(quality_report.json<br/>Game-Ready Score: 0–100)]:::file

    BASE --> P8[7. Production Export Endpoint<br/>• POST /api/v1/project/export<br/>• GLB / GLTF / FBX / OBJ / STL / PLY]:::stage
    RAW_OUT --> P8
    L0 --> P8
    L1 --> P8
    L2 --> P8
    L3 --> P8
    C_OUT --> P8
    QA_OUT --> P8

    P8 --> ZIP[(Structured Production ZIP Package<br/>Source/ + GameReady/ + LODs/ + Collision/ + QA/)]:::file
```

---

## 🎯 Target Platform Polygon Budgets

Game-ready decimation adheres to standard engine polygon budgets:

| Platform | Target Polycount | Max Vertices | Draw Calls | Recommended Use Case |
|---|---|---|---|---|
| **Mobile** | ≤ 18,000 tris | ~10,000 | 1–2 | Mobile WebGL, iOS/Android games, XR headsets |
| **Low** | ≤ 28,000 tris | ~16,000 | 1–2 | Low-end PC, Nintendo Switch, background props |
| **Medium** | ≤ 45,000 tris | ~25,000 | 1–3 | Standard PC/Console games, hero props, web interactive |
| **High** | ≤ 85,000 tris | ~50,000 | 1–4 | High-end PC/Console hero characters, Unreal Engine 5 |
| **Cinematic** | ≤ 180,000 tris | ~100,000 | 1–5 | Pre-rendered cinematics, virtual production |

---

## 📈 Multi-Tier Level of Detail (LOD) Cascade

```mermaid
flowchart LR
    L0["<b>LOD0 (100%)</b><br/>Master Source<br/>Screen: > 50%"] -->|Decimate 50%| L1["<b>LOD1 (50%)</b><br/>Close Range<br/>Screen: 25% – 50%"]
    L1 -->|Decimate 50%| L2["<b>LOD2 (25%)</b><br/>Mid Range<br/>Screen: 10% – 25%"]
    L2 -->|Decimate 50%| L3["<b>LOD3 (12.5%)</b><br/>Distant Proxy<br/>Screen: < 10%"]
```

- **LOD0**: 100% original baseline triangles. Used for close-up hero rendering.
- **LOD1**: 50% of LOD0 polygon count. Preserves texture coordinates and visual silhouettes.
- **LOD2**: 25% of LOD0 polygon count. Ideal for medium camera distances.
- **LOD3**: 12.5% of LOD0 polygon count. Distant background proxy with minimal rendering overhead.

---

## 📊 Automated QA Validation Rubric

Every generated asset undergoes an objective topological evaluation producing an explainable 0–100 composite score:

```mermaid
pie title QA Score Weighting Distribution (100 Points Total)
    "Topology & Geometry Integrity" : 35
    "UV Mapping & Material Retention" : 35
    "Platform Polycount & Transform Sanity" : 30
```

- **Topology & Geometry Integrity (35 pts max)**: Evaluates structural manifoldness and normal consistency.
  - Normal winding consistency: -10 deduction if polygon normals are inverted or non-orientable.
  - Non-manifold edges: Up to -10 deduction based on non-manifold edge counts (`np.unique` frequency > 2).
  - Degenerate faces: Up to -5 deduction for zero-area triangles.
  - Excessive components: -5 deduction if disconnected component count > 10.
- **UVs & Materials Retention (35 pts max)**: Validates texture coordinates and shading maps.
  - UV validity: -20 deduction if UV coordinates are missing; -10 deduction if coordinates are collapsed or unnormalized.
  - Texture presence: -15 deduction if no base color / albedo map is embedded.
- **Platform Budget & Transform Sanity (30 pts max)**: Conformance to selected target polycount.
  - Overbudget: -5 pts for >100% budget, -15 pts for >150% budget, -25 pts for >250% budget.
  - Transform validity: -5 deduction if bounding box extents are zero, infinite, or degenerate.

| Status | Score Range | Engine Compatibility |
|---|---|---|
| 🟢 **PASS** | 80 – 100 | Direct drag-and-drop ready for Unreal Engine 5, Unity, or Godot 4. |
| 🟡 **WARN** | 50 – 79 | Usable geometry with minor warnings (e.g., untextured mesh or slight budget overage). |
| 🔴 **FAIL** | < 50 | Geometry defects detected; requires re-generation or automated mesh repair. |

---

## 🏷️ Deterministic Asset Classification & Rigging Guard

Assets are deterministically classified into 6 canonical categories before post-processing and rigging:

| Category | Taxonomy Examples | Rigify Human Metarig Support | Rationale |
|---|---|---|---|
| **Human** | Man, woman, soldier, knight, wizard, ninja, chef | ✅ Supported | Upright bipedal topology matches Rigify metarig proportions |
| **Humanoid** | Robot, cyborg, alien, monster, orc, skeleton | ✅ Supported | Bipedal humanoid stature with compatible limbs and spine |
| **Quadruped** | Dog, cat, horse, wolf, lion, bear, deer | ❌ Safely Skipped | 4-legged anatomy is incompatible with bipedal human metarig |
| **Hard-Surface** | Car, vehicle, weapon, sword, shield, spaceship | ❌ Safely Skipped | Rigid non-organic objects require discrete kinematic hierarchies |
| **Generic-Prop** | Barrel, crate, rock, bottle, chest, potion | ❌ Safely Skipped | Static inanimate objects do not require skeletal deformation |
| **Unknown** | Unclassified / ambiguous prompts | ⚠️ Geometrically Evaluated | Checked via bounding box aspect ratio (height / width ≥ 1.8) |

> **Animation Policy**: Humanoid motion generation is supported through the **ARDY** provider (generating autoregressive motion tracks in `.npz` format). For static 3D meshes, automatic bipedal rigging is supported via Rigify armature binding, while arbitrary clip authoring is routed to dedicated motion models.

---

## 📦 Structured Export Archive & Formats

The production export engine (`POST /api/v1/project/export`) provides real conversions across 5 canonical formats:

| Format | Engine / Software Target | Conversion Backend | PBR Texture Support |
|---|---|---|---|
| **GLB** | WebGL, Three.js, Godot 4, Babylon.js | Direct glTF binary stream | Full PBR (Roughness/Metallic) |
| **FBX** | Unreal Engine 5, Unity, Autodesk Maya, 3ds Max | Real Headless Blender 4.x (`io_scene_fbx`) | Skeletal Rig & Materials |
| **OBJ** | Wavefront, ZBrush, Cinema4D | Trimesh / Blender OBJ Exporter | Geometry + MTL definitions |
| **STL** | 3D Printing, CAD, Slicers | Trimesh / Blender STL Exporter | Pure Geometry (Watertight) |
| **PLY** | Point Clouds, Gaussian Splatting, MeshLab | Trimesh / Blender PLY Exporter | Vertex Coordinates & Colors |

When exporting with `packageZip=true`, assets are organized into a standardized archive:

```
Hero_Character.zip
├── Model/
│   └── Hero_Character.glb    # Selected format & variant export
├── Source/
│   └── Hero_Character_source.glb # Preserved untouched neural master
├── LODs/
│   ├── lod0.glb              # 100% master fidelity
│   ├── lod1.glb              # 50% decimation (strictly decreasing)
│   ├── lod2.glb              # 25% decimation
│   └── lod3.glb              # 12.5% distant proxy
├── Collision/
│   └── Hero_Character_collision.glb # Physics convex hull collider
├── Preview/
│   └── thumbnail.png         # High-resolution rendering
└── QA/
    └── quality_report.json   # Machine-readable QA metrics & deductions
```

> **Master Asset Preservation**: The raw generative master (`source.glb`) is archived before any post-processing, decimation, or LOD cascade runs. Derived operations never overwrite the source asset.

---

## 🚀 Features & Capabilities

### Complete Feature Matrix

| Feature | Description | Status | Version |
|---|---|---|---|
| **Image-to-3D** | High-fidelity neural mesh reconstruction from single image | ✅ | v1 |
| **Model Discovery** | Multi-source discovery across HuggingFace, ModelScope, CivitAI, NGC | ✅ | V2 |
| **Smart Download Engine** | Resumable chunked downloads with mirror fallback and checksums | ✅ | V2 |
| **Health Diagnostics** | Real-time GPU telemetry, disk space, and VRAM monitoring | ✅ | V2 |
| **Compatibility Pre-Check** | Hardware and dependency validation prior to installation | ✅ | V2 |
| **Two-Stage Runtime** | Decoupled runtime preparation (Stage A) & weight fetching (Stage B) | ✅ | V2 |
| **VRAM-Aware Scheduling** | Strict mutual exclusion locking prevents multi-provider GPU OOM | ✅ | v1 |
| **Workspace Filtering** | Model-to-workspace capability gating preventing invalid selection | ✅ | v3.3 |
| **Texture Pipeline** | PBR material synthesis with resolution, roughness, and metalness controls | ✅ | v3.3 |
| **3D Canvas Viewport** | Three.js WebGL viewport with environment lighting and matcap shaders | ✅ | v1 |
| **Component Pruning Guard** | Retention threshold (≥0.5% vertices) protects ears, horns, and tails | ✅ | v5.0.18 |
| **UV Protection Guard** | Non-destructive UV preservation prevents destroying neural textures | ✅ | v5.0.18 |
| **Humanoid Armature Guard** | Aspect-ratio bounding check gates Rigify armature binding | ✅ | v5.0.18 |
| **Multi-Tier LOD Cascade** | Automatic decimation producing LOD0–LOD3 cascade | ✅ | v5.0.18 |
| **Convex Hull Generation** | Watertight simplified collision mesh for physics simulation | ✅ | v5.0.18 |
| **Automated QA Scoring** | Topological scoring rubric (0–100) with pass/warn/fail thresholds | ✅ | v5.0.18 |
| **Structured ZIP Packaging** | Multi-variant zip packaging (`Source/`, `GameReady/`, `LODs/`, `Collision/`, `QA/`) | ✅ | v5.0.18 |
| **Realtime Telemetry** | WebSocket (`/ws`) & SSE (`/system/stream`) hardware monitoring | ✅ | v4.6.0 |
| **In-Memory Caching** | High-performance LRU cache layer (256 entries) with automatic invalidation | ✅ | v4.6.1 |
| **Security Hardening** | Subprocess command allowlists, safe path resolution, rate limiting | ✅ | v4.4.9 |

---

## 🆕 What's New in V2

### 1. Smart Download & Queue System
- **Parallel Chunking**: Multi-part streaming downloads for high-bandwidth model weights.
- **Resumption & Verification**: Byte-level resume with automated SHA256 and MD5 integrity verification.
- **Mirror Fallback**: Seamless fallback between HuggingFace, GitHub Releases, and ModelScope.
- **Queue Controls**: Pause, resume, cancel, and prioritize active downloads.

### 2. Compatibility & Health Monitoring
- **Pre-Installation Matrix**: Validates GPU VRAM, CUDA toolkit, Python version, RAM, and disk space.
- **Self-Healing Workers**: Background health checks detect corrupted environments and offer one-click repairs.
- **Benchmark Suite**: Records per-model inference duration, peak VRAM consumption, and throughput.

### 3. Non-Destructive 3D Pipeline
- **Raw Master Preservation**: Never overwrites raw neural outputs during post-processing.
- **Fail-Safe Fallbacks**: If decimation fails or exceeds budget, the system gracefully falls back to the clean baseline.

---

## 🤖 Supported Model Catalog

| Model | Category | Recommended VRAM | Speed | Key Capabilities |
|---|---|---|---|---|
| **Hunyuan3D-2.1** | 3D Shape & Texture | 16 GB (29 GB full) | ~90s | High-fidelity shape generation, multi-view neural paint diffusion |
| **Hunyuan3D-2 Mini** | Fast 3D Generation | 6 GB | ~45s | Lightweight DiT shape synthesis; separate repo, manifest, and venv |
| **TRELLIS** | Structured 3D | 16 GB (8 GB low-VRAM) | ~60s | High-resolution FlexiCubes meshes with native PBR materials |
| **TripoSG** | Fast Single-Image | 8 GB | ~60s | Rectified-flow shape generation, high-density vertex colors |
| **TripoSR** | Fast Single-Image | 6–8 GB (4 GB low) | ~15s | VAST/Stability fast single-image 3D reconstruction with xatlas texture baking (TSR) |
| **TripoSF** | Mesh Reconstruction | 12–16 GB | ~30s | VAST SparseFlex arbitrary-topology mesh reconstruction and refinement (mesh-to-mesh) |
| **ARDY** | Humanoid Motion | 12–16 GB (8 GB low) | ~20s | NVIDIA autoregressive humanoid motion generation (.npz skeleton tracks) |
| **DetailGen3D** | Post-Processing | 4 GB | ~15s | Geometric refinement, surface micro-detail enhancement |

> **Google Colab Policy**: In testing environments (such as Google Colab), all models are installable regardless of declared VRAM footprint. VRAM numbers in manifests are advisory.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | Next.js 16 (App Router), React 19, TypeScript | Reactive modern web application |
| **UI Components** | Tailwind CSS, Radix UI, Lucide Icons | Premium Tripo-style dark interface |
| **State Management** | Zustand | Real-time global client state |
| **3D Rendering** | Three.js, React Three Fiber | WebGL model inspection, lighting, wireframe views |
| **Frontend Framework** | Next.js 16 (App Router), React 19, TypeScript | Reactive modern web application |
| **UI Components** | Tailwind CSS, Radix UI, Lucide Icons | Premium Tripo-style dark interface |
| **State Management** | Zustand | Real-time global client state |
| **3D Rendering** | Three.js, React Three Fiber | WebGL model inspection, lighting, wireframe views |
| **Backend Framework** | FastAPI 0.115, Python 3.12+, Pydantic V2 | High-throughput asynchronous REST API & Gateway |
| **Execution Engine** | ComfyUI 0.36.0 Core | Computational graph execution, prompt queue & events |
| **3D Node Suite** | ComfyUI-3D-Pack | Hunyuan3D-2.1, TRELLIS, TripoSR, SV3D, 3DGS, Remesh |
| **Database** | PostgreSQL 16 (Native) | Persistent jobs, model registries, and asset metadata |
| **Caching & Broker** | Redis 7 | Distributed key-value caching and session state |
| **3D Quality Engine** | Blender 4.x (Headless), Trimesh | Retopology, decimation, collision hulls, QA scoring |
| **Package Management** | `uv` (Ultra-fast Python package resolver) | Virtual environment & dependency installer |

---

## 📦 Installation & Quick Start

### Prerequisites

- **OS**: Linux (Ubuntu 20.04, 22.04, or 24.04 recommended)
- **GPU**: NVIDIA GPU with CUDA compute capability (or CPU mode with auto-fallback)
- **Package Manager**: `uv` (installed automatically if missing)
- **Disk Space**: 50 GB free disk space
- **System Memory**: 16 GB+ RAM (8 GB minimum)

### Automated Setup

Installation is streamlined and idempotent:
1. **ComfyUI & 3D Pack**: Automatically cloned and configured in `ENGINE/ComfyUI` with `custom_nodes/ComfyUI-3D-Pack`.
2. **Backend API**: Python virtual environment configured with FastAPI, SQLAlchemy, and ComfyUI client.
3. **Frontend**: Next.js 16 built and configured.

```bash
# 1. Clone repository
git clone https://github.com/Silentzx2/AI_Studio.git
cd AI_Studio

# 2. Make management scripts executable
chmod +x scripts/*.sh manager.sh

# 3. Run automated setup (installs ComfyUI, 3D Pack, dependencies)
./scripts/setup.sh

# 4. Start all services (PostgreSQL, Redis, ComfyUI, FastAPI, Next.js)
./scripts/start.sh
```

### Google Colab 1-Click Launch

Launch AI 3D Studio directly in Google Colab with one click:

<p align="left">
  <a href="https://colab.research.google.com/github/Silentzx2/AI_Studio/blob/main/colab.ipynb">
    <img src="https://colab.research.google.com/assets/colab-badge.svg" alt="Open In Colab">
  </a>
</p>

Or run in a Colab GPU runtime cell (T4, V100, L4, or A100):

```bash
!git clone https://github.com/Silentzx2/AI_Studio.git /content/AI_Studio
%cd /content/AI_Studio
!bash scripts/colab.sh --setup
```

**What the Colab notebook (`colab.ipynb`) does automatically:**
1. **Hardware Diagnostic**: Detects GPU (T4/V100/A100/L4), VRAM, and CUDA configuration.
2. **RAM Protection**: Automatically allocates an 8GB `/swapfile` to prevent OOM errors during heavy 3D tensor processing.
3. **Automated Setup**: Installs `uv`, sets up Python 3.12, PostgreSQL, Redis, ComfyUI, and ComfyUI-3D-Pack.
4. **Microservices Stack**: Starts ComfyUI (`:8188`), FastAPI backend (`:8000`), and builds/serves Next.js frontend (`:3000`).
5. **Cloudflare Tunnels**: Generates public HTTPS URLs and renders clickable links directly in the notebook output cell.

### Access Points

| Service | Address | Default Port | Description |
|---|---|---|---|
| **Frontend Workspace** | `http://localhost:3000` | 3000 | Interactive generation and 3D viewport |
| **Backend REST API** | `http://localhost:8000` | 8000 | FastAPI application gateway |
| **ComfyUI Engine** | `http://localhost:8188` | 8188 | ComfyUI core execution engine |
| **Interactive API Docs** | `http://localhost:8000/docs` | 8000 | Swagger UI with test sandbox |
| **Model Manager** | `http://localhost:3000/settings` | 3000 | AI Model inspection and options |
| **System Diagnostics** | `http://localhost:8000/api/v1/health` | 8000 | Service health & telemetry |

### Manual Development Setup

If you prefer running services manually across separate terminals:

```bash
# Terminal 1 - ComfyUI Execution Engine
./backend/.venv/bin/python ENGINE/ComfyUI/main.py --listen 0.0.0.0 --port 8188 --enable-compress-response-body --mmap-torch-files --cpu --use-split-cross-attention

# Terminal 2 - Backend FastAPI Gateway
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 3 - Frontend Development Server
bun run dev
```

---

## ⚙️ Configuration

Copy the example configuration file to create your local `.env`:

```bash
cp .env.example .env
```

### Key Environment Variables

```env
# ===== APPLICATION =====
ENVIRONMENT=development
DEBUG=true
APP_NAME=AI 3D Studio
APP_VERSION=6.0.0

# ===== COMFYUI ENGINE =====
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_TIMEOUT=300

# ===== DATABASE & CACHE =====
DATABASE_URL=postgresql+asyncpg://ai_studio:ai_studio_dev@localhost:5432/ai_studio
REDIS_URL=redis://localhost:6379/0

# ===== STORAGE PATHS =====
STORAGE_LOCAL_PATH=/teamspace/studios/this_studio/AI_Studio/backend/storage

# ===== API SETTINGS =====
API_V1_PREFIX=/api/v1
CORS_ORIGINS=["http://localhost:3000"]
```

# ===== HARDWARE & VRAM =====
CUDA_DEVICE=auto
CUDA_VISIBLE_DEVICES=0
MAX_VRAM_MB=0  # 0 = auto-detect

# ===== STORAGE PATHS =====
STORAGE_LOCAL_PATH=/teamspace/studios/this_studio/AI_Studio/backend/storage
MODELS_PATH=/teamspace/studios/this_studio/AI_Studio/backend/storage/models
DOWNLOAD_CHUNK_SIZE_MB=5
DOWNLOAD_MAX_RETRIES=3

# ===== API SETTINGS =====
API_V1_PREFIX=/api/v1
CORS_ORIGINS=["http://localhost:3000"]
```

---

## 🎮 Application Usage

### Basic Workflow

1. **Navigate to the Studio**: Open `http://localhost:3000` in your browser.
2. **Select Input Mode**: Choose **Image-to-3D** or **Text-to-3D**.
3. **Upload Image or Enter Prompt**: Provide a clean reference image (transparent PNG or clean background works best).
4. **Choose Target Platform Budget**: Select **Mobile** (18k tris), **Low** (28k tris), **Medium** (45k tris), **High** (85k tris), or **Cinematic** (180k tris).
5. **Toggle Pipeline Options**:
   - Enable **Multi-Tier LODs** to generate LOD0–LOD3.
   - Enable **Physics Collision** to build a convex hull collider.
6. **Click Generate**: Real-time progress updates stream through WebSocket/SSE.
7. **Inspect in 3D Viewport**: Orbit, pan, zoom, inspect wireframe mode, and toggle lighting.
8. **Export Production ZIP**: Click **Export** to package master source, game mesh, LODs, collider, and QA reports into a single download.

### Workspace Features

- **Tripo-Style UI**: Modern dark theme with compact typography and dedicated tool panels.
- **Hardware Telemetry**: Real-time status pills displaying GPU temperatures, VRAM allocation, and ComfyUI queue status.
- **Model-to-Workspace Filtering**: The UI automatically filters models compatible with the active workspace tab.
- **Side-by-Side Comparison**: Compare raw source geometry against decimated game-ready variants.

### Supported Workspaces

| Workspace | Purpose | Compatible Models |
|---|---|---|
| **Mesh Generation** | Primary shape generation from text or image | Hunyuan3D-2.1, TRELLIS, TripoSR, TripoSF |
| **Texture Generation** | PBR material synthesis, multi-view paint projection | Hunyuan3D-2.1, TRELLIS |
| **Rigging & Skinning** | Automated bipedal armature generation & skin weight binding | Blender Rigify Integration |
| **Remesh & Optimization** | Retopology, decimation, and manifold cleanup | ComfyUI-3D-Pack Remesh, Trimesh |
| **Post-Processing** | Second-pass geometry refinement and micro-detailing | ComfyUI-3D-Pack Refinement |

### Texture Generation Workflow

The dedicated **Texture Tab** (`/workspace/texture`) provides granular material control:
- **Resolution**: 512px (Draft), 1024px (Fast), 2048px (Balanced), 4096px (Ultra).
- **Style Presets**: Photorealistic PBR, Stylized Handpainted, Anime Cel-Shaded, Cyberpunk Neon.
- **PBR Sliders**: Metalness bias, Roughness bias, and Surface weathering controls.

### Model Manager Interface

Accessible via **Settings → AI Models**:
- **Installed Models**: Inspect installed 3D checkpoints, verify ComfyUI node readiness, and run health diagnostics.
- **Available Models**: Browse models available across HuggingFace, ModelScope, and CivitAI.
- **Hardware Telemetry**: Live VRAM allocation and device execution status.

### Admin & Monitoring Dashboard

Located at `/admin?tab=health` or via API `/api/v1/health`:
- Real-time GPU/CPU telemetry (utilization, VRAM, thermal levels).
- ComfyUI engine prompt queue status and node load times.
- PostgreSQL and Redis connection health.

---

## 🔌 API Endpoints Reference

### 3D Generation & Quality Pipeline

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/generation` | Submit image/text-to-3D generation job with platform budgets and LOD flags |
| `GET` | `/api/v1/generation/status/{job_id}` | Query job progress, execution stage, and generated output URLs |
| `POST` | `/api/v1/generation/cancel/{job_id}` | Interrupt active generation in ComfyUI and mark job cancelled |
| `GET` | `/api/v1/generation/history` | List recent generation history from database |
| `POST` | `/api/v1/generation/cost-estimate` | Estimate VRAM and execution time for generation parameters |
| `POST` | `/api/v1/project/export` | Export structured ZIP archive (`Source/`, `GameReady/`, `LODs/`, `Collision/`, `QA/`) |

### Model Management & Runtime

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/models` | List all available and installed 3D generative models |
| `GET` | `/api/v1/models/installed` | List locally installed and verified models |
| `GET` | `/api/v1/models/available` | Browse models available for installation |
| `GET` | `/api/v1/models/{model_id}` | Get detailed specification and capabilities for a model |
| `GET` | `/api/v1/models/health/all` | Run comprehensive health check on all registered models |
| `POST` | `/api/v1/models/switch` | Switch active model in runtime configuration |
| `GET` | `/api/v1/runtime/health` | Quick health check of runtime engine |
| `GET` | `/api/v1/runtime/status` | Comprehensive runtime status including GPU VRAM and disk space |
| `GET` | `/api/v1/runtime/options` | Available options for frontend dropdowns (models, formats, qualities) |
| `POST` | `/api/v1/runtime/clear-vram` | Free ComfyUI memory and purge PyTorch CUDA cache |
| `GET` | `/api/v1/runtime/hf-token` | Check Hugging Face token configuration |
| `POST` | `/api/v1/runtime/hf-token` | Set Hugging Face token for authenticated model downloads |

### System & Jobs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Comprehensive multi-service health check (ComfyUI, DB, Redis, Storage) |
| `GET` | `/api/v1/system/info` | Host hardware specifications, OS, RAM, and GPU telemetry |
| `GET` | `/api/v1/system/health` | System health check endpoint |
| `GET` | `/api/v1/jobs` | List persistent generation jobs with pagination |
| `GET` | `/api/v1/jobs/{job_id}` | Retrieve specific job details |
| `DELETE` | `/api/v1/jobs/{job_id}` | Delete job and its associated artifacts |

---

## 🛠️ Development & Testing

### Running Tests

```bash
# Run backend automated validation suite (5/5 checks)
python3 backend/tests/test_backend_e2e.py

# Verify health endpoint
curl -s http://127.0.0.1:8000/api/v1/health | jq .

# Check runtime options
curl -s http://127.0.0.1:8000/api/v1/runtime/options | jq .

# Verify frontend TypeScript types
npx tsc --noEmit

# Test production frontend build
bun run build
```

---

## 📁 Project Structure

```
AI_Studio/
├── app/                               # Next.js 16 App Router pages
│   ├── layout.tsx                     # Root layout with theme provider
│   ├── page.tsx                       # Landing page / workspace redirect
│   ├── workspace/page.tsx             # Tripo-style generation studio
│   ├── settings/page.tsx              # Settings & Model Manager
│   └── api/                           # Reverse proxy routes to FastAPI
│
├── features/                          # Feature modules & UI panels
│   ├── new-workspace/                 # Modern workspace shell & 3D canvas
│   ├── workspace/new-ui/              # Workspace tabs (Mesh, Texture, Remesh, Rigging)
│   ├── model-manager/                 # Model Manager tabs & download controls
│   └── admin/                         # System monitoring & diagnostics
│
├── components/                        # Shared UI component library
├── hooks/                             # React hooks (API client, telemetry)
├── stores/                            # Zustand stores (generation, project, UI state)
│
├── backend/                           # Clean FastAPI Python backend
│   ├── app/
│   │   ├── main.py                    # Application entry point & lifespan
│   │   ├── config.py                  # Pydantic settings & environment configuration
│   │   ├── database.py                # PostgreSQL async engine & Base model
│   │   ├── api/v1/                    # Modular API route controllers
│   │   │   ├── generation.py          # /api/v1/generation endpoints
│   │   │   ├── health.py              # /api/v1/health endpoints
│   │   │   ├── jobs.py                # /api/v1/jobs endpoints
│   │   │   ├── models.py              # /api/v1/models endpoints
│   │   │   ├── projects.py            # /api/v1/project/export endpoints
│   │   │   ├── runtime.py             # /api/v1/runtime endpoints
│   │   │   └── system.py              # /api/v1/system endpoints
│   │   ├── core/
│   │   │   ├── comfy/                 # ComfyUI client, workflows & artifacts
│   │   │   ├── storage.py             # Storage manager & file utilities
│   │   │   └── security.py            # Rate limiting & token handling
│   │   ├── models/                    # SQLAlchemy database models
│   │   └── schemas/                   # Pydantic validation schemas
│   ├── tests/
│   │   └── test_backend_e2e.py        # Automated E2E verification test suite
│   ├── pyproject.toml                 # Backend project metadata
│   └── requirements.txt               # Backend Python dependencies
│
├── ENGINE/                            # ComfyUI Execution Core (git-ignored)
│   └── ComfyUI/
│       └── custom_nodes/
│           └── ComfyUI-3D-Pack/       # Generative 3D custom nodes
│
├── scripts/                           # System orchestration scripts
│   ├── install_comfyui.sh             # Idempotent ComfyUI & 3D Pack installer
│   ├── setup.sh                       # System setup & environment builder
│   ├── start.sh                       # Multi-service launch script
│   └── stop.sh                        # Clean service shutdown script
│
├── Docs/                              # Technical documentation
├── README.md                          # Single authoritative project documentation
└── LICENSE                            # MIT License
```

---

## 🔧 Troubleshooting

### 1. GPU / CUDA Detection
```bash
# Verify NVIDIA driver and CUDA installation
nvidia-smi

# If no GPU is available, ComfyUI automatically falls back to CPU mode
# with split-cross-attention optimization.
```

### 2. Port Already in Use (3000, 8000, or 8188)
```bash
# Gracefully stop all services and free ports
bash scripts/stop.sh

# Or force free specific ports if orphaned
lsof -ti :3000 | xargs -r kill -9
lsof -ti :8000 | xargs -r kill -9
lsof -ti :8188 | xargs -r kill -9
```

### 3. Out of Memory (CUDA OOM)
- Trigger memory release via the API: `curl -X POST http://localhost:8000/api/v1/runtime/clear-vram`
- In `scripts/start.sh`, ComfyUI launches with `--mmap-torch-files` and `--enable-compress-response-body` to minimize RAM/VRAM pressure.
- For low-VRAM GPUs (≤8GB), ensure `--lowvram` flag is passed or use lighter models (e.g., TripoSR).

### 4. Checking Service Logs
```bash
# ComfyUI engine log
tail -f logs/comfyui.log

# Backend API log
tail -f logs/api.log

# Frontend log
tail -f logs/frontend.log
```

---

## 📊 Pipeline Status

| Component | Status | Details |
|---|---|---|
| **Execution Core** | ✅ Operational | ComfyUI 0.36.0 with mmap tensors & split cross-attention |
| **3D Node Suite** | ✅ Operational | ComfyUI-3D-Pack with Hunyuan3D-2.1, TRELLIS, TripoSR |
| **API Gateway** | ✅ Operational | FastAPI with persistent TCP connection pooling |
| **Database & Cache** | ✅ Operational | PostgreSQL 16 + Redis with automatic table creation |
| **3D Viewer** | ✅ Operational | WebGL / Three.js interactive 3D viewport |
| **Multi-Tier LODs** | ✅ Operational | Automated LOD0–LOD3 cascade with meshoptimizer |
| **Physics Collision Hulls**| ✅ Operational | Automated convex hull generation |
| **QA Diagnostic Engine** | ✅ Operational | 0–100 topological scoring with machine-readable reports |
| **Production ZIP Export**| ✅ Operational | Hierarchical export packaging with format conversion |

---

## 🔐 Security

- **Safe Subprocess Execution**: Strict command allowlists prevent shell injection.
- **Path Traversal Protection**: Export and storage paths are strictly bounded to asset directories.
- **Resource Limiting**: Redis-backed sliding-window rate limiting protects API endpoints.
- Vulnerability reports should be submitted to the project maintainers via GitHub Issues.

---

## 📚 Documentation Index

- [Product Vision & Architectural North Star](file:///teamspace/studios/this_studio/AI_Studio/Docs/PRODUCT_VISION.md)
- [3D Quality Pipeline Specification](file:///teamspace/studios/this_studio/AI_Studio/Docs/3D_QUALITY_PIPELINE.md)
- [Game-Ready Asset Specification](file:///teamspace/studios/this_studio/AI_Studio/Docs/GAME_READY_SPEC.md)
- [Quality Benchmark & Verification](file:///teamspace/studios/this_studio/AI_Studio/Docs/QUALITY_BENCHMARK.md)
- [Complete System Architecture & Blueprint](file:///teamspace/studios/this_studio/AI_Studio/Docs/SYSTEM-BLUEPRINT.md)
- [Architecture & Storage Guide](file:///teamspace/studios/this_studio/AI_Studio/Docs/architecture.md)
- [Complete REST API Documentation](file:///teamspace/studios/this_studio/AI_Studio/Docs/api-documentation.md)
- [Pipeline Status & Changelog](file:///teamspace/studios/this_studio/AI_Studio/Docs/pipeline-status.md)
- [Developer & Testing Guide](file:///teamspace/studios/this_studio/AI_Studio/Docs/developer-guide.md)
- [Setup & Deployment Guide](file:///teamspace/studios/this_studio/AI_Studio/Docs/setup-guide.md)

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](file:///teamspace/studios/this_studio/AI_Studio/LICENSE) file for details.
