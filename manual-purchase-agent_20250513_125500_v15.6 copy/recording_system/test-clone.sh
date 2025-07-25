#!/bin/bash

# Test the enhanced clone functionality with etundra.json
echo "=== Testing Enhanced Clone with Smart Actions ==="
echo "Target: Vulcan Hart Rack Support"
echo "Slow Motion: 5000ms"
echo ""

# Run the clone command with the specified URL and 5000ms slowMo
node index.js clone recordings/etundra.json \
  "https://www.etundra.com/restaurant-parts/cooking-equipment-parts/cheesemelter-parts/vulcan-hart-00-712378-00001-rack-support-cmj-guide/" \
  --dummy-values-file dummy_values.json \
  --vars '{"first_name":"Test","last_name":"User","company_name":"Test Company","email":"test@example.com","address":"123 Test St","city":"Test City","state":"California","state_abr":"CA","phone_number":"555-123-4567","zip_code":"90210"}' \
  --slow-mo 5000 \
  --no-wait

echo ""
echo "Test completed!"