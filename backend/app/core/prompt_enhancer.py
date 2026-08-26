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


async def enhance_prompt(prompt: str) -> str:
    if not settings.prompt_enhancement_enabled or not settings.openai_api_key:
        return prompt

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
            timeout=30.0,
        )
        enhanced = response.choices[0].message.content
        if enhanced:
            return enhanced.strip()
    except Exception as exc:
        logger.warning("Prompt enhancement failed: %s — using original", exc)

    return prompt
