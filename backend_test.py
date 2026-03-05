#!/usr/bin/env python3
"""
Devin Ops API Testing Script
Tests all required endpoints with specific test cases as requested.
"""

import requests
import json
import time
import sys
from typing import Dict, Any, Optional


class DevinOpsAPITester:
    def __init__(self, base_url: str, admin_key: str):
        self.base_url = base_url.rstrip('/')
        self.admin_key = admin_key
        self.headers = {
            'Content-Type': 'application/json',
            'X-Admin-Key': admin_key
        }
        self.test_results = []
        
    def log_test(self, test_name: str, passed: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        message = f"{status}: {test_name}"
        if details:
            message += f" - {details}"
        print(message)
        self.test_results.append({
            'test': test_name,
            'passed': passed,
            'details': details
        })
        
    def make_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> tuple[int, Dict]:
        """Make HTTP request and return status code and response"""
        url = f"{self.base_url}/api{endpoint}"
        try:
            if method == 'GET':
                response = requests.get(url, headers=self.headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, headers=self.headers, json=data, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response.status_code, response.json() if response.text else {}
        except requests.exceptions.RequestException as e:
            return 500, {"error": str(e)}
        except json.JSONDecodeError:
            return response.status_code, {"error": "Invalid JSON response"}
    
    def test_case_1_create_task(self) -> Optional[str]:
        """Test case 1: POST /api/devin/tasks create task returns 200 and required fields"""
        print("\n🧪 Test Case 1: Create Devin Task")
        
        task_data = {
            "title": "Sample Analysis Task",
            "task": "Analyze system performance and provide recommendations",
            "priority": "normal"
        }
        
        status_code, response = self.make_request('POST', '/devin/tasks', task_data)
        
        # Check status code
        if status_code != 200:
            self.log_test("Create Task Status Code", False, f"Expected 200, got {status_code}")
            return None
            
        # Check required fields
        required_fields = ['id', 'risk_level', 'requires_approval', 'status']
        missing_fields = [field for field in required_fields if field not in response]
        
        if missing_fields:
            self.log_test("Create Task Required Fields", False, f"Missing fields: {missing_fields}")
            return None
            
        self.log_test("Create Task", True, f"Task created with ID: {response['id']}")
        return response['id']
    
    def test_case_2_list_tasks(self, created_task_id: str) -> bool:
        """Test case 2: GET /api/devin/tasks returns list including created task"""
        print("\n🧪 Test Case 2: List Devin Tasks")
        
        status_code, response = self.make_request('GET', '/devin/tasks')
        
        if status_code != 200:
            self.log_test("List Tasks Status Code", False, f"Expected 200, got {status_code}")
            return False
            
        if not isinstance(response, list):
            self.log_test("List Tasks Response Format", False, "Expected list response")
            return False
            
        # Check if created task is in the list
        task_found = any(task.get('id') == created_task_id for task in response)
        
        if not task_found:
            self.log_test("List Tasks Contains Created Task", False, f"Task {created_task_id} not found in list")
            return False
            
        self.log_test("List Tasks", True, f"Found {len(response)} tasks including created task")
        return True
    
    def test_case_3_dry_run(self, task_id: str) -> Optional[str]:
        """Test case 3: POST /api/devin/tasks/{id}/run with dry_run=true returns 200 and dry_run=true"""
        print("\n🧪 Test Case 3: Dry Run Task")
        
        run_data = {"dry_run": True}
        status_code, response = self.make_request('POST', f'/devin/tasks/{task_id}/run', run_data)
        
        if status_code != 200:
            self.log_test("Dry Run Status Code", False, f"Expected 200, got {status_code}")
            return None
            
        if not response.get('dry_run'):
            self.log_test("Dry Run Flag", False, "dry_run field should be true")
            return None
            
        self.log_test("Dry Run Task", True, f"Dry run completed with run ID: {response.get('id')}")
        return response.get('id')
    
    def test_case_4_list_runs(self, run_id: str) -> bool:
        """Test case 4: GET /api/devin/runs returns list including created run with status completed"""
        print("\n🧪 Test Case 4: List Devin Runs")
        
        status_code, response = self.make_request('GET', '/devin/runs')
        
        if status_code != 200:
            self.log_test("List Runs Status Code", False, f"Expected 200, got {status_code}")
            return False
            
        if not isinstance(response, list):
            self.log_test("List Runs Response Format", False, "Expected list response")
            return False
            
        # Find the specific run
        target_run = next((run for run in response if run.get('id') == run_id), None)
        
        if not target_run:
            self.log_test("List Runs Contains Created Run", False, f"Run {run_id} not found")
            return False
            
        if target_run.get('status') != 'completed':
            self.log_test("List Runs Status Completed", False, f"Expected 'completed', got '{target_run.get('status')}'")
            return False
            
        self.log_test("List Runs", True, f"Found run with status: {target_run.get('status')}")
        return True
    
    def test_case_5_high_risk_path(self) -> bool:
        """Test case 5: High-risk path - create task with 'delete production secrets', verify requires_approval=true and run without approval returns 403"""
        print("\n🧪 Test Case 5: High-Risk Task Path")
        
        # Create high-risk task
        high_risk_data = {
            "title": "Critical Security Task", 
            "task": "delete production secrets from the staging environment",
            "priority": "high"
        }
        
        status_code, response = self.make_request('POST', '/devin/tasks', high_risk_data)
        
        if status_code != 200:
            self.log_test("High-Risk Task Creation", False, f"Expected 200, got {status_code}")
            return False
            
        high_risk_task_id = response.get('id')
        
        # Verify requires_approval is true
        if not response.get('requires_approval'):
            self.log_test("High-Risk Requires Approval", False, "requires_approval should be true for high-risk tasks")
            return False
            
        self.log_test("High-Risk Task Creation", True, f"High-risk task created: {high_risk_task_id}")
        
        # Try to run without approval - should return 403
        run_data = {"dry_run": True}
        status_code, run_response = self.make_request('POST', f'/devin/tasks/{high_risk_task_id}/run', run_data)
        
        if status_code != 403:
            self.log_test("High-Risk Run Without Approval", False, f"Expected 403, got {status_code}")
            return False
            
        self.log_test("High-Risk Path", True, "High-risk task properly requires approval")
        return high_risk_task_id
    
    def test_case_6_approve_and_run(self, high_risk_task_id: str) -> bool:
        """Test case 6: Approve high-risk task and run dry_run=true returns 200"""
        print("\n🧪 Test Case 6: Approve High-Risk Task and Run")
        
        # Approve the high-risk task
        status_code, response = self.make_request('POST', f'/devin/tasks/{high_risk_task_id}/approve-risk')
        
        if status_code != 200:
            self.log_test("High-Risk Task Approval", False, f"Expected 200, got {status_code}")
            return False
            
        self.log_test("High-Risk Task Approval", True, "Task approved successfully")
        
        # Now try to run the approved high-risk task
        run_data = {"dry_run": True}
        status_code, run_response = self.make_request('POST', f'/devin/tasks/{high_risk_task_id}/run', run_data)
        
        if status_code != 200:
            self.log_test("Approved High-Risk Task Run", False, f"Expected 200, got {status_code}")
            return False
            
        if not run_response.get('dry_run'):
            self.log_test("Approved Task Dry Run Flag", False, "dry_run should be true")
            return False
            
        self.log_test("Approve and Run High-Risk Task", True, "Approved high-risk task ran successfully")
        return True
    
    def run_all_tests(self):
        """Run all test cases in sequence"""
        print(f"🚀 Starting Devin Ops API Tests")
        print(f"Base URL: {self.base_url}")
        print(f"Admin Key: {self.admin_key}")
        print("="*60)
        
        # Test case 1: Create task
        task_id = self.test_case_1_create_task()
        if not task_id:
            print("❌ Test 1 failed, skipping dependent tests")
            return self.get_summary()
            
        # Test case 2: List tasks
        if not self.test_case_2_list_tasks(task_id):
            print("❌ Test 2 failed")
            
        # Test case 3: Dry run
        run_id = self.test_case_3_dry_run(task_id)
        if not run_id:
            print("❌ Test 3 failed")
        else:
            # Test case 4: List runs
            self.test_case_4_list_runs(run_id)
            
        # Test case 5: High-risk path
        high_risk_task_id = self.test_case_5_high_risk_path()
        if high_risk_task_id:
            # Test case 6: Approve and run
            self.test_case_6_approve_and_run(high_risk_task_id)
            
        return self.get_summary()
    
    def get_summary(self) -> Dict[str, Any]:
        """Get test summary"""
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result['passed'])
        failed_tests = total_tests - passed_tests
        
        print("\n" + "="*60)
        print(f"📊 TEST SUMMARY")
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%" if total_tests > 0 else "No tests run")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['passed']:
                    print(f"   - {result['test']}: {result['details']}")
        
        return {
            'total': total_tests,
            'passed': passed_tests,
            'failed': failed_tests,
            'success_rate': (passed_tests/total_tests*100) if total_tests > 0 else 0,
            'details': self.test_results
        }


def main():
    # Configuration from review request
    BASE_URL = "https://aurora-devin-lab.preview.emergentagent.com"
    ADMIN_KEY = "forge_master_2025"
    
    # Run tests
    tester = DevinOpsAPITester(BASE_URL, ADMIN_KEY)
    summary = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if summary['failed'] == 0 else 1)


if __name__ == "__main__":
    main()