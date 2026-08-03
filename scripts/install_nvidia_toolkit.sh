#!/usr/bin/env bash
# ==========================================================
# AI 3D Studio
# NVIDIA Container Toolkit Installer
# Official NVIDIA Installation
# ==========================================================

set -Eeuo pipefail

GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
NC="\033[0m"

echo ""
echo "==============================================="
echo " AI 3D Studio - NVIDIA Toolkit Installer"
echo "==============================================="
echo ""

run() {
    if [ "$EUID" -ne 0 ]; then
        sudo "$@"
    else
        "$@"
    fi
}

error() {
    echo ""
    echo -e "${RED}ERROR:${NC} $1"
    exit 1
}

echo -e "${CYAN}[1/8] Checking NVIDIA Driver...${NC}"

command -v nvidia-smi >/dev/null 2>&1 || error "NVIDIA Driver not installed."

nvidia-smi

echo ""
echo -e "${GREEN}✓ NVIDIA Driver detected${NC}"

echo ""
echo -e "${CYAN}[2/8] Checking Docker...${NC}"

command -v docker >/dev/null 2>&1 || error "Docker is not installed."

echo -e "${GREEN}✓ Docker detected${NC}"

echo ""
echo -e "${CYAN}[3/8] Cleaning previous broken NVIDIA repository...${NC}"

run rm -f /etc/apt/sources.list.d/nvidia-container-toolkit.list
run rm -f /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

echo ""
echo -e "${CYAN}[4/8] Installing dependencies...${NC}"

run apt-get update

run apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg2

echo ""
echo -e "${CYAN}[5/8] Adding NVIDIA Repository...${NC}"

run mkdir -p /usr/share/keyrings

curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
| run gpg --dearmor \
-o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -fsSL \
https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
| sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
| run tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null

echo ""
echo "Validating repository..."

if ! grep -q "^deb " /etc/apt/sources.list.d/nvidia-container-toolkit.list; then
    cat /etc/apt/sources.list.d/nvidia-container-toolkit.list
    error "Repository file is invalid (HTML or empty received)."
fi

echo -e "${GREEN}✓ Repository OK${NC}"

echo ""
echo -e "${CYAN}[6/8] Installing NVIDIA Container Toolkit...${NC}"

run apt-get update

run apt-get install -y nvidia-container-toolkit

echo ""
echo -e "${CYAN}Configuring Docker runtime...${NC}"

run nvidia-ctk runtime configure --runtime=docker

run systemctl restart docker

echo ""
echo -e "${CYAN}[7/8] Verifying Docker GPU Access...${NC}"

if docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker GPU runtime working${NC}"
else
    echo -e "${RED}ERROR: Docker cannot access GPU.${NC}"
    echo "Try: sudo systemctl restart docker"
    echo "Then: docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi"
    exit 1
fi

echo ""
echo -e "${CYAN}[8/8] Final Validation...${NC}"

docker info | grep -qi nvidia || \
echo -e "${YELLOW}Warning:${NC} NVIDIA runtime not shown in docker info."

echo ""
echo "==============================================="
echo -e "${GREEN} NVIDIA Container Toolkit Installed Successfully ${NC}"
echo "==============================================="
echo ""