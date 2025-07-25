#!/usr/bin/env python3
import json
import subprocess

# Make the API call
result = subprocess.run([
    'curl', '-X', 'POST', 'http://localhost:7777/api/suppliers/search',
    '-H', 'Content-Type: application/json',
    '-d', '{"part_number": "00-917676", "make": "Hobart", "model": "A200"}'
], capture_output=True, text=True)

data = json.loads(result.stdout)
print(f'RESULTS: Found {data["count"]} suppliers')
print('='*50)

for i, s in enumerate(data['suppliers'], 1):
    price = s.get('price', 'None')
    scraped = s.get('price_scraped', False)
    
    if scraped and price != 'None':
        status = 'SCRAPED'
    elif price == 'None':
        status = 'NO PRICE'
    else:
        status = 'FROM SNIPPET'
    
    print(f'{i}. {s["name"]} - {price} - {status}')

print('='*50)
snippet_prices = sum(1 for s in data['suppliers'] if s.get('price') and not s.get('price_scraped'))
scraped_prices = sum(1 for s in data['suppliers'] if s.get('price') and s.get('price_scraped'))
print(f'From snippets: {snippet_prices} | Scraped: {scraped_prices} | Total with prices: {snippet_prices + scraped_prices}')