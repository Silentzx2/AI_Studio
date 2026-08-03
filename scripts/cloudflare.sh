#!/usr/bin/env bash

set -euo pipefail

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
BLUE="\033[0;34m"
NC="\033[0m"

# Directory to store tunnel PID/URL/log files
# ponytail: single flat dir is enough; no need for a DB or registry
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.cloudflare_tunnels"
mkdir -p "$DIR"

install_cf() {
    if command -v cloudflared > /dev/null 2>&1; then
        echo -e "${GREEN}✓ cloudflared already installed${NC}"
        return
    fi

    echo "Installing cloudflared..."

    # dpkg --print-architecture matches cloudflared release naming (amd64, arm64)
    local ARCH; ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
    local DEB="/tmp/cloudflared-$$.deb"
    if ! wget -q "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -O "$DEB"; then
        echo -e "${RED}ERROR: Failed to download cloudflared (arch: $ARCH)${NC}"
        rm -f "$DEB"
        return 1
    fi
    sudo dpkg -i "$DEB"
    rm -f "$DEB"

    echo -e "${GREEN}✓ Installed${NC}"
}

create_tunnel() {

    read -rp "Port: " PORT

    [[ ! "$PORT" =~ ^[0-9]+$ ]] && {
        echo "Invalid Port"
        return
    }

    if [ -f "$DIR/$PORT.pid" ] && kill -0 "$(cat "$DIR/$PORT.pid")" 2>/dev/null; then
        echo "Tunnel already running."
        return
    fi

    echo "Starting tunnel..."

    nohup cloudflared tunnel \
        --url "http://localhost:$PORT" \
        --no-autoupdate \
        >"$DIR/$PORT.log" 2>&1 &

    PID=$!
    echo "$PID" > "$DIR/$PORT.pid"

    sleep 5

    URL=$(grep -o 'https://[-a-zA-Z0-9]*\.trycloudflare\.com' "$DIR/$PORT.log" | head -1)

    if [ -n "$URL" ]; then
        echo "$URL" > "$DIR/$PORT.url"
        echo
        echo -e "${GREEN}✓ Tunnel Started${NC}"
        echo "Port : $PORT"
        echo "URL  : $URL"
    else
        echo "Tunnel started but URL not ready."
    fi
}

list_tunnels() {

    echo
    printf "%-8s %-10s %s\n" "PORT" "STATUS" "URL"
    echo "----------------------------------------------"

    shopt -s nullglob

    for f in "$DIR"/*.pid; do

        PORT=$(basename "$f" .pid)
        PID=$(cat "$f")

        if kill -0 "$PID" 2>/dev/null; then
            STATUS="Running"
        else
            STATUS="Stopped"
        fi

        URL="-"
        [ -f "$DIR/$PORT.url" ] && URL=$(cat "$DIR/$PORT.url")

        printf "%-8s %-10s %s\n" "$PORT" "$STATUS" "$URL"
    done

    shopt -u nullglob
}

stop_tunnel() {

    read -rp "Port: " PORT

    if [ ! -f "$DIR/$PORT.pid" ]; then
        echo "Tunnel not found."
        return
    fi

    PID=$(cat "$DIR/$PORT.pid")

    kill "$PID" 2>/dev/null || true

    rm -f "$DIR/$PORT.pid"

    echo -e "${GREEN}✓ Tunnel Stopped${NC}"
}

delete_tunnel() {

    read -rp "Port: " PORT

    [ -f "$DIR/$PORT.pid" ] && kill "$(cat "$DIR/$PORT.pid")" 2>/dev/null || true

    rm -f \
        "$DIR/$PORT.pid" \
        "$DIR/$PORT.url" \
        "$DIR/$PORT.log"

    echo -e "${GREEN}✓ Tunnel Deleted${NC}"
}

while true; do

clear

echo -e "${BLUE}"
echo "================================="
echo " Cloudflare Tunnel Manager"
echo "================================="
echo -e "${NC}"

echo "1. Install Cloudflared"
echo "2. Create Tunnel"
echo "3. List Tunnels"
echo "4. Stop Tunnel"
echo "5. Delete Tunnel"
echo "6. Exit"

echo
read -rp "Choose: " CH

case "$CH" in

1) install_cf ;;
2) create_tunnel ;;
3) list_tunnels ;;
4) stop_tunnel ;;
5) delete_tunnel ;;
6) exit ;;

*) echo "Invalid Option" ;;

esac

echo
read -rp "Press Enter..."

done
