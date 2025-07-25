# Compatibility Notes

## OpenAI API Version Issue

The application was originally built with OpenAI API v1.6.0, but this can cause compatibility issues with the `proxies` parameter. We've updated the application to use the older v0.28.1 API which works more consistently.

### Changes Made:

1. Updated `requirements.txt` to use OpenAI v0.28.1 instead of v1.6.0
2. Modified OpenAI client initialization in `services/manual_parser.py` and `services/part_resolver.py`:
   - Changed `from openai import OpenAI` to `import openai` 
   - Changed client initialization from `OpenAI(api_key=...)` to `openai.api_key = ...`
   - Updated API calls from `openai_client.chat.completions.create()` to `openai.ChatCompletion.create()`

### If You Need to Use OpenAI API v1.6.0+

To use the newer OpenAI API version, you'll need to update the code to handle the client initialization differently:

```python
# Initialize client
from openai import OpenAI
client = OpenAI(api_key=Config.OPENAI_API_KEY)

# Make API calls
response = client.chat.completions.create(
    model="gpt-4.1-nano",
    messages=[
        {"role": "system", "content": "You are a parts identification expert."},
        {"role": "user", "content": prompt}
    ],
    response_format={"type": "json_object"}
)

# Parse response (note the different path to access content)
result = response.choices[0].message.content
```

The API response structure is different between versions, so you'll need to adjust the response handling code accordingly.