#!/usr/bin/env python3
"""
Performance audit script to measure API response times for v4 interface
"""
import time
import requests
import json
import statistics
from collections import defaultdict

class PerformanceAuditor:
    def __init__(self, base_url="http://localhost:7777"):
        self.base_url = base_url
        self.results = defaultdict(list)
        
    def time_request(self, method, endpoint, data=None, headers=None, num_runs=3):
        """Time an API request multiple times and return statistics"""
        times = []
        
        for i in range(num_runs):
            start_time = time.time()
            try:
                if method.upper() == 'GET':
                    response = requests.get(f"{self.base_url}{endpoint}", timeout=30)
                elif method.upper() == 'POST':
                    response = requests.post(f"{self.base_url}{endpoint}", 
                                           json=data, headers=headers, timeout=30)
                
                end_time = time.time()
                elapsed = (end_time - start_time) * 1000  # Convert to milliseconds
                times.append(elapsed)
                
                print(f"  Run {i+1}: {elapsed:.0f}ms (Status: {response.status_code})")
                
            except Exception as e:
                print(f"  Run {i+1}: ERROR - {e}")
                times.append(30000)  # 30s timeout as fallback
        
        return {
            'min': min(times),
            'max': max(times),
            'avg': statistics.mean(times),
            'median': statistics.median(times)
        }
    
    def audit_endpoints(self):
        """Audit all v4 endpoints identified"""
        
        print("🔍 Performance Audit for V4 Interface")
        print("=" * 50)
        
        # Test data for various endpoints
        test_cases = [
            {
                'name': 'Recordings Available',
                'method': 'GET',
                'endpoint': '/api/recordings/available',
                'description': 'Fetch available purchase recordings'
            },
            {
                'name': 'Equipment Enrichment',
                'method': 'POST',
                'endpoint': '/api/enrichment',
                'data': {
                    'make': 'Hobart',
                    'model': 'A200',
                    'description': 'Commercial mixer'
                },
                'description': 'Enrich equipment information'
            },
            {
                'name': 'Manual Search',
                'method': 'POST',
                'endpoint': '/api/manuals/search',
                'data': {
                    'make': 'Hobart',
                    'model': 'A200',
                    'max_results': 3
                },
                'description': 'Search for equipment manuals'
            },
            {
                'name': 'Part Resolution',
                'method': 'POST',
                'endpoint': '/api/parts/resolve',
                'data': {
                    'description': 'Bowl Lift Motor',
                    'make': 'Hobart',
                    'model': 'A200',
                    'use_database': True,
                    'use_manual_search': True,
                    'use_web_search': True
                },
                'description': 'Resolve generic part to OEM number'
            },
            {
                'name': 'Similar Parts Search',
                'method': 'POST',
                'endpoint': '/api/parts/find-similar',
                'data': {
                    'part_number': '00-917676',
                    'make': 'Hobart',
                    'model': 'A200'
                },
                'description': 'Find similar parts'
            },
            {
                'name': 'Supplier Search',
                'method': 'POST',
                'endpoint': '/api/suppliers/search',
                'data': {
                    'part_number': '00-917676',
                    'make': 'Hobart',
                    'model': 'A200'
                },
                'description': 'Search for part suppliers'
            },
            {
                'name': 'Generic Parts Search',
                'method': 'POST',
                'endpoint': '/api/parts/find-generic',
                'data': {
                    'oem_part_number': '00-917676',
                    'make': 'Hobart',
                    'model': 'A200'
                },
                'description': 'Find generic alternatives'
            },
            {
                'name': 'Profiles List',
                'method': 'GET',
                'endpoint': '/api/profiles',
                'description': 'Get billing profiles'
            }
        ]
        
        headers = {'Content-Type': 'application/json'}
        
        for test_case in test_cases:
            print(f"\n📊 Testing: {test_case['name']}")
            print(f"   {test_case['description']}")
            print(f"   {test_case['method']} {test_case['endpoint']}")
            
            stats = self.time_request(
                test_case['method'],
                test_case['endpoint'],
                test_case.get('data'),
                headers
            )
            
            self.results[test_case['name']] = {
                'endpoint': test_case['endpoint'],
                'method': test_case['method'],
                'description': test_case['description'],
                'stats': stats
            }
            
            print(f"   ⏱️  Avg: {stats['avg']:.0f}ms | Min: {stats['min']:.0f}ms | Max: {stats['max']:.0f}ms")
    
    def generate_loading_estimates(self):
        """Generate loading time estimates for UI"""
        print("\n" + "=" * 50)
        print("⚡ LOADING TIME ESTIMATES FOR V4 UI")
        print("=" * 50)
        
        # Categorize endpoints by typical user workflows
        workflows = {
            'Equipment Setup': [
                'Recordings Available',
                'Equipment Enrichment'
            ],
            'Manual Search': [
                'Manual Search'
            ],
            'Part Resolution': [
                'Part Resolution',
                'Similar Parts Search'
            ],
            'Supplier & Purchase': [
                'Supplier Search',
                'Generic Parts Search',
                'Profiles List'
            ]
        }
        
        loading_config = {}
        
        for workflow_name, endpoints in workflows.items():
            total_time = 0
            endpoint_times = []
            
            for endpoint_name in endpoints:
                if endpoint_name in self.results:
                    avg_time = self.results[endpoint_name]['stats']['avg']
                    total_time += avg_time
                    endpoint_times.append({
                        'name': endpoint_name,
                        'time': avg_time
                    })
            
            loading_config[workflow_name.lower().replace(' ', '_')] = {
                'total_time': total_time,
                'steps': endpoint_times,
                'estimated_duration': max(total_time, 1000)  # Minimum 1s for UX
            }
            
            print(f"\n🔄 {workflow_name}:")
            print(f"   Total estimated time: {total_time:.0f}ms")
            for step in endpoint_times:
                print(f"   • {step['name']}: {step['time']:.0f}ms")
        
        return loading_config
    
    def save_results(self, filename="performance_results.json"):
        """Save results to JSON file"""
        output = {
            'timestamp': time.time(),
            'base_url': self.base_url,
            'endpoint_results': dict(self.results),
            'loading_estimates': self.generate_loading_estimates()
        }
        
        with open(filename, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"\n💾 Results saved to: {filename}")
        return output

def main():
    auditor = PerformanceAuditor()
    auditor.audit_endpoints()
    results = auditor.save_results()
    
    print("\n" + "=" * 50)
    print("🎯 SUMMARY FOR LOADING BAR IMPLEMENTATION")
    print("=" * 50)
    
    # Quick recommendations
    fast_endpoints = []
    medium_endpoints = []
    slow_endpoints = []
    
    for name, data in auditor.results.items():
        avg_time = data['stats']['avg']
        if avg_time < 1000:
            fast_endpoints.append((name, avg_time))
        elif avg_time < 3000:
            medium_endpoints.append((name, avg_time))
        else:
            slow_endpoints.append((name, avg_time))
    
    print("\n⚡ Fast (< 1s):")
    for name, time in fast_endpoints:
        print(f"   • {name}: {time:.0f}ms")
    
    print("\n🐌 Medium (1-3s):")
    for name, time in medium_endpoints:
        print(f"   • {name}: {time:.0f}ms")
    
    print("\n🐢 Slow (> 3s):")
    for name, time in slow_endpoints:
        print(f"   • {name}: {time:.0f}ms")
    
    print("\n📋 Loading Bar Recommendations:")
    print("   • Use progress animations for requests > 1s")
    print("   • Show step-by-step progress for multi-step workflows")
    print("   • Add realistic time estimates based on these measurements")
    print("   • Consider skeleton loading for fast endpoints")

if __name__ == "__main__":
    main()