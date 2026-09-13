"""Game-ready post-processing — the point of Clay.

Raw AI meshes are unusable in games (500k-tri blobs, messy UVs). This turns them
into production-ready assets: decimate to a triangle budget, re-unwrap UVs, and
export in a real game format. Heavy geometry deps (trimesh/xatlas/…) are lazily
imported so the core stays light — install the ``postprocess`` extra to use it.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from clay.config import PostprocessConfig
from clay.schemas import Generated3DAsset


class PostProcessor:
    """Remesh/decimate → UV unwrap → export a game-ready asset."""

    def __init__(self, config: PostprocessConfig, blender_path: str = "") -> None:
        self.config = config
        self.blender_path = blender_path

    def process(self, asset: Generated3DAsset, out_path: str | None = None) -> Generated3DAsset:
        """Post-process a raw asset into a game-ready one.

        If the provider already produced a textured, budget-sized mesh (e.g.
        TRELLIS bakes a PBR texture onto its simplified mesh), preserve it and
        only enforce the export format — re-unwrapping/decimating would orphan
        the baked texture. Otherwise apply the full decimate → UV-unwrap path.
        """
        import trimesh

        mesh = trimesh.load(asset.path, force="mesh")
        ref_img = getattr(self.config, "reference_image", None)

        if not ref_img and getattr(asset, "textures", None):
            for t in asset.textures:
                if t.kind in ("reference_image", "base_color", "diffuse") and t.path and Path(t.path).exists():
                    ref_img = t.path
                    break

        if self._is_textured(mesh):
            final = mesh
        elif len(mesh.faces) > self.config.target_tris:
            final = self.decimate(mesh, self.config.target_tris)
            if self.config.unwrap_uvs and not ref_img:
                final = self.unwrap(final)
        else:
            final = mesh

        # Apply high-fidelity reference texture projection & tangent normal map if reference image is available
        if ref_img and Path(ref_img).exists():
            try:
                from app.core.texture_projection import project_reference_texture
                final = project_reference_texture(final, ref_img)
            except Exception:
                self._apply_angle_weighted_normals(final)
        else:
            self._apply_angle_weighted_normals(final)

        fmt = self.config.format
        out = Path(out_path) if out_path else Path(
            tempfile.mkdtemp(prefix="clay_post_")) / f"asset.{fmt}"
        self.export(final, out, fmt)

        return Generated3DAsset(
            path=str(out), format=fmt, triangles=int(len(final.faces)),
            provider=asset.provider, textures=asset.textures, raw_path=asset.path,
        )

    @staticmethod
    def _is_textured(mesh) -> bool:
        """True if the mesh already carries UVs + a real baked texture image."""
        try:
            from app.core.texture_projection import is_real_textured_mesh
            return is_real_textured_mesh(mesh)
        except Exception:
            pass

        visual = getattr(mesh, "visual", None)
        uv = getattr(visual, "uv", None)
        if uv is None or len(uv) == 0:
            return False
        material = getattr(visual, "material", None)
        image = getattr(material, "baseColorTexture", None) if material else None
        return image is not None and min(image.size) >= 64

    @staticmethod
    def _apply_angle_weighted_normals(mesh) -> None:
        """Apply angle-weighted vertex normals only if normals are missing or trivial."""
        try:
            existing = getattr(mesh, 'vertex_normals', None)
            if existing is not None and len(existing) == len(mesh.vertices):
                return  # Preserve authored/provider normals
            import trimesh
            wn = trimesh.geometry.weighted_vertex_normals(
                vertex_count=len(mesh.vertices),
                faces=mesh.faces,
                face_normals=mesh.face_normals,
                face_angles=mesh.face_angles,
            )
            mesh.vertex_normals = wn
        except Exception:
            pass  # Don't fall back to fix_normals() which flattens creases

    def decimate(self, mesh, target_tris: int):
        """Reduce triangle count to the budget. Preserves edge boundaries and sharp features."""
        if len(mesh.faces) <= target_tris:
            return mesh
        decimated = mesh.simplify_quadric_decimation(face_count=target_tris)
        self._apply_angle_weighted_normals(decimated)
        return decimated

    def unwrap(self, mesh):
        """Re-unwrap UVs with xatlas for clean, non-overlapping texture space."""
        # Skip re-unwrap if mesh already has valid UVs or vertex colors to avoid scrambling textures
        uv = getattr(getattr(mesh, 'visual', None), 'uv', None)
        if uv is not None and len(uv) > 0:
            return mesh
        import trimesh
        import xatlas

        vmapping, indices, uvs = xatlas.parametrize(mesh.vertices, mesh.faces)
        unwrapped = trimesh.Trimesh(
            vertices=mesh.vertices[vmapping], faces=indices,
            visual=trimesh.visual.TextureVisuals(uv=uvs), process=False,
        )
        if hasattr(mesh.visual, "material") and mesh.visual.material is not None:
            unwrapped.visual.material = mesh.visual.material
        self._apply_angle_weighted_normals(unwrapped)
        return unwrapped

    def export(self, mesh, out: Path, fmt: str) -> None:
        """Export to a game format. GLB/OBJ/PLY are native (trimesh); FBX via Blender."""
        out.parent.mkdir(parents=True, exist_ok=True)
        if fmt == "fbx":
            import tempfile

            from clay.blender.ops import export_fbx

            tmp = Path(tempfile.mkdtemp(prefix="clay_fbx_")) / "src.glb"
            mesh.export(str(tmp))
            export_fbx(tmp, out, blender=self.blender_path or None)
            return
        if fmt not in ("glb", "obj", "ply"):
            raise ValueError(f"unsupported format {fmt!r}; use glb | obj | ply | fbx")
        mesh.export(str(out))
