#!/usr/bin/env bash

set -e

IMAGE_NAMES=(
    "AI Dev Container"
    "Soon..."
    "Soon..."
    "Soon..."
)

pause() {
    echo ""
    read -rp "Press Enter to continue..."
}

header() {
    clear
    echo "========================================="
    echo "        Docker Image Manager"
    echo "========================================="
    echo ""
}

ai_dev_menu() {
    while true; do
        header
        echo "Image : AI Dev Container"
        echo ""
        echo "1) Pull latest image"
        echo "2) Run container"
        echo "3) Open shell"
        echo "4) Save image (.tar)"
        echo "5) Remove local image"
        echo "6) Image information"
        echo ""
        echo "b) Back"
        echo ""

        read -rp "Choice: " choice

        case "$choice" in
            1)
                docker pull silentzx2/ai-dev:latest
                pause
                ;;
            2)
                docker run --rm -it \
                    --gpus all \

                    -v ~/.hermes:/root/.hermes \
                    -v "$(pwd)":/workspace \
                    --name ai-dev \
                    silentzx2/ai-dev:latest
                pause
                ;;
            3)
                docker exec -it ai-dev bash
                pause
                ;;
            4)
                docker save -o ai-dev.tar silentzx2/ai-dev:latest
                pause
                ;;
            5)
                docker rmi silentzx2/ai-dev:latest
                pause
                ;;
            6)
                docker image inspect silentzx2/ai-dev:latest
                pause
                ;;
            b|B)
                return
                ;;
            *)
                echo "Invalid option."
                sleep 1
                ;;
        esac
    done
}

while true; do
    header

    echo "Available Images"
    echo "----------------"

    for i in "${!IMAGE_NAMES[@]}"; do
        printf "%2d) %s\n" $((i+1)) "${IMAGE_NAMES[$i]}"
    done

    echo ""
    echo "b) Back"
    echo ""

    read -rp "Select Image: " image

    case "$image" in
        1)
            ai_dev_menu
            ;;
        2|3|4)
            echo ""
            echo "Coming Soon..."
            pause
            ;;
        b|B)
            exit 0
            ;;
        *)
            echo "Invalid option."
            sleep 1
            ;;
    esac
done