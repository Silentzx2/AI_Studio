"""API response utilities."""
from typing import Any


def success(data: Any, message: str = "Success") -> dict:
    return {"success": True, "message": message, "data": data, "errors": None}

def error(message: str, data: Any = None, errors: list | None = None) -> dict:
    return {"success": False, "message": message, "data": data, "errors": errors}
def paginated(items, page: int = 1, page_size: int = 10, total: int = 0):
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 100:
        page_size = 10
    return {
        "success": True,
        "data": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size if page_size else 0,
        },
    }
