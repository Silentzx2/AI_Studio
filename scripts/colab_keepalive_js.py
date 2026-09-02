"""Colab keep-alive: simulate periodic user activity so the notebook's idle
cleanup does not kill the background services started by colab.sh.

Run this in a Colab notebook CELL (not from inside !bash):

    exec(open('scripts/colab_keepalive_js.py').read())

Colab terminates background processes (nohup/&) a few minutes after the
cell that started them finishes and the notebook goes idle. The only
reliable keep-alive is browser-side JS that dispatches synthetic
mouse/keyboard events, which keeps the notebook "active" from Colab's
point of view.

This script is intentionally dependency-free and idempotent: running it
multiple times just resets the interval.
"""
from __future__ import annotations

try:
    from IPython.display import Javascript, display
except Exception as exc:  # pragma: no cover - only reachable outside a notebook
    raise RuntimeError(
        "colab_keepalive_js.py must be run inside a Colab notebook cell, "
        "not from a shell. Use: exec(open('scripts/colab_keepalive_js.py').read())"
    ) from exc

KEEPALIVE_JS = """
(function(){
    // Clear any previous interval so re-running the cell is idempotent.
    if (window.__AI_STUDIO_KEEPALIVE__) {
        clearInterval(window.__AI_STUDIO_KEEPALIVE__);
    }
    // Dispatch synthetic events every 45s — well under Colab's idle timeout.
    window.__AI_STUDIO_KEEPALIVE__ = setInterval(function(){
        try { document.body.dispatchEvent(new MouseEvent('click', {bubbles:true})); } catch(e){}
        try { document.dispatchEvent(new KeyboardEvent('keydown', {key:' ', bubbles:true})); } catch(e){}
        try { document.dispatchEvent(new MouseEvent('mousemove', {bubbles:true})); } catch(e){}
    }, 45000);
    console.log('[keepalive] AI 3D Studio keep-alive active (45s interval)');
})();
"""

display(Javascript(KEEPALIVE_JS))
print("[keepalive] Browser keep-alive active — services will survive Colab idle cleanup.")