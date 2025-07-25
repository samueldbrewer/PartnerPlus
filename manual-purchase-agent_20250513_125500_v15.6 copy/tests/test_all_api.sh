#!/bin/bash

echo "Testing Manual Purchase Agent API (v5)"
echo "====================================="

BASE_URL="http://localhost:7777"

# Test manual search
echo -e "\n\nTesting manual search:"
curl -s -X POST "${BASE_URL}/api/manuals/search" \
  -H "Content-Type: application/json" \
  -d '{"make":"Toyota", "model":"Camry 2020", "manual_type":"technical"}' | python3 -m json.tool

# Test supplier search
echo -e "\n\nTesting supplier search:"
curl -s -X POST "${BASE_URL}/api/suppliers/search" \
  -H "Content-Type: application/json" \
  -d '{"part_number":"17801-0H080", "make":"Toyota", "model":"Camry"}' | python3 -m json.tool

# Test part resolution
echo -e "\n\nTesting part resolution:"
curl -s -X POST "${BASE_URL}/api/parts/resolve" \
  -H "Content-Type: application/json" \
  -d '{"description":"Air filter", "make":"Toyota", "model":"Camry", "year":"2020"}' | python3 -m json.tool

# List all manuals
echo -e "\n\nListing all manuals:"
curl -s "${BASE_URL}/api/manuals?page=1&per_page=5" | python3 -m json.tool

# List all suppliers
echo -e "\n\nListing all suppliers:"
curl -s "${BASE_URL}/api/suppliers?page=1&per_page=5" | python3 -m json.tool

# List all parts
echo -e "\n\nListing all parts:"
curl -s "${BASE_URL}/api/parts?page=1&per_page=5" | python3 -m json.tool

# Test profile creation
echo -e "\n\nTesting profile creation:"
curl -s -X POST "${BASE_URL}/api/profiles" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Profile",
    "billing_address": {
      "name": "John Doe",
      "address1": "123 Main St",
      "city": "Anytown",
      "state": "CA",
      "zip": "12345",
      "phone": "555-123-4567"
    },
    "payment_info": {
      "card_number": "4111111111111111",
      "name": "John Doe",
      "exp_month": "12",
      "exp_year": "2025",
      "cvv": "123"
    }
  }' | python3 -m json.tool

# List all profiles
echo -e "\n\nListing all profiles:"
curl -s "${BASE_URL}/api/profiles?page=1&per_page=5" | python3 -m json.tool

# Test purchase creation (assuming profile ID 1 exists)
echo -e "\n\nTesting purchase creation:"
curl -s -X POST "${BASE_URL}/api/purchases" \
  -H "Content-Type: application/json" \
  -d '{
    "part_number": "17801-0H080",
    "supplier_url": "https://www.example.com/parts/17801-0H080",
    "quantity": 1,
    "billing_profile_id": 1
  }' | python3 -m json.tool

# List all purchases
echo -e "\n\nListing all purchases:"
curl -s "${BASE_URL}/api/purchases?page=1&per_page=5" | python3 -m json.tool

echo -e "\n\nAPI tests completed!"