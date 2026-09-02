"""API endpoints for model discovery from various providers."""


from fastapi import APIRouter, Query

router = APIRouter(prefix="/discover", tags=["discover"])


@router.get("/models")
async def discover_models(
    category: str = Query("", description="Filter by category (e.g., '3d-generation', 'image-to-3d')"),
    provider: str = Query("", description="Filter by provider (huggingface, github, modelscope, civitai)"),
    search: str = Query("", description="Search term for model name/description"),
    limit: int = Query(50, ge=1, le=200, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination")
):
    """Discover available models from all configured providers."""
    
    from app.core.providers.registry import ProviderRegistry
    
    models = []
    errors = []
    
    # Determine which providers to query
    providers_to_query = ["huggingface", "github", "modelscope", "civitai"]
    
    if provider:
        if provider.lower() in providers_to_query:
            providers_to_query = [provider.lower()]
        else:
            return {
                "success": False,
                "error": f"Unknown provider: {provider}. Available: {providers_to_query}",
                "models": [],
                "count": 0
            }
    
    # Query each provider
    for provider_idx, provider_name in enumerate(providers_to_query):
        try:
            provider_obj = ProviderRegistry.get_provider(provider_name)
            
            if not provider_obj:
                continue
            
            provider_models = await provider_obj.list_models()
            
            # Apply filters
            if category:
                provider_models = [
                    m for m in provider_models 
                    if category.lower() in str(m.get("tags", [])).lower() or
                       category.lower() in str(m.get("category", "")).lower()
                ]
            
            if search:
                search_lower = search.lower()
                provider_models = [
                    m for m in provider_models 
                    if search_lower in str(m.get("name", "")).lower() or
                       search_lower in str(m.get("description", "")).lower() or
                       search_lower in str(m.get("id", "")).lower()
                ]
            
            # Add source info
            for model in provider_models:
                model["provider"] = provider_name
            
            # Distribute limit across providers (remainder to first providers)
            base, extra = divmod(limit, len(providers_to_query))
            per_provider_limit = base + (1 if provider_idx < extra else 0)
            models.extend(provider_models[:per_provider_limit])
            
        except Exception as e:
            errors.append({"provider": provider_name, "error": str(e)})
    
    # Sort by relevance (simple sort by name for now)
    if search:
        search_lower = search.lower()
        models.sort(
            key=lambda x: (
                0 if search_lower in str(x.get("name", "")).lower() else 1,
                x.get("name", "")
            )
        )
    
    # Apply pagination
    paginated_models = models[offset:offset + limit]
    
    response = {
        "success": True,
        "data": {
            "models": paginated_models,
            "count": len(paginated_models),
            "total": len(models),
            "offset": offset,
            "limit": limit
        }
    }
    
    if errors:
        response["warnings"] = errors
    
    return response


@router.get("/models/{model_id}")
async def get_model_info(
    model_id: str,
    provider: str = Query("huggingface", description="Provider to query")
):
    """Get detailed info for a specific model from a provider."""
    
    from app.core.providers.registry import ProviderRegistry
    
    try:
        provider_obj = ProviderRegistry.get_provider(provider)
        
        if not provider_obj:
            return {
                "success": False,
                "error": f"Provider '{provider}' not found or not configured"
            }
        
        model_info = await provider_obj.get_model(model_id)
        
        if not model_info:
            return {
                "success": False,
                "error": f"Model '{model_id}' not found on {provider}"
            }
        
        # Add provider info
        model_info["provider"] = provider
        
        return {"success": True, "data": model_info}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/providers")
async def list_providers():
    """List all available model providers and their status."""
    
    from app.core.providers.registry import ProviderRegistry
    
    try:
        registered_providers = ProviderRegistry.list_providers()
        
        providers_status = []
        
        for name in registered_providers:
            try:
                provider = ProviderRegistry.get_provider(name)
                
                status = {
                    "name": name,
                    "available": True,
                    "configured": bool(provider)
                }
                
                # Try to get additional info
                if hasattr(provider, 'get_info'):
                    info = await provider.get_info()
                    status.update(info)
                
                providers_status.append(status)
                
            except Exception as e:
                providers_status.append({
                    "name": name,
                    "available": False,
                    "error": str(e)
                })
        
        return {
            "success": True,
            "data": {
                "providers": providers_status,
                "count": len(providers_status)
            }
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/categories")
async def list_categories():
    """List available model categories across all providers."""
    
    # Return common categories
    categories = [
        {
            "id": "3d-generation",
            "name": "3D Generation",
            "description": "Models for generating 3D assets from images or text"
        },
        {
            "id": "image-to-3d",
            "name": "Image to 3D",
            "description": "Convert 2D images to 3D models"
        },
        {
            "id": "text-to-3d",
            "name": "Text to 3D",
            "description": "Generate 3D models directly from text descriptions"
        },
        {
            "id": "remeshing",
            "name": "Remeshing & Optimization",
            "description": "Optimize and remesh existing 3D models"
        },
        {
            "id": "texture-generation",
            "name": "Texture Generation",
            "description": "Generate textures for 3D models"
        },
        {
            "id": "upscaling",
            "name": "Upscaling",
            "description": "Upscale images or textures"
        },
        {
            "id": "inpainting",
            "name": "Inpainting",
            "description": "Fill missing or edit parts of images"
        }
    ]
    
    return {
        "success": True,
        "data": {
            "categories": categories,
            "count": len(categories)
        }
    }


@router.get("/featured")
async def get_featured_models(limit: int = Query(10, ge=1, le=50)):
    """Get featured/recommended models."""
    
    # Return curated list of featured models
    featured = [
        {
            "id": "hunyuan3d",
            "name": "Hunyuan3D",
            "provider": "internal",
            "category": "image-to-3d",
            "description": "High-quality image-to-3D generation model by Tencent",
            "tags": ["featured", "recommended", "production-ready"],
            "capabilities": ["image-to-3d", "high-quality", "texture-generation"],
            "min_vram_mb": 8192,
            "difficulty": "intermediate"
        },
        {
            "id": "trellis",
            "name": "Trellis",
            "provider": "internal",
            "category": "text-to-3d",
            "description": "Fast text-to-3D generation with good quality",
            "tags": ["featured", "fast", "easy-to-use"],
            "capabilities": ["text-to-3d", "fast-inference"],
            "min_vram_mb": 6144,
            "difficulty": "beginner"
        },
        {
            "id": "instant-mesh",
            "name": "Instant Mesh",
            "provider": "internal",
            "category": "image-to-3d",
            "description": "Quick mesh generation with good topology",
            "tags": ["featured", "good-topology"],
            "capabilities": ["image-to-3d", "mesh-generation"],
            "min_vram_mb": 6144,
            "difficulty": "intermediate"
        }
    ]
    
    return {
        "success": True,
        "data": {
            "models": featured[:limit],
            "count": min(len(featured), limit)
        }
    }
