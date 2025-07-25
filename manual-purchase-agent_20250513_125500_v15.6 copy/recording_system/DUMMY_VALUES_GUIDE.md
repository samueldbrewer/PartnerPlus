# Dummy Values Guide for Recording Sessions

When recording a new e-commerce site session, use these exact dummy values from `dummy_values.json`. The playwright-recorder will search for these specific values during playback and replace them with real customer data.

## Shipping Information
- **First Name**: Test
- **Last Name**: User
- **Company**: Test Company
- **Email**: test@example.com
- **Phone**: 555-555-5555
- **Address Line 1**: 1200 Greenbriar Dr.
- **Address Line 2**: Suite 100
- **City**: Addison
- **State**: Illinois (or IL for abbreviation fields)
- **ZIP**: 60101

## Payment Information
- **Card Number**: 4111111111111111 (Visa test card)
- **Name on Card**: Test User
- **Expiration Month**: 12
- **Expiration Year**: 2025
- **CVV/Security Code**: 123

## Billing Address (if different from shipping)
- **Address**: 1200 Greenbriar Dr.
- **City**: Addison
- **State**: Illinois (or IL)
- **ZIP**: 60101

## Important Notes

1. **Use Exact Values**: The recorder performs exact string matching, so use these values exactly as shown.

2. **Test Card**: The card number 4111111111111111 is a standard Visa test card number that passes validation but won't process real charges.

3. **Recording Tips**:
   - Fill out forms slowly and deliberately
   - Wait for page loads between actions
   - Use the exact dummy values even if the site has validation
   - If a site requires additional fields not listed here, add them to dummy_values.json

4. **Playback**: During playback, these values will be replaced with actual customer data provided in the API request.

## Recording a New Site

```bash
# Start recording
node index.js record https://example-store.com/product-page -o example-store.json

# Fill out the purchase flow using the dummy values above
# The recorder will capture all your actions

# Test the recording
node index.js play example-store.json --vars-file variables.json
```

## Extending Dummy Values

If you need additional dummy values for a specific site:

1. Add them to `dummy_values.json`
2. Update the Flask integration in `services/purchase_service.py` to map the corresponding billing profile fields
3. Document the new fields in this guide