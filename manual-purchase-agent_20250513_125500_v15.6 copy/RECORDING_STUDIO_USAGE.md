# Recording Studio Usage Guide

## 🎬 **Complete Solution Overview**

The **Purchase Recording Studio** is now fully integrated into your Flask application. Here's how to use it:

---

## **1. Creating Purchase Recordings**

### **Step 1: Launch Recording Studio**
```bash
cd recording_studio
python start_recording_studio.py
```

### **Step 2: Record a Purchase Flow**
1. **Go to "Recording" tab**
2. **Enter product URL**: `https://www.etundra.com/kitchen-supplies/food-carriers/beverage/cambro-dspr6148-6-gal-beverage-dispenser/`
3. **Enter recording name**: `etundra` 
4. **Click "Start Recording"**
5. **Browser opens** - navigate through purchase using dummy values shown
6. **Complete purchase flow** (add to cart → checkout → payment)
7. **Click "Stop Recording"** when done

### **Step 3: Test Your Recording**
1. **Go to "Playback & Editing" tab**
2. **Select recording** from dropdown
3. **Click "Load"**
4. **Use "Step Forward"** to test each step
5. **Edit any problematic steps** in JSON editor
6. **Save changes** when satisfied

---

## **2. Using Recordings via API**

### **Check Available Recordings**
```bash
curl http://localhost:7777/api/recording-studio/recordings
```

### **Execute Automated Purchase**
```bash
curl -X POST http://localhost:7777/api/recording-studio/execute \
  -H "Content-Type: application/json" \
  -d '{
    "product_url": "https://www.etundra.com/different-product",
    "billing_profile": {
      "name": "John Doe",
      "email": "john@company.com",
      "phone": "555-123-4567",
      "address1": "123 Main Street", 
      "city": "New York",
      "state": "NY",
      "zip": "10001",
      "card_number": "4111111111111111",
      "exp_month": "12",
      "exp_year": "2025",
      "cvv": "123"
    }
  }'
```

### **Test Recording Safely**
```bash
curl -X POST http://localhost:7777/api/recording-studio/test \
  -H "Content-Type: application/json" \
  -d '{
    "recording_name": "etundra",
    "test_url": "https://www.etundra.com/test-product"
  }'
```

---

## **3. Integration with Your Purchase Service**

### **Update Your Purchase Service**
Add this to your `services/purchase_service.py`:

```python
from recording_studio.flask_integration import integration_service

def execute_purchase_with_recording_studio(product_url, billing_profile):
    """Execute purchase using Recording Studio if recording exists"""
    
    # Check if recording exists for this domain
    recording_file = integration_service.find_recording_for_url(product_url)
    
    if recording_file:
        # Use Recording Studio
        result = integration_service.execute_purchase(
            product_url=product_url,
            billing_profile=billing_profile
        )
        
        return {
            "success": result["success"],
            "method": "recording_studio",
            "message": result["message"],
            "steps_executed": result["steps_executed"],
            "recording_used": recording_file.stem
        }
    else:
        # Fall back to playwright-recorder or return error
        return {
            "success": False,
            "method": "none",
            "message": f"No recording found for {product_url}",
            "suggestion": "Create a recording using the Recording Studio"
        }
```

### **Update Your Purchase API Endpoint**
In your `api/purchases.py`, add Recording Studio as an option:

```python
@purchases_bp.route('/', methods=['POST'])
def create_purchase():
    # ... existing code ...
    
    # Try Recording Studio first
    if 'use_recording_studio' in data and data['use_recording_studio']:
        from recording_studio.flask_integration import integration_service
        
        result = integration_service.execute_purchase(
            product_url=data['supplier_url'],
            billing_profile=billing_profile_data
        )
        
        if result['success']:
            # Save to database and return success
            return jsonify({
                "id": new_purchase.id,
                "status": "completed",
                "method": "recording_studio",
                "message": result['message']
            })
    
    # Fall back to existing playwright-recorder method
    # ... existing code ...
```

---

## **4. API Endpoints Reference**

### **Recording Studio Endpoints**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/recording-studio/health` | GET | Check if Recording Studio is available |
| `/api/recording-studio/recordings` | GET | List available recordings |
| `/api/recording-studio/execute` | POST | Execute automated purchase |
| `/api/recording-studio/test` | POST | Test recording safely |
| `/api/recording-studio/validate` | POST | Validate recording file |
| `/api/recording-studio/find-recording` | POST | Find recording for URL |

### **Legacy Compatibility**
The new Recording Studio is also available via:
- `/api/purchases/recording-studio` - Matches existing purchase API format

---

## **5. Best Practices**

### **Recording Best Practices**
1. **Use provided dummy values exactly** as shown in GUI
2. **Record complete flows** from product page to confirmation
3. **Test immediately** after recording
4. **Keep recordings site-specific** (one per domain)
5. **Use simple products** for initial testing

### **Debugging**
1. **Use step-by-step mode** for testing
2. **Check element highlighting** for selector accuracy 
3. **Edit selectors** if elements change
4. **Add debug=true** to API calls for screenshots

### **Production Usage**
1. **Test recordings regularly** as sites change
2. **Monitor success rates** and update recordings as needed
3. **Use validation endpoint** to check recording health
4. **Keep backups** of working recordings

---

## **6. Example Workflow**

### **Complete Example: Adding ETundra Support**

1. **Record the flow:**
   ```bash
   python recording_studio/start_recording_studio.py
   # Record purchase on https://www.etundra.com/product-page
   ```

2. **Test the recording:**
   ```bash
   curl -X POST http://localhost:7777/api/recording-studio/test \
     -H "Content-Type: application/json" \
     -d '{"recording_name": "etundra"}'
   ```

3. **Use in your app:**
   ```bash
   curl -X POST http://localhost:7777/api/recording-studio/execute \
     -H "Content-Type: application/json" \
     -d '{
       "product_url": "https://www.etundra.com/any-product",
       "billing_profile": { ... }
     }'
   ```

4. **Integrate with existing purchase endpoint:**
   ```python
   # In your purchase service
   result = execute_purchase_with_recording_studio(product_url, billing_profile)
   ```

---

## **7. Troubleshooting**

### **Common Issues**

**Recording Studio won't start:**
```bash
pip install selenium webdriver-manager
```

**Chrome not found:**
- Install Chrome or Chromium browser
- Check if Chrome is in PATH

**Recording playback fails:**
- Use step-by-step mode to debug
- Check if selectors changed
- Update recording in GUI editor

**API integration issues:**
- Check Flask app includes recording_studio_bp
- Verify recordings directory exists
- Test with health endpoint first

### **Debug Mode**
Enable debug mode for detailed screenshots:
```bash
curl -X POST http://localhost:7777/api/recording-studio/execute \
  -H "Content-Type: application/json" \
  -d '{
    "product_url": "...",
    "billing_profile": {...},
    "debug": true
  }'
```

---

## **🎯 You're Ready!**

The Recording Studio is now fully integrated and ready to replace the unreliable playwright-recorder system. It provides:

✅ **High precision recording** with multiple fallback strategies  
✅ **Visual debugging** with step-by-step execution  
✅ **Easy editing** with GUI interface  
✅ **Seamless Flask integration** with clean APIs  
✅ **Comprehensive testing** with safe test mode  

Start by recording your first purchase flow and you'll have much more reliable automation!