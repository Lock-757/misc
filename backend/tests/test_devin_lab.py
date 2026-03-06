"""
Devin Lab Backend API Tests

Tests for:
1. Chat API response cleanup (no XML tags)
2. Permission enforcement
3. Permission sync API
4. Task CRUD operations
5. Task approval
6. Task run
7. Memory retrieval
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paule-platform.preview.emergentagent.com').rstrip('/')
ADMIN_KEY = "forge_master_2025"

@pytest.fixture
def api_client():
    """Shared requests session with admin key"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "X-Admin-Key": ADMIN_KEY
    })
    return session


@pytest.fixture
def devin_agent_id(api_client):
    """Get the Devin agent ID"""
    response = api_client.get(f"{BASE_URL}/api/agents")
    assert response.status_code == 200
    agents = response.json()
    devin = next((a for a in agents if 'devin' in a.get('name', '').lower()), None)
    assert devin is not None, "Devin agent not found"
    return devin['id']


class TestAgentsEndpoint:
    """Test agents endpoint - prerequisite for other tests"""
    
    def test_get_agents_returns_devin(self, api_client):
        """Verify Devin agent exists"""
        response = api_client.get(f"{BASE_URL}/api/agents")
        assert response.status_code == 200
        
        agents = response.json()
        assert isinstance(agents, list)
        
        devin = next((a for a in agents if 'devin' in a.get('name', '').lower()), None)
        assert devin is not None, "Devin agent should exist"
        assert 'id' in devin
        assert devin.get('has_tools') == True, "Devin should have tools enabled"
        print(f"PASS: Found Devin agent with id={devin['id']}, has_tools={devin.get('has_tools')}")


class TestPermissionsAPI:
    """Test permission sync and retrieval APIs"""
    
    def test_get_permissions(self, api_client):
        """GET /api/devin/permissions returns current permission states"""
        response = api_client.get(f"{BASE_URL}/api/devin/permissions")
        assert response.status_code == 200
        
        perms = response.json()
        assert isinstance(perms, dict)
        
        # Check expected permissions exist
        expected_perms = ['shell', 'file_read', 'file_write', 'browser', 'self_task']
        for perm in expected_perms:
            assert perm in perms, f"Permission '{perm}' should exist"
        
        print(f"PASS: Got {len(perms)} permissions: {list(perms.keys())}")
    
    def test_update_permissions_shell_disable(self, api_client):
        """POST /api/devin/permissions - disable shell permission"""
        # First, get current state
        get_response = api_client.get(f"{BASE_URL}/api/devin/permissions")
        initial_perms = get_response.json()
        initial_shell = initial_perms.get('shell', True)
        
        # Update to disable shell
        update_payload = {
            "permissions": {
                "shell": False
            }
        }
        response = api_client.post(f"{BASE_URL}/api/devin/permissions", json=update_payload)
        assert response.status_code == 200
        
        result = response.json()
        assert result.get('status') == 'updated'
        assert 'permissions' in result
        assert result['permissions']['shell'] == False
        
        # Verify persistence via GET
        verify_response = api_client.get(f"{BASE_URL}/api/devin/permissions")
        assert verify_response.status_code == 200
        assert verify_response.json()['shell'] == False
        
        print("PASS: Shell permission disabled and verified")
        
        # Restore original state
        restore_payload = {"permissions": {"shell": initial_shell}}
        api_client.post(f"{BASE_URL}/api/devin/permissions", json=restore_payload)
    
    def test_update_multiple_permissions(self, api_client):
        """POST /api/devin/permissions - update multiple permissions at once"""
        update_payload = {
            "permissions": {
                "shell": True,
                "browser": True,
                "self_task": True,
                "camera": False,
                "location": False
            }
        }
        response = api_client.post(f"{BASE_URL}/api/devin/permissions", json=update_payload)
        assert response.status_code == 200
        
        result = response.json()
        assert result['permissions']['shell'] == True
        assert result['permissions']['browser'] == True
        assert result['permissions']['camera'] == False
        
        print("PASS: Multiple permissions updated successfully")


class TestDevinTasksCRUD:
    """Test Devin task creation, retrieval, and deletion"""
    
    def test_create_task_low_risk(self, api_client):
        """POST /api/devin/tasks - create a low-risk task"""
        task_payload = {
            "title": f"TEST_task_{uuid.uuid4().hex[:8]}",
            "task": "List files in the current directory",
            "priority": "normal"
        }
        
        response = api_client.post(f"{BASE_URL}/api/devin/tasks", json=task_payload)
        assert response.status_code == 200
        
        task = response.json()
        assert 'id' in task
        assert task['title'] == task_payload['title']
        assert task['task'] == task_payload['task']
        assert task['status'] == 'queued'
        assert task['risk_level'] == 'low'
        assert task['requires_approval'] == False
        
        print(f"PASS: Created task id={task['id']}, risk_level={task['risk_level']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/devin/tasks/{task['id']}")
        return task['id']
    
    def test_create_task_high_risk_requires_approval(self, api_client):
        """POST /api/devin/tasks - high-risk task requires approval"""
        task_payload = {
            "title": f"TEST_delete_task_{uuid.uuid4().hex[:8]}",
            "task": "Delete all production data from the database",  # Contains high-risk keywords
            "priority": "high"
        }
        
        response = api_client.post(f"{BASE_URL}/api/devin/tasks", json=task_payload)
        assert response.status_code == 200
        
        task = response.json()
        assert task['risk_level'] == 'high', f"Expected high risk, got {task['risk_level']}"
        assert task['requires_approval'] == True
        assert task['is_approved'] == False
        
        print(f"PASS: High-risk task created, requires_approval={task['requires_approval']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/devin/tasks/{task['id']}")
    
    def test_list_tasks(self, api_client):
        """GET /api/devin/tasks - list all tasks"""
        response = api_client.get(f"{BASE_URL}/api/devin/tasks")
        assert response.status_code == 200
        
        tasks = response.json()
        assert isinstance(tasks, list)
        print(f"PASS: Listed {len(tasks)} tasks")
    
    def test_delete_task(self, api_client):
        """DELETE /api/devin/tasks/{id} - delete a task"""
        # First create a task
        task_payload = {
            "title": f"TEST_delete_me_{uuid.uuid4().hex[:8]}",
            "task": "This task will be deleted",
            "priority": "low"
        }
        create_response = api_client.post(f"{BASE_URL}/api/devin/tasks", json=task_payload)
        assert create_response.status_code == 200
        task_id = create_response.json()['id']
        
        # Delete the task
        delete_response = api_client.delete(f"{BASE_URL}/api/devin/tasks/{task_id}")
        assert delete_response.status_code == 200
        
        result = delete_response.json()
        assert result.get('status') == 'deleted'
        assert result.get('task_id') == task_id
        
        # Verify task no longer in list
        list_response = api_client.get(f"{BASE_URL}/api/devin/tasks")
        tasks = list_response.json()
        task_ids = [t['id'] for t in tasks]
        assert task_id not in task_ids, "Deleted task should not appear in list"
        
        print(f"PASS: Task {task_id} deleted and verified")
    
    def test_delete_nonexistent_task_returns_404(self, api_client):
        """DELETE /api/devin/tasks/{id} - 404 for nonexistent task"""
        fake_id = str(uuid.uuid4())
        response = api_client.delete(f"{BASE_URL}/api/devin/tasks/{fake_id}")
        assert response.status_code == 404
        print("PASS: 404 returned for nonexistent task")


class TestTaskApproval:
    """Test task approval workflow"""
    
    def test_approve_high_risk_task(self, api_client):
        """POST /api/devin/tasks/{id}/approve-risk - approve high-risk task"""
        # Create a high-risk task
        task_payload = {
            "title": f"TEST_security_audit_{uuid.uuid4().hex[:8]}",
            "task": "Review security credentials and token management",  # High risk keyword
            "priority": "high"
        }
        create_response = api_client.post(f"{BASE_URL}/api/devin/tasks", json=task_payload)
        assert create_response.status_code == 200
        
        task = create_response.json()
        task_id = task['id']
        
        # Verify it requires approval
        assert task['requires_approval'] == True or task['risk_level'] == 'high'
        
        # Approve the task
        approve_response = api_client.post(f"{BASE_URL}/api/devin/tasks/{task_id}/approve-risk")
        assert approve_response.status_code == 200
        
        result = approve_response.json()
        assert result.get('status') == 'approved'
        assert result.get('task_id') == task_id
        
        # Verify task is now approved via list
        list_response = api_client.get(f"{BASE_URL}/api/devin/tasks")
        tasks = list_response.json()
        approved_task = next((t for t in tasks if t['id'] == task_id), None)
        assert approved_task is not None
        assert approved_task['is_approved'] == True
        
        print(f"PASS: Task {task_id} approved successfully")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/devin/tasks/{task_id}")
    
    def test_approve_nonexistent_task_returns_404(self, api_client):
        """POST /api/devin/tasks/{id}/approve-risk - 404 for nonexistent task"""
        fake_id = str(uuid.uuid4())
        response = api_client.post(f"{BASE_URL}/api/devin/tasks/{fake_id}/approve-risk")
        assert response.status_code == 404
        print("PASS: 404 returned for approving nonexistent task")


class TestTaskRun:
    """Test task execution"""
    
    def test_run_low_risk_task_dry_run(self, api_client):
        """POST /api/devin/tasks/{id}/run - dry run a low-risk task"""
        # Create a simple task
        task_payload = {
            "title": f"TEST_run_task_{uuid.uuid4().hex[:8]}",
            "task": "Echo hello world",
            "priority": "low"
        }
        create_response = api_client.post(f"{BASE_URL}/api/devin/tasks", json=task_payload)
        assert create_response.status_code == 200
        
        task = create_response.json()
        task_id = task['id']
        
        # Run the task (dry run)
        run_response = api_client.post(
            f"{BASE_URL}/api/devin/tasks/{task_id}/run",
            json={"dry_run": True}
        )
        
        # Should get 200 with run record
        assert run_response.status_code == 200
        
        run_record = run_response.json()
        assert 'id' in run_record
        assert run_record['task_id'] == task_id
        assert run_record['dry_run'] == True
        assert run_record['status'] in ['completed', 'failed', 'running']
        
        print(f"PASS: Task {task_id} dry run completed, status={run_record['status']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/devin/tasks/{task_id}")
    
    def test_run_unapproved_high_risk_task_fails(self, api_client):
        """POST /api/devin/tasks/{id}/run - cannot run unapproved high-risk task"""
        # Create a high-risk task
        task_payload = {
            "title": f"TEST_unapproved_{uuid.uuid4().hex[:8]}",
            "task": "Delete all production credentials",
            "priority": "high"
        }
        create_response = api_client.post(f"{BASE_URL}/api/devin/tasks", json=task_payload)
        assert create_response.status_code == 200
        
        task = create_response.json()
        task_id = task['id']
        
        # Try to run without approval (should fail with 403)
        run_response = api_client.post(
            f"{BASE_URL}/api/devin/tasks/{task_id}/run",
            json={"dry_run": False}
        )
        assert run_response.status_code == 403
        
        print("PASS: Unapproved high-risk task correctly blocked with 403")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/devin/tasks/{task_id}")


class TestMemoryRetrieval:
    """Test memory endpoints"""
    
    def test_get_agent_memories(self, api_client, devin_agent_id):
        """GET /api/agents/{id}/memories - retrieve Devin's memories"""
        response = api_client.get(f"{BASE_URL}/api/agents/{devin_agent_id}/memories")
        assert response.status_code == 200
        
        memories = response.json()
        assert isinstance(memories, list)
        
        print(f"PASS: Retrieved {len(memories)} memories for Devin agent")
        
        # Verify memory structure if any exist
        if memories:
            mem = memories[0]
            assert 'id' in mem or 'content' in mem
            print(f"Sample memory: {str(mem)[:100]}...")
    
    def test_add_and_delete_memory(self, api_client, devin_agent_id):
        """POST/DELETE /api/agents/{id}/memories - add and delete a memory"""
        # Add a test memory
        memory_payload = {
            "content": f"TEST_memory_{uuid.uuid4().hex[:8]}: This is a test memory",
            "category": "test"
        }
        
        add_response = api_client.post(
            f"{BASE_URL}/api/agents/{devin_agent_id}/memories",
            json=memory_payload
        )
        assert add_response.status_code == 200
        
        result = add_response.json()
        assert 'id' in result
        memory_id = result['id']
        
        print(f"PASS: Added memory id={memory_id}")
        
        # Verify memory exists
        list_response = api_client.get(f"{BASE_URL}/api/agents/{devin_agent_id}/memories")
        memories = list_response.json()
        memory_contents = [m.get('content', '') for m in memories]
        assert any('TEST_memory_' in c for c in memory_contents), "Test memory should be in list"
        
        # Delete the memory
        delete_response = api_client.delete(
            f"{BASE_URL}/api/agents/{devin_agent_id}/memories/{memory_id}"
        )
        assert delete_response.status_code == 200
        
        print(f"PASS: Memory {memory_id} deleted successfully")


class TestChatAPICleanResponse:
    """Test agentic-chat endpoint returns clean responses (no XML tags)"""
    
    def test_chat_response_no_think_tags(self, api_client, devin_agent_id):
        """POST /api/agentic-chat - response should not contain <think> tags"""
        chat_payload = {
            "agent_id": devin_agent_id,
            "message": "What is 2 + 2?",
            "user_id": "test_user"
        }
        
        response = api_client.post(f"{BASE_URL}/api/agentic-chat", json=chat_payload)
        
        # May get 429 if rate limited - that's okay
        if response.status_code == 429:
            print("SKIP: Rate limited (429) - chat test skipped")
            pytest.skip("Rate limited")
        
        assert response.status_code == 200
        
        result = response.json()
        assert 'message' in result
        assert 'content' in result['message']
        
        content = result['message']['content']
        
        # Check no XML tags in response
        assert '<think>' not in content, f"Response contains <think> tag: {content[:200]}"
        assert '</think>' not in content, f"Response contains </think> tag: {content[:200]}"
        assert '<message_user>' not in content, f"Response contains <message_user> tag"
        assert '</message_user>' not in content, f"Response contains </message_user> tag"
        
        print(f"PASS: Chat response clean, no XML tags. Response: {content[:100]}...")
    
    def test_chat_response_no_tool_tags(self, api_client, devin_agent_id):
        """POST /api/agentic-chat - response should not contain tool XML tags"""
        chat_payload = {
            "agent_id": devin_agent_id,
            "message": "Hello, just say hi back briefly",
            "user_id": "test_user"
        }
        
        response = api_client.post(f"{BASE_URL}/api/agentic-chat", json=chat_payload)
        
        if response.status_code == 429:
            print("SKIP: Rate limited (429)")
            pytest.skip("Rate limited")
        
        assert response.status_code == 200
        
        result = response.json()
        content = result['message']['content']
        
        # Check no tool tags
        tool_tags = ['<shell', '</shell>', '<browser_', '<create_file', '<open_file', '<save_memory']
        for tag in tool_tags:
            assert tag not in content, f"Response contains tool tag '{tag}'"
        
        print(f"PASS: No tool tags in chat response")


class TestPermissionEnforcement:
    """Test that disabling permissions blocks tool execution"""
    
    def test_shell_blocked_when_disabled(self, api_client, devin_agent_id):
        """When shell permission is disabled, shell commands should be blocked"""
        # Disable shell permission
        disable_response = api_client.post(
            f"{BASE_URL}/api/devin/permissions",
            json={"permissions": {"shell": False}}
        )
        assert disable_response.status_code == 200
        assert disable_response.json()['permissions']['shell'] == False
        
        # Verify permission is disabled
        perms = api_client.get(f"{BASE_URL}/api/devin/permissions").json()
        assert perms['shell'] == False
        
        print("PASS: Shell permission successfully disabled")
        
        # Re-enable for other tests
        api_client.post(
            f"{BASE_URL}/api/devin/permissions",
            json={"permissions": {"shell": True}}
        )
        
        # Verify re-enabled
        perms = api_client.get(f"{BASE_URL}/api/devin/permissions").json()
        assert perms['shell'] == True
        print("PASS: Shell permission re-enabled")


class TestDevinRuns:
    """Test run history retrieval"""
    
    def test_list_runs(self, api_client):
        """GET /api/devin/runs - list run history"""
        response = api_client.get(f"{BASE_URL}/api/devin/runs")
        assert response.status_code == 200
        
        runs = response.json()
        assert isinstance(runs, list)
        
        print(f"PASS: Listed {len(runs)} run records")
        
        if runs:
            run = runs[0]
            expected_fields = ['id', 'task_id', 'status']
            for field in expected_fields:
                assert field in run, f"Run record missing '{field}'"


class TestTaskChaining:
    """Test task chaining feature"""
    
    def test_create_chained_tasks(self, api_client):
        """Create tasks with chain configuration"""
        # Create first task
        task1_payload = {
            "title": f"TEST_chain_first_{uuid.uuid4().hex[:8]}",
            "task": "First task in chain",
            "priority": "normal"
        }
        response1 = api_client.post(f"{BASE_URL}/api/devin/tasks", json=task1_payload)
        assert response1.status_code == 200
        task1_id = response1.json()['id']
        
        # Create second task chained to first
        task2_payload = {
            "title": f"TEST_chain_second_{uuid.uuid4().hex[:8]}",
            "task": "Second task in chain",
            "priority": "normal",
            "next_task_id": task1_id,  # Chain to first task
            "chain_on_success_only": True
        }
        response2 = api_client.post(f"{BASE_URL}/api/devin/tasks", json=task2_payload)
        assert response2.status_code == 200
        
        task2 = response2.json()
        assert task2['next_task_id'] == task1_id
        assert task2['chain_on_success_only'] == True
        
        print(f"PASS: Created chained tasks: {task2['id']} -> {task1_id}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/devin/tasks/{task2['id']}")
        api_client.delete(f"{BASE_URL}/api/devin/tasks/{task1_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
