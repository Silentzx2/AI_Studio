
import subprocess
import sys


class DependencyResolver:
    def resolve_and_install(self, dependencies: list[dict], venv_path: str = None) -> bool:
        # In a real enterprise system, this would resolve conflicts.
        # Here we use uv pip install for dependency resolution.
        
        python_exec = sys.executable
        if venv_path:
            # Use the venv's python directly with uv
            python_exec = f"{venv_path}/bin/python"
            
        packages = []
        for dep in dependencies:
            name = dep.get("name")
            version = dep.get("version", "")
            packages.append(f"{name}{version}")
            
        if packages:
            try:
                subprocess.check_call([
                    "uv", "pip", "install",
                    "--python", python_exec,
                    *packages
                ])
                return True
            except subprocess.CalledProcessError as e:
                print(f"Failed to install dependencies: {e}")
                return False
        return True
