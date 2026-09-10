"""
Uses OpenAI (GPT) to expand and improve user prompts for better 3D generation results.
Falls back to the original prompt if OpenAI is unavailable or disabled.
"""
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_SYSTEM_PROMPT = """You are an expert at writing prompts for AI 3D model generation.
Your task is to take a user's brief description and expand it into a detailed, high-quality
prompt that will produce the best possible 3D model.

Guidelines:
- Add specific material details (metallic, rough, worn, smooth, etc.)
- Include lighting and surface quality descriptions
- Add geometric detail hints (beveled edges, rounded corners, sharp features, etc.)
- Keep it focused on physical, visual properties — not story or context
- Output only the improved prompt, nothing else
- Maximum 200 words"""


def heuristic_enhance_prompt(prompt: str) -> str:
    """Enhance a 3D generation prompt using high-impact 3D domain descriptors (Meshy/Tripo AI style)."""
    p = prompt.strip()
    if not p:
        return p
    lower = p.lower()
    modifiers = []
    if not any(k in lower for k in ("topology", "quad", "mesh", "geometry", "poly")):
        modifiers.append("clean quad topology, manifold geometry")
    if not any(k in lower for k in ("texture", "material", "pbr", "albedo", "metallic", "roughness")):
        modifiers.append("high-fidelity PBR textures, physically based rendering")
    if not any(k in lower for k in ("light", "studio", "shadow", "ambient")):
        modifiers.append("studio lighting, ambient occlusion, crisp detail")
    if not any(k in lower for k in ("game-ready", "asset", "production", "cinematic", "model")):
        modifiers.append("production-ready 3D asset")

    if modifiers:
        return f"{p}, {', '.join(modifiers)}"
    return p


async def enhance_prompt(prompt: str) -> str:
    """Enhance prompt via OpenAI if configured; otherwise use 3D domain heuristics."""
    if not prompt or not prompt.strip():
        return prompt

    if settings.prompt_enhancement_enabled and settings.openai_api_key:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=300,
                temperature=0.7,
                timeout=15.0,
            )
            enhanced = response.choices[0].message.content
            if enhanced and enhanced.strip():
                return enhanced.strip()
        except Exception as exc:
            logger.warning("Prompt enhancement via OpenAI failed: %s — falling back to heuristics", exc)

    return heuristic_enhance_prompt(prompt)

