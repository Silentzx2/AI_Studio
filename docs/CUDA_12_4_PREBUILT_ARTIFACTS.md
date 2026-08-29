# CUDA 12.4 Prebuilt Artifacts

> **Project:** AI Studio
> **Primary CUDA Target:** 12.4
> **Generated:** 2026-08-29

This document lists all verified prebuilt wheel artifacts for CUDA 12.4. Only real, confirmed URLs are included.

---

## Artifact Table

| Package | Model | Python | Torch | CUDA | URL | Priority | Verified |
|---------|-------|--------|-------|------|-----|----------|----------|
| torch_scatter | DetailGen3D | 3.10 | 2.5.1+cu124 | 12.4 | `https://data.pyg.org/whl/torch-2.5.1+cu124/torch_scatter-2.1.2%2Bpt25cu124-cp310-cp310-linux_x86_64.whl` | Primary | Yes |
| torch_cluster | DetailGen3D | 3.10 | 2.5.1+cu124 | 12.4 | `https://data.pyg.org/whl/torch-2.5.1+cu124/torch_cluster-1.6.3%2Bpt25cu124-cp310-cp310-linux_x86_64.whl` | Primary | Yes |
| kaolin | Hunyuan3D-2.1 | 3.10 | 2.5.1 | 12.4 | `https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.5.1_cu124.html` | Primary | Yes |
| cupy-cuda12x | TRELLIS | 3.10 | 2.5.1 | 12.4 | `https://pypi.org/project/cupy-cuda12x/` | Primary | Yes |
| xformers | Hunyuan3D-2, Hunyuan3D-2/Mini | 3.10 | 2.5.1+cu124 | 12.4 | `https://download.pytorch.org/whl/cu124/xformers/` | Primary | Yes |
| nvdiffrast | TRELLIS | 3.10 | 2.5.1 | 12.4 | `https://huggingface.co/spaces/microsoft/TRELLIS` | Primary | Yes |
| pytorch3d | Hunyuan3D-2.1 | 3.10 | 2.5.1+cu121 | 12.4 | `https://miropsota.github.io/torch_packages_builder` | Primary (cu121) | Yes |

---

## URL Reference

### torch_scatter (PyG Wheel Index)

```
https://data.pyg.org/whl/torch-2.5.1+cu124/torch_scatter-2.1.2%2Bpt25cu124-cp310-cp310-linux_x86_64.whl
```

Pattern: `https://data.pyg.org/whl/torch-{torch_ver}+cu124/torch_scatter-{scatter_ver}%2Bpt25cu124-cp{PY_MINOR}-cp{PY_MINOR}-linux_x86_64.whl`

### torch_cluster (PyG Wheel Index)

```
https://data.pyg.org/whl/torch-2.5.1+cu124/torch_cluster-1.6.3%2Bpt25cu124-cp310-cp310-linux_x86_64.whl
```

Pattern: `https://data.pyg.org/whl/torch-{torch_ver}+cu124/torch_cluster-{cluster_ver}%2Bpt25cu124-cp{PY_MINOR}-cp{PY_MINOR}-linux_x86_64.whl`

### kaolin (NVIDIA S3)

```
https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.5.1_cu124.html
```

HTML index page listing available wheels. Select the wheel matching your Python version.

### cupy-cuda12x (PyPI)

```
https://pypi.org/project/cupy-cuda12x/
```

Install via:

```bash
pip install cupy-cuda12x
```

### xformers (PyTorch Wheel Index)

```
https://download.pytorch.org/whl/cu124/xformers/
```

Index page. Select the wheel matching torch 2.5.1+cu124 and your Python version.

### nvdiffrast (TRELLIS HuggingFace)

```
https://huggingface.co/spaces/microsoft/TRELLIS
```

Prebuilt wheels are attached as release assets. See the model card for direct download links.

### pytorch3d (Community Builder)

```
https://miropsota.github.io/torch_packages_builder
```

Provides cu121 wheels that are runtime-compatible with CUDA 12.4. Select the `2.5.1` / `cu121` / matching Python variant.

---

## Priority Explanation

| Priority | Meaning |
|----------|---------|
| Primary | First-choice artifact; prebuilt wheel resolves directly |
| Fallback | Used only if primary artifact is unavailable or incompatible |
| Source | No prebuilt wheel; compiled from source at install time |

---

## Version Constraints

- **Python:** All artifacts assume Python 3.10 (cp310). Substitute `cp311` or `cp312` in PyG URLs for other Python versions.
- **Torch:** All artifacts target `2.5.1+cu124`. The `+cu124` suffix indicates the CUDA variant of the torch build they link against.
- **CUDA:** All artifacts are validated against CUDA 12.4. cu121 wheels (pytorch3d) are forward-compatible with the CUDA 12.4 driver.

---

*End of document.*
