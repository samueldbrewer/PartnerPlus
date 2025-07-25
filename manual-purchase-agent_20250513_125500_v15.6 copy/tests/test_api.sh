#!/bin/bash

echo "Testing Manual Purchase Agent API (v5)..."
echo "-----------------------------------------"

BASE_URL="http://localhost:7777"

echo ""
echo "1. Testing manual search API (Toyota Camry 2020)..."
curl -s -X POST "${BASE_URL}/api/manuals/search" \
    -H "Content-Type: application/json" \
    -d '{"make":"Toyota", "model":"Camry 2020", "manual_type":"technical"}' | \
    python -m json.tool

echo ""
echo "2. Testing supplier search API (17801-0H080 Toyota part)..."
curl -s -X POST "${BASE_URL}/api/suppliers/search" \
    -H "Content-Type: application/json" \
    -d '{"part_number":"17801-0H080", "make":"Toyota", "model":"Camry"}' | \
    python -m json.tool

echo ""
echo "3. Testing part resolution API..."
curl -s -X POST "${BASE_URL}/api/parts/resolve" \
    -H "Content-Type: application/json" \
    -d '{"description":"Air filter", "make":"Toyota", "model":"Camry", "year":"2020"}' | \
    python -m json.tool

echo ""
echo "4. Testing manual listing API..."
curl -s "${BASE_URL}/api/manuals?page=1&per_page=5" | \
    python -m json.tool

echo ""
echo "5. Testing parts listing API..."
curl -s "${BASE_URL}/api/parts?page=1&per_page=5" | \
    python -m json.tool

echo ""
echo "Tests completed!"