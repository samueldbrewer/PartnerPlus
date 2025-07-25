#!/usr/bin/env python3
"""
Comprehensive API testing script for all endpoints with 3 trials each
"""
import time
import requests
import json
import statistics
from collections import defaultdict
import sys

class ComprehensiveAPITester:
    def __init__(self, base_url="http://localhost:7777"):
        self.base_url = base_url
        self.results = defaultdict(list)
        self.summary = {}
        
    def time_request(self, method, endpoint, data=None, headers=None, description=""):
        """Time an API request and return the result"""
        start_time = time.time()
        try:
            if method.upper() == 'GET':
                response = requests.get(f"{self.base_url}{endpoint}", timeout=60, headers=headers)
            elif method.upper() == 'POST':
                response = requests.post(f"{self.base_url}{endpoint}", 
                                       json=data, headers=headers, timeout=60)
            elif method.upper() == 'PUT':
                response = requests.put(f"{self.base_url}{endpoint}", 
                                      json=data, headers=headers, timeout=60)
            elif method.upper() == 'DELETE':
                response = requests.delete(f"{self.base_url}{endpoint}", timeout=60, headers=headers)
            
            end_time = time.time()
            elapsed = (end_time - start_time) * 1000  # Convert to milliseconds
            
            return {
                'elapsed_ms': elapsed,
                'status_code': response.status_code,
                'success': 200 <= response.status_code < 400,
                'response_size': len(response.content) if response.content else 0
            }
            
        except requests.exceptions.Timeout:
            return {
                'elapsed_ms': 60000,  # 60s timeout
                'status_code': 'timeout',
                'success': False,
                'response_size': 0
            }
        except Exception as e:
            return {
                'elapsed_ms': 0,
                'status_code': f'error: {str(e)}',
                'success': False,
                'response_size': 0
            }
    
    def test_endpoint(self, name, method, endpoint, data=None, headers=None, trials=3):
        """Test an endpoint multiple times and collect statistics"""
        print(f"\n🔍 Testing: {name}")
        print(f"   {method} {endpoint}")
        
        trial_results = []
        
        for trial in range(trials):
            print(f"   Trial {trial + 1}/{trials}...", end="", flush=True)
            result = self.time_request(method, endpoint, data, headers)
            trial_results.append(result)
            
            if result['success']:
                print(f" ✅ {result['elapsed_ms']:.0f}ms (Status: {result['status_code']})")
            else:
                print(f" ❌ Failed (Status: {result['status_code']})")
        
        # Calculate statistics
        successful_times = [r['elapsed_ms'] for r in trial_results if r['success']]
        
        if successful_times:
            stats = {
                'min_ms': min(successful_times),
                'max_ms': max(successful_times),
                'avg_ms': statistics.mean(successful_times),
                'median_ms': statistics.median(successful_times),
                'success_rate': len(successful_times) / trials * 100,
                'trials': trials,
                'successful_trials': len(successful_times)
            }
        else:
            stats = {
                'min_ms': 0,
                'max_ms': 0,
                'avg_ms': 0,
                'median_ms': 0,
                'success_rate': 0,
                'trials': trials,
                'successful_trials': 0
            }
        
        self.results[name] = {
            'endpoint': endpoint,
            'method': method,
            'stats': stats,
            'trial_results': trial_results
        }
        
        if stats['success_rate'] > 0:
            print(f"   📊 Avg: {stats['avg_ms']:.0f}ms | Success: {stats['success_rate']:.0f}%")
        else:
            print(f"   💀 All trials failed")
    
    def run_comprehensive_test(self):
        """Test all API endpoints comprehensively"""
        
        print("🚀 COMPREHENSIVE API PERFORMANCE TEST")
        print("=" * 60)
        print("Testing all endpoints with 3 trials each...")
        
        headers = {'Content-Type': 'application/json'}
        
        # Test cases organized by category
        test_cases = [
            # System Endpoints
            {
                'name': 'System - Clear Cache',
                'method': 'POST',
                'endpoint': '/api/system/clear-cache',
                'data': {}
            },
            
            # Recordings Endpoints
            {
                'name': 'Recordings - Available Domains',
                'method': 'GET',
                'endpoint': '/api/recordings/available'
            },
            {
                'name': 'Recordings - Health Check',
                'method': 'GET',
                'endpoint': '/api/recordings/health'
            },
            {
                'name': 'Recordings - List All',
                'method': 'GET',
                'endpoint': '/api/recordings/recordings'
            },
            {
                'name': 'Recordings - Get Variables',
                'method': 'GET',
                'endpoint': '/api/recordings/variables'
            },
            
            # Enrichment Endpoints
            {
                'name': 'Enrichment - Equipment Data',
                'method': 'POST',
                'endpoint': '/api/enrichment',
                'data': {
                    'make': 'Hobart',
                    'model': 'A200'
                }
            },
            
            # Manuals Endpoints
            {
                'name': 'Manuals - Search',
                'method': 'POST',
                'endpoint': '/api/manuals/search',
                'data': {
                    'make': 'Hobart',
                    'model': 'A200',
                    'max_results': 3
                }
            },
            {
                'name': 'Manuals - List All',
                'method': 'GET',
                'endpoint': '/api/manuals'
            },
            
            # Parts Endpoints
            {
                'name': 'Parts - Resolve Generic',
                'method': 'POST',
                'endpoint': '/api/parts/resolve',
                'data': {
                    'description': 'Bowl Lift Motor',
                    'make': 'Hobart',
                    'model': 'A200',
                    'use_database': True,
                    'use_manual_search': True,
                    'use_web_search': True,
                    'save_results': False
                }
            },
            {
                'name': 'Parts - Find Similar',
                'method': 'POST',
                'endpoint': '/api/parts/find-similar',
                'data': {
                    'part_number': '00-917676',
                    'make': 'Hobart',
                    'model': 'A200'
                }
            },
            {
                'name': 'Parts - List All',
                'method': 'GET',
                'endpoint': '/api/parts'
            },
            {
                'name': 'Parts - Find Generic',
                'method': 'POST',
                'endpoint': '/api/parts/find-generic',
                'data': {
                    'oem_part_number': '00-917676',
                    'make': 'Hobart',
                    'model': 'A200'
                }
            },
            {
                'name': 'Parts - Validate Compatibility',
                'method': 'POST',
                'endpoint': '/api/parts/validate-compatibility',
                'data': {
                    'oem_part_number': '00-917676',
                    'generic_part_number': 'C7027A1049',
                    'make': 'Hobart',
                    'model': 'A200'
                }
            },
            
            # Suppliers Endpoints
            {
                'name': 'Suppliers - Search Parts',
                'method': 'POST',
                'endpoint': '/api/suppliers/search',
                'data': {
                    'part_number': '00-917676',
                    'make': 'Hobart',
                    'model': 'A200'
                }
            },
            {
                'name': 'Suppliers - List All',
                'method': 'GET',
                'endpoint': '/api/suppliers'
            },
            
            # Profiles Endpoints
            {
                'name': 'Profiles - List All',
                'method': 'GET',
                'endpoint': '/api/profiles'
            },
            
            # Purchases Endpoints
            {
                'name': 'Purchases - List All',
                'method': 'GET',
                'endpoint': '/api/purchases'
            },
            
            # Screenshots Endpoints
            {
                'name': 'Screenshots - Capture Suppliers',
                'method': 'POST',
                'endpoint': '/api/screenshots/suppliers',
                'data': {
                    'urls': ['https://www.example.com']
                }
            }
        ]
        
        # Execute all test cases
        for test_case in test_cases:
            self.test_endpoint(
                test_case['name'],
                test_case['method'],
                test_case['endpoint'],
                test_case.get('data'),
                headers
            )
        
        # Generate summary
        self.generate_summary()
    
    def generate_summary(self):
        """Generate performance summary and recommendations"""
        print("\n" + "=" * 60)
        print("📊 PERFORMANCE SUMMARY")
        print("=" * 60)
        
        # Categorize by speed
        fast_endpoints = []    # < 1s
        medium_endpoints = []  # 1-10s  
        slow_endpoints = []    # 10s+
        failed_endpoints = []  # Failed tests
        
        for name, data in self.results.items():
            stats = data['stats']
            avg_time = stats['avg_ms']
            
            if stats['success_rate'] == 0:
                failed_endpoints.append((name, 'Failed'))
            elif avg_time < 1000:
                fast_endpoints.append((name, avg_time))
            elif avg_time < 10000:
                medium_endpoints.append((name, avg_time))
            else:
                slow_endpoints.append((name, avg_time))
        
        print(f"\n⚡ FAST (< 1s): {len(fast_endpoints)} endpoints")
        for name, time in fast_endpoints:
            print(f"   • {name}: {time:.0f}ms")
        
        print(f"\n🐌 MEDIUM (1-10s): {len(medium_endpoints)} endpoints")
        for name, time in medium_endpoints:
            print(f"   • {name}: {time:.0f}ms")
        
        print(f"\n🐢 SLOW (10s+): {len(slow_endpoints)} endpoints")
        for name, time in slow_endpoints:
            print(f"   • {name}: {time:.0f}ms")
        
        if failed_endpoints:
            print(f"\n💀 FAILED: {len(failed_endpoints)} endpoints")
            for name, status in failed_endpoints:
                print(f"   • {name}: {status}")
        
        # Generate loading bar recommendations
        print("\n" + "=" * 60)
        print("🎯 LOADING BAR RECOMMENDATIONS")
        print("=" * 60)
        
        print("\n📋 Timing Profiles for Loading Bar:")
        
        # Create timing profiles for different workflows
        workflows = {
            'Equipment Setup': ['Enrichment - Equipment Data'],
            'Manual Search': ['Manuals - Search'],
            'Part Resolution': ['Parts - Resolve Generic'],
            'Supplier Search': ['Suppliers - Search Parts'],
            'System Operations': ['System - Clear Cache'],
            'Data Management': ['Parts - List All', 'Suppliers - List All']
        }
        
        for workflow, endpoint_names in workflows.items():
            total_time = 0
            found_endpoints = []
            
            for endpoint_name in endpoint_names:
                for name, data in self.results.items():
                    if endpoint_name in name and data['stats']['success_rate'] > 0:
                        avg_time = data['stats']['avg_ms']
                        total_time += avg_time
                        found_endpoints.append({
                            'name': name,
                            'time': avg_time
                        })
            
            if found_endpoints:
                print(f"\n🔄 {workflow}:")
                print(f"   Total estimated time: {total_time:.0f}ms")
                for endpoint in found_endpoints:
                    print(f"   • {endpoint['name']}: {endpoint['time']:.0f}ms")
        
        # Save detailed results
        self.save_results()
    
    def save_results(self):
        """Save detailed results to JSON file"""
        output = {
            'timestamp': time.time(),
            'test_summary': {
                'total_endpoints': len(self.results),
                'successful_endpoints': sum(1 for r in self.results.values() if r['stats']['success_rate'] > 0),
                'failed_endpoints': sum(1 for r in self.results.values() if r['stats']['success_rate'] == 0)
            },
            'detailed_results': dict(self.results)
        }
        
        filename = f"api_performance_results_{int(time.time())}.json"
        with open(filename, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"\n💾 Detailed results saved to: {filename}")

def main():
    print("Starting comprehensive API performance test...")
    
    tester = ComprehensiveAPITester()
    tester.run_comprehensive_test()
    
    print("\n✅ Comprehensive API test completed!")

if __name__ == "__main__":
    main()