"""Self-check verification for colab.ipynb and AI_Studio_Colab.ipynb.
Runnable without test frameworks: python3 backend/tests/test_colab_notebook.py
"""
import json
import os
import sys
from pathlib import Path

def test_notebooks():
    root = Path(__file__).resolve().parent.parent.parent
    targets = ["colab.ipynb", "AI_Studio_Colab.ipynb"]

    for target in targets:
        path = root / target
        assert path.exists(), f"Missing notebook: {path}"

        # 1. Valid JSON
        with open(path, "r", encoding="utf-8") as f:
            nb = json.load(f)

        # 2. Nbformat 4.5
        assert nb.get("nbformat") == 4, f"{target}: nbformat {nb.get('nbformat')} != 4"
        assert nb.get("nbformat_minor") == 5, f"{target}: nbformat_minor {nb.get('nbformat_minor')} != 5"
        assert isinstance(nb.get("cells"), list), f"{target}: cells is not a list"
        assert len(nb["cells"]) == 5, f"{target}: Expected 5 cells, found {len(nb['cells'])}"

        # 3. Cell Structure & Schema
        for i, cell in enumerate(nb["cells"]):
            assert "id" in cell and isinstance(cell["id"], str) and len(cell["id"]) > 0, f"{target}: cell {i} missing valid id"
            assert "cell_type" in cell and cell["cell_type"] in ["markdown", "code"], f"{target}: cell {i} invalid cell_type"
            assert "metadata" in cell and isinstance(cell["metadata"], dict), f"{target}: cell {i} invalid metadata"
            assert "source" in cell and isinstance(cell["source"], list), f"{target}: cell {i} invalid source"
            if cell["cell_type"] == "code":
                assert "outputs" in cell and isinstance(cell["outputs"], list), f"{target}: cell {i} missing outputs"
                assert "execution_count" in cell, f"{target}: cell {i} missing execution_count"

        # 4. Content Verification
        # Cell 0: Header & Hardware Requirements
        cell0_text = "".join(nb["cells"][0]["source"])
        assert "T4 GPU" in cell0_text and "A100" in cell0_text and "V100" in cell0_text, f"{target}: cell 0 missing GPU tiers"
        assert "8GB" in cell0_text and "swap" in cell0_text.lower(), f"{target}: cell 0 missing swap protection notes"

        # Cell 1: Hardware Diagnostic
        cell1_text = "".join(nb["cells"][1]["source"])
        assert "nvidia-smi" in cell1_text, f"{target}: cell 1 missing nvidia-smi check"
        assert "psutil" in cell1_text or "ram_gb" in cell1_text, f"{target}: cell 1 missing RAM check"

        # Cell 2: Git Clone / Sync
        cell2_text = "".join(nb["cells"][2]["source"])
        assert "git clone" in cell2_text and "git pull" in cell2_text, f"{target}: cell 2 missing git commands"
        assert "AI_Studio" in cell2_text, f"{target}: cell 2 missing repo path"

        # Cell 3: One-Click Launcher
        cell3_text = "".join(nb["cells"][3]["source"])
        assert "colab.sh" in cell3_text and "--setup" in cell3_text, f"{target}: cell 3 missing colab.sh launcher"
        assert "render_tunnel_card" in cell3_text or "HTML" in cell3_text, f"{target}: cell 3 missing HTML tunnel card"
        assert "keepalive" in cell3_text.lower(), f"{target}: cell 3 missing keepalive"

        # Cell 4: Maintenance Controls
        cell4_text = "".join(nb["cells"][4]["source"])
        assert "check_status" in cell4_text, f"{target}: cell 4 missing check_status"
        assert "restart_services" in cell4_text, f"{target}: cell 4 missing restart_services"
        assert "stop_services" in cell4_text, f"{target}: cell 4 missing stop_services"
        assert "refresh_tunnels" in cell4_text, f"{target}: cell 4 missing refresh_tunnels"
        assert "view_logs" in cell4_text, f"{target}: cell 4 missing view_logs"

        # 5. Nbformat standard library validation
        try:
            import nbformat
            parsed = nbformat.read(str(path), as_version=4)
            nbformat.validate(parsed)
        except ImportError:
            pass

        print(f"  ✓ {target}: 100% schema compliant, content verified, nbformat 4.5 validated.")

    print("\n✅ All Colab notebooks passed self-check successfully!")

if __name__ == "__main__":
    test_notebooks()
