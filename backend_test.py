#!/usr/bin/env python3

import asyncio
import aiohttp
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import sys

# Backend API URL from frontend environment
BACKEND_URL = "https://agent-forge-app.preview.emergentagent.com/api"

class AgentForgeAPITester:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session: Optional[aiohttp.ClientSession] = None
        self.test_agent_id = None
        self.test_conversation_id = None
        self.test_results = []
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30))
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and isinstance(response_data, dict):
            if "error" in response_data or not success:
                print(f"   Response: {response_data}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
        print()
    
    async def make_request(self, method: str, endpoint: str, data: Dict = None, params: Dict = None) -> Dict:
        """Make HTTP request to API"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            kwargs = {"params": params} if params else {}
            if data:
                kwargs["json"] = data
                
            async with self.session.request(method, url, **kwargs) as response:
                response_text = await response.text()
                
                # Try to parse JSON, fallback to text
                try:
                    response_data = json.loads(response_text) if response_text else {}
                except json.JSONDecodeError:
                    response_data = {"raw_response": response_text}
                
                return {
                    "status": response.status,
                    "data": response_data,
                    "success": 200 <= response.status < 300
                }
        except Exception as e:
            return {
                "status": 0,
                "data": {"error": str(e)},
                "success": False
            }
    
    async def test_health_check(self):
        """Test GET /api/ - Health check"""
        response = await self.make_request("GET", "/")
        
        success = (response["success"] and 
                  "message" in response["data"] and
                  "version" in response["data"])
        
        self.log_test(
            "Health Check (GET /api/)",
            success,
            f"Status: {response['status']}, API Running: {success}",
            response["data"]
        )
        return success
    
    async def test_create_agent(self):
        """Test POST /api/agents - Create agent"""
        agent_data = {
            "name": "TestBot Alpha",
            "avatar": "rocket",
            "avatar_color": "#FF6B6B",
            "system_prompt": "You are TestBot Alpha, a helpful AI assistant for testing purposes.",
            "personality": "Friendly and thorough tester",
            "model": "grok-3-latest",
            "temperature": 0.8
        }
        
        response = await self.make_request("POST", "/agents", agent_data)
        
        success = (response["success"] and 
                  "id" in response["data"] and
                  response["data"]["name"] == agent_data["name"])
        
        if success:
            self.test_agent_id = response["data"]["id"]
        
        self.log_test(
            "Create Agent (POST /api/agents)",
            success,
            f"Status: {response['status']}, Agent ID: {self.test_agent_id}",
            response["data"] if not success else {"id": self.test_agent_id, "name": response["data"]["name"]}
        )
        return success
    
    async def test_get_agents(self):
        """Test GET /api/agents - List agents"""
        response = await self.make_request("GET", "/agents")
        
        success = (response["success"] and 
                  isinstance(response["data"], list) and
                  any(agent.get("id") == self.test_agent_id for agent in response["data"]))
        
        agent_count = len(response["data"]) if isinstance(response["data"], list) else 0
        
        self.log_test(
            "List Agents (GET /api/agents)",
            success,
            f"Status: {response['status']}, Found {agent_count} agents, Test agent found: {success}",
            response["data"] if not success else {"count": agent_count}
        )
        return success
    
    async def test_get_agent_details(self):
        """Test GET /api/agents/{id} - Get agent details"""
        if not self.test_agent_id:
            self.log_test("Get Agent Details", False, "No test agent ID available")
            return False
        
        response = await self.make_request("GET", f"/agents/{self.test_agent_id}")
        
        success = (response["success"] and 
                  response["data"].get("id") == self.test_agent_id and
                  "name" in response["data"])
        
        self.log_test(
            f"Get Agent Details (GET /api/agents/{self.test_agent_id})",
            success,
            f"Status: {response['status']}, Agent retrieved: {success}",
            response["data"] if not success else {"id": response["data"].get("id"), "name": response["data"].get("name")}
        )
        return success
    
    async def test_update_agent(self):
        """Test PUT /api/agents/{id} - Update agent"""
        if not self.test_agent_id:
            self.log_test("Update Agent", False, "No test agent ID available")
            return False
        
        update_data = {
            "name": "TestBot Alpha Updated",
            "personality": "Updated personality for testing"
        }
        
        response = await self.make_request("PUT", f"/agents/{self.test_agent_id}", update_data)
        
        success = (response["success"] and 
                  response["data"].get("name") == update_data["name"])
        
        self.log_test(
            f"Update Agent (PUT /api/agents/{self.test_agent_id})",
            success,
            f"Status: {response['status']}, Agent updated: {success}",
            response["data"] if not success else {"name": response["data"].get("name")}
        )
        return success
    
    async def test_chat_functionality(self):
        """Test POST /api/chat - Send message and get AI response"""
        if not self.test_agent_id:
            self.log_test("Chat Functionality", False, "No test agent ID available")
            return False
        
        chat_data = {
            "agent_id": self.test_agent_id,
            "message": "Hello! This is a test message. Please respond briefly to confirm you're working.",
            "include_memory": False
        }
        
        response = await self.make_request("POST", "/chat", chat_data)
        
        success = (response["success"] and 
                  "conversation_id" in response["data"] and
                  "message" in response["data"] and
                  response["data"]["message"].get("role") == "assistant" and
                  len(response["data"]["message"].get("content", "")) > 0)
        
        if success:
            self.test_conversation_id = response["data"]["conversation_id"]
        
        self.log_test(
            "Chat Functionality (POST /api/chat)",
            success,
            f"Status: {response['status']}, Chat working: {success}, Conversation ID: {self.test_conversation_id}",
            response["data"] if not success else {"conversation_id": self.test_conversation_id, "message_length": len(response["data"]["message"].get("content", ""))}
        )
        return success
    
    async def test_create_memory(self):
        """Test POST /api/memories - Create memory"""
        if not self.test_agent_id:
            self.log_test("Create Memory", False, "No test agent ID available")
            return False
        
        memory_data = {
            "agent_id": self.test_agent_id,
            "content": "The user prefers concise responses and enjoys testing AI systems",
            "category": "preference",
            "importance": 8
        }
        
        response = await self.make_request("POST", "/memories", memory_data)
        
        success = (response["success"] and 
                  "id" in response["data"] and
                  response["data"]["content"] == memory_data["content"])
        
        self.log_test(
            "Create Memory (POST /api/memories)",
            success,
            f"Status: {response['status']}, Memory created: {success}",
            response["data"] if not success else {"id": response["data"].get("id"), "content": response["data"].get("content")}
        )
        return success
    
    async def test_get_memories(self):
        """Test GET /api/memories - Get memories"""
        if not self.test_agent_id:
            self.log_test("Get Memories", False, "No test agent ID available")
            return False
        
        response = await self.make_request("GET", "/memories", params={"agent_id": self.test_agent_id})
        
        success = (response["success"] and 
                  isinstance(response["data"], list))
        
        memory_count = len(response["data"]) if isinstance(response["data"], list) else 0
        
        self.log_test(
            f"Get Memories (GET /api/memories?agent_id={self.test_agent_id})",
            success,
            f"Status: {response['status']}, Found {memory_count} memories",
            response["data"] if not success else {"count": memory_count}
        )
        return success
    
    async def test_quick_replies(self):
        """Test GET /api/quick-replies - Get quick replies (creates defaults)"""
        if not self.test_agent_id:
            self.log_test("Quick Replies", False, "No test agent ID available")
            return False
        
        response = await self.make_request("GET", "/quick-replies", params={"agent_id": self.test_agent_id})
        
        success = (response["success"] and 
                  isinstance(response["data"], list) and
                  len(response["data"]) > 0)
        
        reply_count = len(response["data"]) if isinstance(response["data"], list) else 0
        
        self.log_test(
            f"Get Quick Replies (GET /api/quick-replies?agent_id={self.test_agent_id})",
            success,
            f"Status: {response['status']}, Found {reply_count} quick replies",
            response["data"] if not success else {"count": reply_count}
        )
        return success
    
    async def test_create_quick_reply(self):
        """Test POST /api/quick-replies - Create quick reply"""
        if not self.test_agent_id:
            self.log_test("Create Quick Reply", False, "No test agent ID available")
            return False
        
        reply_data = {
            "agent_id": self.test_agent_id,
            "label": "Test More",
            "message": "Please run additional tests",
            "icon": "flask",
            "order": 10
        }
        
        response = await self.make_request("POST", "/quick-replies", reply_data)
        
        success = (response["success"] and 
                  "id" in response["data"] and
                  response["data"]["label"] == reply_data["label"])
        
        self.log_test(
            "Create Quick Reply (POST /api/quick-replies)",
            success,
            f"Status: {response['status']}, Quick reply created: {success}",
            response["data"] if not success else {"id": response["data"].get("id"), "label": response["data"].get("label")}
        )
        return success
    
    async def test_search(self):
        """Test POST /api/search - Search messages/conversations"""
        search_data = {
            "query": "test",
            "agent_id": self.test_agent_id,
            "search_type": "all"
        }
        
        response = await self.make_request("POST", "/search", search_data)
        
        success = (response["success"] and 
                  isinstance(response["data"], list))
        
        result_count = len(response["data"]) if isinstance(response["data"], list) else 0
        
        self.log_test(
            "Search (POST /api/search)",
            success,
            f"Status: {response['status']}, Found {result_count} search results",
            response["data"] if not success else {"count": result_count}
        )
        return success
    
    async def test_bookmarks(self):
        """Test bookmark functionality"""
        if not self.test_agent_id or not self.test_conversation_id:
            self.log_test("Bookmarks", False, "Missing agent or conversation ID")
            return False
        
        # Create a bookmark
        response = await self.make_request("POST", "/bookmarks", params={
            "agent_id": self.test_agent_id,
            "conversation_id": self.test_conversation_id,
            "message_id": str(uuid.uuid4()),
            "note": "Test bookmark"
        })
        
        success = (response["success"] and 
                  "id" in response["data"])
        
        bookmark_id = response["data"].get("id") if success else None
        
        if success:
            # Test getting bookmarks
            get_response = await self.make_request("GET", "/bookmarks")
            success = success and get_response["success"] and isinstance(get_response["data"], list)
        
        self.log_test(
            "Create Bookmark (POST /api/bookmarks)",
            success,
            f"Status: {response['status']}, Bookmark created: {success}",
            response["data"] if not success else {"id": bookmark_id}
        )
        return success
    
    async def test_agent_templates(self):
        """Test GET /api/agents/templates - Get agent templates"""
        response = await self.make_request("GET", "/agents/templates")
        
        success = (response["success"] and 
                  isinstance(response["data"], list) and
                  len(response["data"]) > 0)
        
        template_count = len(response["data"]) if isinstance(response["data"], list) else 0
        
        self.log_test(
            "Get Agent Templates (GET /api/agents/templates)",
            success,
            f"Status: {response['status']}, Found {template_count} templates",
            response["data"] if not success else {"count": template_count}
        )
        
        # Test creating agent from template
        if success and template_count > 0:
            template_id = response["data"][0]["id"]
            create_response = await self.make_request("POST", f"/agents/from-template/{template_id}", params={"name": "Test Agent from Template"})
            
            template_success = create_response["success"] and "id" in create_response["data"]
            
            self.log_test(
                f"Create Agent from Template (POST /api/agents/from-template/{template_id})",
                template_success,
                f"Status: {create_response['status']}, Agent created from template: {template_success}",
                create_response["data"] if not template_success else {"id": create_response["data"].get("id")}
            )
            success = success and template_success
        
        return success
    
    async def test_scheduled_tasks(self):
        """Test scheduled tasks functionality"""
        if not self.test_agent_id:
            self.log_test("Scheduled Tasks", False, "No test agent ID available")
            return False
        
        # Create a scheduled task
        task_data = {
            "agent_id": self.test_agent_id,
            "prompt": "Daily system check",
            "schedule_time": (datetime.utcnow() + timedelta(hours=1)).isoformat(),
            "repeat": "daily"
        }
        
        response = await self.make_request("POST", "/scheduled-tasks", task_data)
        
        success = (response["success"] and 
                  "id" in response["data"])
        
        task_id = response["data"].get("id") if success else None
        
        if success:
            # Test getting scheduled tasks
            get_response = await self.make_request("GET", "/scheduled-tasks")
            success = success and get_response["success"] and isinstance(get_response["data"], list)
            
            if success and task_id:
                # Test toggle task
                toggle_response = await self.make_request("PUT", f"/scheduled-tasks/{task_id}/toggle")
                success = success and toggle_response["success"]
        
        self.log_test(
            "Scheduled Tasks (POST/GET/PUT /api/scheduled-tasks)",
            success,
            f"Status: {response['status']}, Task operations successful: {success}",
            response["data"] if not success else {"task_id": task_id}
        )
        return success
    
    async def test_export_data(self):
        """Test GET /api/export/all - Export all data"""
        response = await self.make_request("GET", "/export/all")
        
        success = (response["success"] and 
                  "exported_at" in response["data"] and
                  "conversations" in response["data"])
        
        self.log_test(
            "Export All Data (GET /api/export/all)",
            success,
            f"Status: {response['status']}, Export successful: {success}",
            response["data"] if not success else {"exported_at": response["data"].get("exported_at")}
        )
        return success
    
    async def test_stats(self):
        """Test GET /api/stats - Get usage stats"""
        response = await self.make_request("GET", "/stats")
        
        success = (response["success"] and 
                  "total_conversations" in response["data"] and
                  "total_messages" in response["data"])
        
        self.log_test(
            "Get Stats (GET /api/stats)",
            success,
            f"Status: {response['status']}, Stats retrieved: {success}",
            response["data"] if not success else {
                "conversations": response["data"].get("total_conversations"),
                "messages": response["data"].get("total_messages")
            }
        )
        return success
    
    async def test_ui_config(self):
        """Test UI config endpoints"""
        # Get UI config
        response = await self.make_request("GET", "/ui-config")
        
        success = (response["success"] and 
                  "theme" in response["data"])
        
        if success:
            # Update UI config
            update_data = {
                "primary_color": "#FF5722",
                "theme": "dark"
            }
            update_response = await self.make_request("PUT", "/ui-config", update_data)
            success = success and update_response["success"]
        
        self.log_test(
            "UI Config (GET/PUT /api/ui-config)",
            success,
            f"Status: {response['status']}, UI config operations successful: {success}",
            response["data"] if not success else {"theme": response["data"].get("theme")}
        )
        return success
    
    async def run_all_tests(self):
        """Run all API tests in order of priority"""
        print("=" * 60)
        print("AGENT FORGE API TESTING")
        print(f"Testing API at: {self.base_url}")
        print("=" * 60)
        print()
        
        # Test in priority order
        tests = [
            # Core endpoints (Critical)
            ("Health Check", self.test_health_check),
            ("Create Agent", self.test_create_agent),
            ("List Agents", self.test_get_agents),
            ("Get Agent Details", self.test_get_agent_details),
            ("Update Agent", self.test_update_agent),
            ("Chat Functionality", self.test_chat_functionality),
            
            # Memory & Data endpoints
            ("Create Memory", self.test_create_memory),
            ("Get Memories", self.test_get_memories),
            
            # Quick Replies
            ("Quick Replies", self.test_quick_replies),
            ("Create Quick Reply", self.test_create_quick_reply),
            
            # Search & Bookmarks
            ("Search", self.test_search),
            ("Bookmarks", self.test_bookmarks),
            
            # Templates
            ("Agent Templates", self.test_agent_templates),
            
            # Scheduled Tasks
            ("Scheduled Tasks", self.test_scheduled_tasks),
            
            # Export & Stats
            ("Export Data", self.test_export_data),
            ("Stats", self.test_stats),
            
            # UI Config
            ("UI Config", self.test_ui_config),
        ]
        
        passed_tests = 0
        total_tests = len(tests)
        
        for test_name, test_func in tests:
            try:
                result = await test_func()
                if result:
                    passed_tests += 1
            except Exception as e:
                self.log_test(test_name, False, f"Test crashed: {str(e)}")
        
        # Summary
        print("=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        print()
        
        # Failed tests
        failed_tests = [r for r in self.test_results if not r["success"]]
        if failed_tests:
            print("FAILED TESTS:")
            for test in failed_tests:
                print(f"❌ {test['test']}: {test['details']}")
                if test['response'] and isinstance(test['response'], dict):
                    print(f"   Response: {test['response']}")
        else:
            print("🎉 All tests passed!")
        
        print("=" * 60)
        
        return passed_tests, total_tests, failed_tests

async def main():
    """Run the API tests"""
    async with AgentForgeAPITester(BACKEND_URL) as tester:
        passed, total, failed = await tester.run_all_tests()
        
        # Exit with appropriate code
        if passed == total:
            sys.exit(0)
        else:
            sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())