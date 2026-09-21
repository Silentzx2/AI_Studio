#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; WHITE='\033[1;37m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

log(){ printf "${GREEN}[SETUP]${NC} %s\n" "$*"; }
info(){ printf "${CYAN}[INFO]${NC}  %s\n" "$*"; }
warn(){ printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
fail(){ printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; exit 1; }
section(){ printf "\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n${WHITE}${BOLD}  %s${NC}\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n" "$*"; }

banner(){
  clear 2>/dev/null || true
  printf "${CYAN}"
  cat <<'ART'

 █████╗ ██╗     ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
██╔══██╗██║     ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
███████║██║     ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
██╔══██║██║     ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
██║  ██║██║     ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
╚═╝  ╚═╝╚═╝      ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝

                         3D GENERATIVE STUDIO
ART
  printf "${NC}\n"
}


require_commands(){
  section "Environment Check"
  local missing=()
  for cmd in git curl python3; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  if ((${#missing[@]})); then
    fail "Missing required commands: ${missing[*]}"
  fi
  log "Git: $(git --version)"
  log "Python: $(python3 --version 2>&1)"
  log "Curl: available"

  if command -v nvidia-smi >/dev/null 2>&1; then
    log "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)"
  else
    warn "nvidia-smi not found. 3D AI generation requires a compatible NVIDIA runtime."
  fi
}

ensure_bun_or_npm(){
  section "Frontend Toolchain"
  export PATH="$HOME/.bun/bin:$PATH"

  if command -v bun >/dev/null 2>&1; then
    log "Bun: $(bun --version)"
    return 0
  fi

  info "Bun not found. Installing Bun..."
  if curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1; then
    export PATH="$HOME/.bun/bin:$PATH"
  fi

  if command -v bun >/dev/null 2>&1; then
    log "Bun installed: $(bun --version)"
  elif command -v npm >/dev/null 2>&1; then
    warn "Bun unavailable; using npm fallback: $(npm --version)"
  else
    fail "Neither Bun nor npm is available. Install Node.js 20+ or Bun and rerun setup."
  fi
}

ensure_uv(){
  section "Python Toolchain"
  export PATH="$HOME/.local/bin:$PATH"
  if command -v uv >/dev/null 2>&1; then
    log "uv: $(uv --version)"
    return 0
  fi
  info "uv not found. Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null
  export PATH="$HOME/.local/bin:$PATH"
  command -v uv >/dev/null 2>&1 || fail "uv installation completed but uv is not on PATH."
  log "uv: $(uv --version)"
}

create_directories(){
  section "Preparing Project Directories"
  mkdir -p \
    "$PROJECT_ROOT/logs" \
    "$PROJECT_ROOT/.pids" \
    "$PROJECT_ROOT/backend/storage/uploads" \
    "$PROJECT_ROOT/backend/storage/models" \
    "$PROJECT_ROOT/backend/storage/thumbnails" \
    "$PROJECT_ROOT/backend/storage/exports" \
    "$PROJECT_ROOT/backend/storage/images" \
    "$PROJECT_ROOT/backend/.hf_cache/hub" \
    "$PROJECT_ROOT/backend/.runtime_cache" 

  # if [[ ! -f "$PROJECT_ROOT/.env" && -f "$PROJECT_ROOT/.env.example" ]]; then
  #   cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
  #   log "Created .env from .env.example"
  # fi

  log "Project runtime directories are ready."
}

install_frontend_deps(){
  section "Installing Frontend Dependencies"
  export PATH="$HOME/.bun/bin:$PATH"

  if command -v bun >/dev/null 2>&1; then
    bun install --frozen-lockfile || bun install
    log "Frontend dependencies installed with Bun."
  else
    npm ci || npm install
    log "Frontend dependencies installed with npm."
  fi
}

clone_third_party(){
  section "Cloning Required 3D Model Repositories"
  info "Target: backend/thirdparty"
  THIRD_PARTY_DIR="$PROJECT_ROOT/backend/thirdparty" bash "$PROJECT_ROOT/scripts/clone_thirdparty.sh"
  log "Third-party model repositories are ready."
}

install_backend(){
  section "Installing Backend Dependencies"
  # shellcheck disable=SC1091
  (
    cd "$PROJECT_ROOT/backend"
    bash scripts/install.sh
  )
  log "Backend dependency installation completed."
}

summary(){
  section "Setup Complete"
  printf "${WHITE}${BOLD}  AI 3D Studio is prepared.${NC}\n\n"
  printf "  ${DIM}Frontend:${NC}  http://localhost:3000\n"
  printf "  ${DIM}Backend:${NC}   http://localhost:7842\n"
  printf "  ${DIM}Docs:${NC}      http://localhost:7842/docs\n"
  printf "  ${DIM}Health:${NC}    http://localhost:7842/health\n\n"
  printf "  ${GREEN}Next:${NC} bash scripts/start.sh\n"
  printf "  ${GREEN}Stop:${NC} bash scripts/stop.sh\n"
  printf "  ${GREEN}Manage:${NC} bash manager.sh\n\n"
}

banner
printf "${WHITE}${BOLD}Setup overview${NC}\n"
printf "  This setup prepares the existing project in this order:\n"
printf "  01. Environment check\n"
printf "  02. Create runtime/storage directories\n"
printf "  03. Install frontend dependencies\n"
printf "  04. Prepare backend Python environment\n"
printf "  05. Run scripts/clone_thirdparty.sh\n"
printf "  06. Run backend/scripts/install.sh\n\n"


require_commands
ensure_bun_or_npm
ensure_uv
create_directories
install_frontend_deps
clone_third_party
install_backend
summary
