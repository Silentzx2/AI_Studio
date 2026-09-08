# 🏛️ AI 3D Studio

<p align="center">
  <img src="https://i.postimg.cc/2ScFBzgs/file-000000006864720bb59405440766bb68-2.jpg" alt="AI 3D Studio Banner" width="100%">
</p>

<p align="center">
  <strong>Production-Grade AI 3D Generation, Optimization & Game-Ready Asset Pipeline</strong><br>
  Neural Reconstruction • Safe Post-Processing • Multi-Tier LODs • Physics Colliders • Automated QA • Multi-Format Export
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-5.0.18-8A2BE2?style=for-the-badge" alt="Version 5.0.18">
  <img src="https://img.shields.io/badge/Pipeline-Game--Ready_V2-00FF9D?style=for-the-badge" alt="Game-Ready V2">
  <img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.12+">
  <img src="https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Next.js-16.x-Frontend-000000?style=for-the-badge&logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/Blender-4.x_Headless-F5792A?style=for-the-badge&logo=blender&logoColor=white" alt="Blender 4.x">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License MIT">
</p>

---

## ⚡ Overview

**AI 3D Studio** is an open-source generative 3D asset factory. It bridges state-of-the-art neural shape and texture synthesis models (**Hunyuan3D-2.1**, **Hunyuan3D-2 Mini**, **TRELLIS**, **TripoSG**) with a non-destructive production pipeline that preserves raw master geometry while generating engine-compliant game assets with automated Level-of-Detail (LOD) cascades, physics collision hulls, and objective QA validation scores.

---

## 🏗️ System Architecture

```mermaid
graph TB
    subgraph Client["Presentation & Workspace (Next.js 16 + Three.js)"]
        UI_VIEW["Interactive 3D Viewport<br/>(WebGL / OrbitControls / Matcaps)"]
        UI_GEN["Generate Panel<br/>(Platform Budgets & LOD Cascade)"]
        UI_EXP["Export Engine Modal<br/>(Variants, Conversions & ZIP Packaging)"]
    end

    subgraph API["Backend Gateway (FastAPI 0.115 / AsyncIO)"]
        ROUTER_GEN["/api/v1/generation"]
        ROUTER_EXP["/api/v1/project/export"]
        ROUTER_MODELS["/api/v1/models"]
        CACHE["In-Memory TTL & LRU Caches"]
    end

    subgraph Queue["Asynchronous Task Broker"]
        REDIS[("Redis :6379<br/>Task Queue & Locks")]
        CELERY["Celery Workers<br/>(Concurrency & GPU Slots)"]
    end

    subgraph Runtime["Runtime Engine & Provider Isolation"]
        SCHED["GPU Scheduler<br/>(Mutual Exclusion Slot)"]
        VRAM["VRAM Tracker & Low-VRAM Offload"]
        ENV["Dynamic ModelEnv Site-Packages Bridge"]
    end

    subgraph Providers["Generative AI Models"]
        HY21["Hunyuan3D-2.1 (Shape + Paint)"]
        HYMINI["Hunyuan3D-2 Mini (Fast DiT)"]
        TREL["TRELLIS (FlexiCubes PBR)"]
        TSG["TripoSG (Isosurface)"]
    end

    subgraph Pipeline["3D Quality Pipeline & Post-Processing"]
        BLENDER["Headless Blender 4.x<br/>(Safe Component Retention & UV Guard)"]
        OPT["Mesh Optimizer<br/>(Target Decimation & LOD0–LOD3)"]
        COL["Physics Collision<br/>(Convex Hull Generator)"]
        QA["QA Diagnostics<br/>(Topology & 0–100 Scoring)"]
    end

    subgraph Output["Production Asset Delivery"]
        MASTER["source.glb (Untouched Master)"]
        GAME["game_ready.glb (Engine Optimized)"]
        LODS["lods/lod0..3.glb (LOD Cascade)"]
        HULL["collision.glb (Physics Collider)"]
        ZIP["Structured ZIP Package"]
    end

    Client <==>|REST / SSE / WS| API
    API --> REDIS
    REDIS --> CELERY
    CELERY --> Runtime
    Runtime --> Providers
    Providers --> Pipeline
    Pipeline --> Output
    Output --> Client
```

---

## 🔄 3D Quality Pipeline Workflow

```mermaid
flowchart TD
    classDef stage fill:#1e1e24,stroke:#6366f1,stroke-width:2px,color:#fff;
    classDef file fill:#18181b,stroke:#22c55e,stroke-width:1.5px,color:#fff;
    classDef guard fill:#18181b,stroke:#f59e0b,stroke-width:1.5px,color:#fff;

    IN[Input Image / Prompt] --> P1[1. Preprocessing & Background Separation<br/>• Transparent alpha detection<br/>• RemBG / BriaRMBG silhouette extraction]:::stage
    
    P1 --> P2[2. Neural Provider Inference<br/>• Hunyuan3D / TRELLIS / TripoSG]:::stage
    
    P2 --> RAW[(source.glb<br/>Untouched Raw Master)]:::file

    P2 --> P3[3. Non-Destructive Blender Post-Processing]:::stage
    
    P3 --> G1{Safe Component Guard<br/>Islands ≥ 0.5% vertices or ≥ 15 verts?}:::guard
    G1 -->|Yes| KEEP[Preserve Ears, Horns, Tails & Accessories]
    G1 -->|No| PRUNE[Purge Floating Disconnected Noise]

    P3 --> G2{UV Layout Guard<br/>UV layers already exist?}:::guard
    G2 -->|Yes| UV_OK[Protect Provider UV Map & PBR Textures]
    G2 -->|No| UV_FIX[Run Smart UV Project]

    P3 --> G3{Humanoid Armature Guard<br/>Aspect Ratio ≥ 0.7 & Height ≥ 0.2?}:::guard
    G3 -->|Yes| RIG[Bind Rigify Biped Metarig]
    G3 -->|No| NORIG[Export Clean Unrigged Mesh]

    KEEP --> BASE[(model.glb<br/>Clean Baseline)]:::file
    UV_OK --> BASE
    UV_FIX --> BASE
    RIG --> BASE
    NORIG --> BASE

    BASE --> P4[4. Game-Ready Decimation<br/>• Target Platform Budgets]:::stage
    P4 --> G_OUT[(game_ready.glb<br/>Game-Ready Variant)]:::file

    BASE --> P5[5. Multi-Tier LOD Generation]:::stage
    P5 --> L0[(LOD0: 100% Master)]:::file
    P5 --> L1[(LOD1: 50% Polycount)]:::file
    P5 --> L2[(LOD2: 25% Polycount)]:::file
    P5 --> L3[(LOD3: 12.5% Polycount)]:::file

    BASE --> P6[6. Physics Collision Mesh]:::stage
    P6 --> C_OUT[(collision.glb<br/>Convex Hull)]:::file

    G_OUT --> P7[7. Geometry QA Diagnostics]:::stage
    P7 --> QA_OUT[(quality_report.json<br/>Score: 0–100)]:::file

    G_OUT --> P8[8. Production Export Endpoint<br/>• POST /api/v1/project/export]:::stage
    RAW --> P8
    L0 --> P8
    L1 --> P8
    L2 --> P8
    L3 --> P8
    C_OUT --> P8
    QA_OUT --> P8

    P8 --> ZIP[(Structured ZIP Package<br/>Source/ + GameReady/ + LODs/ + Collision/ + QA/)]:::file
```

---

## 🎯 Target Platform Polygon Budgets

Game-ready decimation adheres to platform-specific polygon targets:

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

---

## 📊 Automated QA Validation Rubric (0–100)

Every generated asset undergoes an objective evaluation producing a composite score:

```mermaid
pie title QA Score Weighting Distribution (100 Points Total)
    "Topology & Geometry Integrity" : 35
    "UV Mapping & Material Retention" : 35
    "Platform Polycount Budget" : 30
```

- **Topology & Geometry (35 pts)**: Base non-zero geometry (+15), normal winding consistency (+10), watertight manifoldness (+5), clean component count (+5).
- **UVs & Materials (35 pts)**: Valid non-overlapping UV layout (+20), embedded PBR/Albedo texture map (+15).
- **Platform Budget (30 pts)**: Adherence to chosen target polycount (≤ 1.0x budget: +30, 1.0–1.5x: +20, 1.5–2.5x: +10).

| Status | Score Range | Engine Compatibility |
|---|---|---|
| 🟢 **PASS** | 80 – 100 | Ready for direct drag-and-drop into Unreal Engine, Unity, or Godot. |
| 🟡 **WARN** | 50 – 79 | Usable geometry with minor warnings (e.g. untextured mesh or slight budget overage). |
| 🔴 **FAIL** | < 50 | Requires re-generation or automated mesh repair. |

---

## 📦 Structured Export Architecture

When exporting via `POST /api/v1/project/export` with `package_zip=true`, the download is packaged into a structured game-ready archive:

```
Hero_Character.zip
├── Source/
│   └── source.glb            # Byte-for-byte untouched raw neural output
├── GameReady/
│   └── Hero_Character.glb    # Platform-optimized engine asset
├── LODs/
│   ├── lod0.glb              # 100% master fidelity
│   ├── lod1.glb              # 50% decimation
│   ├── lod2.glb              # 25% decimation
│   └── lod3.glb              # 12.5% distant proxy
├── Collision/
│   └── collision.glb         # Lightweight convex hull collider
└── QA/
    └── quality_report.json   # Machine-readable diagnostics & QA scores
```

---

## 🤖 Supported Model Catalog

| Provider | Category | VRAM Footprint | Output Format | Texture Pipeline |
|---|---|---|---|---|
| **Hunyuan3D-2.1** | 3D Shape & Texture | ~16 GB (8 GB low-VRAM) | Quad/Tri mesh | Multi-view neural paint diffusion |
| **Hunyuan3D-2 Mini** | Fast 3D Shape | ~6 GB | Triangle mesh | Front-projection fallback / paint PBR |
| **TRELLIS** | Structured 3D | ~16 GB (8 GB low-VRAM) | FlexiCubes mesh | Native PBR textures & materials |
| **TripoSG** | Fast Single-Image | ~6 GB | Isosurface mesh | High-fidelity vertex colors |
| **DetailGen3D** | Post-Processing | ~4 GB | Normal & displacement | Second-pass geometry refinement |

---

## 🚀 Quick Start

### 1. Local Development (Ubuntu 20.04/22.04/24.04 with NVIDIA GPU)

```bash
# Clone the repository
git clone https://github.com/Silentzx2/AI_Studio.git
cd AI_Studio

# Run automated system setup (installs Python 3.12, PyTorch CUDA, Blender 4.x, and dependencies)
sudo bash scripts/setup.sh

# Start application services (Backend :8000, Frontend :3000, Celery & Redis)
bash scripts/start.sh
```

### 2. Google Colab 1-Click Launch

Open a free or Pro Google Colab instance with T4/V100/A100 GPU and execute:

```bash
!git clone https://github.com/Silentzx2/AI_Studio.git /content/AI_Studio
%cd /content/AI_Studio
!bash scripts/colab.sh
```

The script configures the environment, starts all services, and prints a secure Cloudflare tunnel URL for instant browser access.

---

## 📚 Documentation Index

- [Architecture & Storage Guide](file:///teamspace/studios/this_studio/AI_Studio/Docs/architecture.md)
- [Complete REST API Documentation](file:///teamspace/studios/this_studio/AI_Studio/Docs/api-documentation.md)
- [Pipeline V2 Status & Changelog](file:///teamspace/studios/this_studio/AI_Studio/Docs/pipeline-status.md)
- [Developer & Testing Guide](file:///teamspace/studios/this_studio/AI_Studio/Docs/developer-guide.md)
- [System Architecture Blueprint](file:///teamspace/studios/this_studio/AI_Studio/Docs/SYSTEM-BLUEPRINT.md)
- [3D Quality Pipeline Specification](file:///teamspace/studios/this_studio/AI_Studio/PLANS/3D_QUALITY_PIPELINE.md)
- [Game-Ready Asset Specification](file:///teamspace/studios/this_studio/AI_Studio/PLANS/GAME_READY_SPEC.md)
- [Quality Benchmark & Verification](file:///teamspace/studios/this_studio/AI_Studio/PLANS/QUALITY_BENCHMARK.md)
- [Root Cause Diagnostic Report](file:///teamspace/studios/this_studio/AI_Studio/PLANS/ROOT_CAUSE_REPORT.md)

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](file:///teamspace/studios/this_studio/AI_Studio/LICENSE) file for details.
