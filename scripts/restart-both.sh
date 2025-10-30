#!/usr/bin/env bash
set -euo pipefail
<<<<<<< HEAD
cd /root/proyecto-taller
echo "[1/2] (prod) up -d"
docker compose -p taller-prod -f docker-compose.yml up -d
echo "[2/2] (dev) up -d"
docker compose -p taller-dev -f docker-compose.dev.yml up -d
echo "OK. Estado:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
=======

cd /root/proyecto-taller

echo "[1/2] (prod) up -d"
docker compose -p taller-prod -f docker-compose.yml up -d

echo "[2/2] (dev) up -d"
docker compose -p taller-dev -f docker-compose.dev.yml up -d

echo "OK. Estado:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"


>>>>>>> b4a9792452408761de00104e57996b999693e0f9
