#!/usr/bin/env python3
"""
Quick timing test for key v4 endpoints based on Flask logs analysis
"""
import time
import requests
import json

def quick_endpoint_test():
    """Test just the core endpoints to get realistic timings"""
    base_url = "http://localhost:7777"
    
    endpoints = [
        {
            'name': 'Recordings Available',
            'method': 'GET',
            'endpoint': '/api/recordings/available',
            'expected_time': '< 500ms'
        },
        {
            'name': 'Equipment Enrichment',
            'method': 'POST',
            'endpoint': '/api/enrichment',
            'data': {'make': 'Hobart', 'model': 'A200'},
            'expected_time': '5-8s'  # From logs: lots of AI processing
        },
        {
            'name': 'Manual Search',
            'method': 'POST',
            'endpoint': '/api/manuals/search',
            'data': {'make': 'Hobart', 'model': 'A200', 'max_results': 3},
            'expected_time': '8-12s'  # From logs: heavy PDF processing
        },
        {
            'name': 'Supplier Search',
            'method': 'POST',
            'endpoint': '/api/suppliers/search',
            'data': {'part_number': '00-917676', 'make': 'Hobart', 'model': 'A200'},
            'expected_time': '8-15s'  # From logs: includes price scraping
        }
    ]
    
    print("⚡ QUICK TIMING TEST FOR V4 LOADING BAR")
    print("=" * 50)
    
    timing_data = {}
    
    for test in endpoints:
        print(f"\n🔍 {test['name']} (Expected: {test['expected_time']})")
        
        start_time = time.time()
        try:
            if test['method'] == 'GET':
                response = requests.get(f"{base_url}{test['endpoint']}", timeout=30)
            else:
                response = requests.post(f"{base_url}{test['endpoint']}", 
                                       json=test.get('data'), 
                                       headers={'Content-Type': 'application/json'}, 
                                       timeout=30)
            
            elapsed = (time.time() - start_time) * 1000
            print(f"   ✅ {elapsed:.0f}ms (Status: {response.status_code})")
            
            timing_data[test['name']] = {
                'elapsed_ms': elapsed,
                'status': response.status_code,
                'expected': test['expected_time']
            }
            
        except requests.exceptions.Timeout:
            elapsed = 30000
            print(f"   ⏰ TIMEOUT (30s)")
            timing_data[test['name']] = {
                'elapsed_ms': elapsed,
                'status': 'timeout',
                'expected': test['expected_time']
            }
        except Exception as e:
            print(f"   ❌ ERROR: {e}")
            timing_data[test['name']] = {
                'elapsed_ms': 0,
                'status': 'error',
                'expected': test['expected_time']
            }
    
    print("\n" + "=" * 50)
    print("📊 LOADING BAR TIMING RECOMMENDATIONS")
    print("=" * 50)
    
    # Generate loading bar config based on timings
    loading_config = {
        'equipment_setup': {
            'steps': [
                {'name': 'Loading recordings', 'duration': timing_data.get('Recordings Available', {}).get('elapsed_ms', 500)},
                {'name': 'Enriching equipment data', 'duration': timing_data.get('Equipment Enrichment', {}).get('elapsed_ms', 6000)}
            ],
            'total_duration': sum([
                timing_data.get('Recordings Available', {}).get('elapsed_ms', 500),
                timing_data.get('Equipment Enrichment', {}).get('elapsed_ms', 6000)
            ])
        },
        'manual_search': {
            'steps': [
                {'name': 'Searching manuals', 'duration': timing_data.get('Manual Search', {}).get('elapsed_ms', 10000)}
            ],
            'total_duration': timing_data.get('Manual Search', {}).get('elapsed_ms', 10000)
        },
        'supplier_search': {
            'steps': [
                {'name': 'Finding suppliers', 'duration': timing_data.get('Supplier Search', {}).get('elapsed_ms', 12000)}
            ],
            'total_duration': timing_data.get('Supplier Search', {}).get('elapsed_ms', 12000)
        }
    }
    
    for workflow, config in loading_config.items():
        print(f"\n🔄 {workflow.replace('_', ' ').title()}:")
        print(f"   Total: {config['total_duration']:.0f}ms")
        for step in config['steps']:
            print(f"   • {step['name']}: {step['duration']:.0f}ms")
    
    # Save configuration
    with open('loading_bar_config.json', 'w') as f:
        json.dump({
            'measured_timings': timing_data,
            'loading_configurations': loading_config,
            'recommendations': {
                'show_progress_for': ['Equipment Enrichment', 'Manual Search', 'Supplier Search'],
                'instant_feedback': ['Recordings Available'],
                'step_by_step': ['equipment_setup']
            }
        }, f, indent=2)
    
    print(f"\n💾 Configuration saved to: loading_bar_config.json")
    return loading_config

if __name__ == "__main__":
    quick_endpoint_test()