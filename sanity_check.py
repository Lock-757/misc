#!/usr/bin/env python3
"""
Backend Sanity Checks for Aurora Agent Interface
Tests the 3 core requirements from the review request
"""

import requests
import json

# Configuration
BASE_URL = "https://devin-interface.preview.emergentagent.com"
ADMIN_KEY = "forge_master_2025"

def test_agents_endpoint():
    """Test 1: GET /api/agents returns 200 and contains Aurora and Devin"""
    try:
        url = f"{BASE_URL}/api/agents"
        response = requests.get(url, timeout=10)
        
        print(f"Test 1: GET /api/agents")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            return f"❌ FAIL - Expected 200, got {response.status_code}"
        
        agents = response.json()
        if not isinstance(agents, list):
            return f"❌ FAIL - Response is not a list: {type(agents)}"
        
        agent_names = [agent.get('name', '').lower() for agent in agents if isinstance(agent, dict)]
        
        has_aurora = any('aurora' in name for name in agent_names)
        has_devin = any('devin' in name for name in agent_names)
        
        print(f"Total agents: {len(agents)}")
        print(f"Agent names found: {[agent.get('name') for agent in agents if isinstance(agent, dict)]}")
        
        if not has_aurora:
            return f"❌ FAIL - Aurora not found in agent list"
        if not has_devin:
            return f"❌ FAIL - Devin not found in agent list"
        
        return "✅ PASS - Found both Aurora and Devin agents"
        
    except requests.exceptions.RequestException as e:
        return f"❌ FAIL - Request error: {str(e)}"
    except Exception as e:
        return f"❌ FAIL - Unexpected error: {str(e)}"

def test_auth_me_unauthorized():
    """Test 2: GET /api/auth/me without auth returns 401"""
    try:
        url = f"{BASE_URL}/api/auth/me"
        response = requests.get(url, timeout=10)
        
        print(f"\nTest 2: GET /api/auth/me (no auth)")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 401:
            return "✅ PASS - Correctly returns 401 unauthorized"
        else:
            return f"❌ FAIL - Expected 401, got {response.status_code}"
            
    except requests.exceptions.RequestException as e:
        return f"❌ FAIL - Request error: {str(e)}"
    except Exception as e:
        return f"❌ FAIL - Unexpected error: {str(e)}"

def test_admin_stats():
    """Test 3: GET /api/admin/stats with X-Admin-Key returns 200 and numeric totals"""
    try:
        url = f"{BASE_URL}/api/admin/stats"
        headers = {"X-Admin-Key": ADMIN_KEY}
        response = requests.get(url, headers=headers, timeout=10)
        
        print(f"\nTest 3: GET /api/admin/stats (with admin key)")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            return f"❌ FAIL - Expected 200, got {response.status_code}"
        
        stats = response.json()
        print(f"Stats response: {json.dumps(stats, indent=2)}")
        
        # Check that stats contains numeric totals
        if not isinstance(stats, dict):
            return f"❌ FAIL - Response is not a dict: {type(stats)}"
        
        numeric_fields = []
        for key, value in stats.items():
            if isinstance(value, (int, float)):
                numeric_fields.append(f"{key}={value}")
        
        if not numeric_fields:
            return f"❌ FAIL - No numeric fields found in stats"
        
        print(f"Numeric totals found: {', '.join(numeric_fields)}")
        return f"✅ PASS - Returns numeric totals: {', '.join(numeric_fields)}"
        
    except requests.exceptions.RequestException as e:
        return f"❌ FAIL - Request error: {str(e)}"
    except Exception as e:
        return f"❌ FAIL - Unexpected error: {str(e)}"

def main():
    """Run all sanity checks and provide summary"""
    print("=== Backend Sanity Checks for Aurora Agent Interface ===")
    print(f"Base URL: {BASE_URL}")
    print(f"Admin Key: {ADMIN_KEY}")
    print("=" * 60)
    
    # Run all tests
    results = []
    
    result1 = test_agents_endpoint()
    results.append(("Agents Endpoint", result1))
    
    result2 = test_auth_me_unauthorized()
    results.append(("Auth Unauthorized", result2))
    
    result3 = test_admin_stats()
    results.append(("Admin Stats", result3))
    
    # Summary
    print("\n" + "=" * 60)
    print("=== SUMMARY ===")
    
    passed = 0
    failed = 0
    
    for test_name, result in results:
        status = "PASS" if result.startswith("✅") else "FAIL"
        if status == "PASS":
            passed += 1
        else:
            failed += 1
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed} PASS, {failed} FAIL")
    
    if failed == 0:
        print("🎉 ALL SANITY CHECKS PASSED!")
    else:
        print(f"⚠️  {failed} test(s) failed - see details above")

if __name__ == "__main__":
    main()