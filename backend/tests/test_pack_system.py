"""
Pack System API Tests
Tests for:
- Pack listing API returns all 4 packs
- User packs API shows ownership status
- Pack activation/switching works
- Active pack endpoint
- Pack unlocking
- Tool permissions respect active pack's allowed_tools
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pack-platform.preview.emergentagent.com').rstrip('/')
ADMIN_KEY = "forge_master_2025"

# Pack slugs from specification
EXPECTED_PACKS = ["coder", "companion", "researcher", "taskmaster"]

@pytest.fixture
def api_headers():
    """Headers with admin authentication"""
    return {
        "Content-Type": "application/json",
        "X-Admin-Key": ADMIN_KEY
    }


class TestPackListing:
    """Tests for GET /api/packs - List all available packs"""
    
    def test_packs_endpoint_returns_200(self, api_headers):
        """Pack listing API should return 200"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: /api/packs returns 200")
    
    def test_packs_returns_all_four_packs(self, api_headers):
        """Pack listing should return exactly 4 packs"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        assert response.status_code == 200
        
        packs = response.json()
        assert len(packs) == 4, f"Expected 4 packs, got {len(packs)}"
        
        slugs = [p["slug"] for p in packs]
        for expected_slug in EXPECTED_PACKS:
            assert expected_slug in slugs, f"Missing pack: {expected_slug}"
        print(f"PASS: All 4 packs returned: {slugs}")
    
    def test_coder_pack_is_free(self, api_headers):
        """Coder pack should be free (is_free=True)"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        
        coder = next((p for p in packs if p["slug"] == "coder"), None)
        assert coder is not None, "Coder pack not found"
        assert coder["is_free"] == True, "Coder pack should be free"
        assert coder["price_usd"] == 0, "Coder pack price should be 0"
        print("PASS: Coder pack is free")
    
    def test_paid_packs_have_correct_price(self, api_headers):
        """Companion, Researcher, Task Master should be $4.99"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        
        paid_slugs = ["companion", "researcher", "taskmaster"]
        for pack in packs:
            if pack["slug"] in paid_slugs:
                assert pack["is_free"] == False, f"{pack['name']} should not be free"
                assert pack["price_usd"] == 4.99, f"{pack['name']} should cost $4.99"
        print("PASS: Paid packs have correct pricing ($4.99)")
    
    def test_packs_have_required_fields(self, api_headers):
        """Each pack should have all required fields"""
        required_fields = ["id", "slug", "name", "tagline", "description", "icon", 
                          "color", "system_prompt", "allowed_tools", "is_free", "price_usd"]
        
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        
        for pack in packs:
            for field in required_fields:
                assert field in pack, f"Pack {pack.get('name', 'unknown')} missing field: {field}"
        print("PASS: All packs have required fields")
    
    def test_packs_have_allowed_tools(self, api_headers):
        """Each pack should have allowed_tools array"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        
        # Expected tool counts per pack (from spec)
        expected_tools = {
            "coder": ["shell", "file_read", "file_write", "browser"],
            "companion": ["save_memory", "recall_memories"],
            "researcher": ["browser_go", "browser_read"],
            "taskmaster": ["shell", "file_read", "create_task"]
        }
        
        for pack in packs:
            tools = pack.get("allowed_tools", [])
            assert isinstance(tools, list), f"{pack['name']} allowed_tools should be list"
            assert len(tools) > 0, f"{pack['name']} should have at least 1 tool"
            
            # Check some expected tools exist
            if pack["slug"] in expected_tools:
                for expected_tool in expected_tools[pack["slug"]]:
                    assert expected_tool in tools, f"{pack['name']} missing tool: {expected_tool}"
        
        print("PASS: Packs have correct allowed_tools")


class TestUserPacks:
    """Tests for GET /api/user/packs - User pack ownership status"""
    
    def test_user_packs_returns_200(self, api_headers):
        """User packs endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=api_headers)
        assert response.status_code == 200
        print("PASS: /api/user/packs returns 200")
    
    def test_user_packs_have_ownership_fields(self, api_headers):
        """User packs should include is_unlocked and is_active fields"""
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=api_headers)
        packs = response.json()
        
        for pack in packs:
            assert "is_unlocked" in pack, f"{pack['name']} missing is_unlocked"
            assert "is_active" in pack, f"{pack['name']} missing is_active"
            assert isinstance(pack["is_unlocked"], bool)
            assert isinstance(pack["is_active"], bool)
        print("PASS: User packs have ownership fields")
    
    def test_only_one_pack_active_at_time(self, api_headers):
        """Only one pack should be active at a time"""
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=api_headers)
        packs = response.json()
        
        active_count = sum(1 for p in packs if p.get("is_active"))
        assert active_count <= 1, f"Expected 0 or 1 active pack, found {active_count}"
        print(f"PASS: Only {active_count} pack active at a time")
    
    def test_coder_pack_auto_unlocked_for_user(self, api_headers):
        """Coder (free) pack should be auto-unlocked for users"""
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=api_headers)
        packs = response.json()
        
        coder = next((p for p in packs if p["slug"] == "coder"), None)
        assert coder is not None
        assert coder["is_unlocked"] == True, "Coder pack should be auto-unlocked"
        print("PASS: Coder pack auto-unlocked for user")


class TestActivePack:
    """Tests for GET /api/user/active-pack"""
    
    def test_active_pack_returns_200(self, api_headers):
        """Active pack endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/user/active-pack", headers=api_headers)
        assert response.status_code == 200
        print("PASS: /api/user/active-pack returns 200")
    
    def test_active_pack_has_required_fields(self, api_headers):
        """Active pack should return full pack details"""
        response = requests.get(f"{BASE_URL}/api/user/active-pack", headers=api_headers)
        data = response.json()
        
        if data:  # May be empty if no pack active
            required = ["id", "slug", "name", "system_prompt", "allowed_tools"]
            for field in required:
                assert field in data, f"Active pack missing field: {field}"
        print("PASS: Active pack has required fields")


class TestPackActivation:
    """Tests for POST /api/user/packs/{pack_id}/activate"""
    
    def test_activate_free_pack(self, api_headers):
        """Should be able to activate the free Coder pack"""
        # First get the coder pack ID
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        coder = next((p for p in packs if p["slug"] == "coder"), None)
        assert coder is not None
        
        # Activate it
        response = requests.post(
            f"{BASE_URL}/api/user/packs/{coder['id']}/activate",
            headers=api_headers
        )
        assert response.status_code == 200, f"Failed to activate: {response.text}"
        
        data = response.json()
        assert data.get("status") == "activated"
        assert data.get("pack_id") == coder["id"]
        print("PASS: Free pack activation works")
    
    def test_activate_changes_active_pack(self, api_headers):
        """Activating a pack should change the active pack"""
        # Get packs
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        coder = next((p for p in packs if p["slug"] == "coder"), None)
        
        # Activate coder
        requests.post(f"{BASE_URL}/api/user/packs/{coder['id']}/activate", headers=api_headers)
        
        # Verify active pack
        response = requests.get(f"{BASE_URL}/api/user/active-pack", headers=api_headers)
        active = response.json()
        assert active.get("slug") == "coder", f"Expected coder active, got {active.get('slug')}"
        print("PASS: Pack activation changes active pack")
    
    def test_activate_nonexistent_pack_returns_404(self, api_headers):
        """Activating non-existent pack should return 404"""
        response = requests.post(
            f"{BASE_URL}/api/user/packs/fake-pack-id-12345/activate",
            headers=api_headers
        )
        assert response.status_code == 404
        print("PASS: Non-existent pack returns 404")
    
    def test_activate_locked_pack_fails(self, api_headers):
        """Activating a locked (not unlocked, not free) pack should fail"""
        # Get researcher pack (paid, likely not unlocked)
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=api_headers)
        packs = response.json()
        
        researcher = next((p for p in packs if p["slug"] == "researcher"), None)
        if researcher and not researcher.get("is_unlocked"):
            response = requests.post(
                f"{BASE_URL}/api/user/packs/{researcher['id']}/activate",
                headers=api_headers
            )
            # Should fail since not unlocked
            assert response.status_code in [400, 403], f"Expected 400/403, got {response.status_code}"
            print("PASS: Activating locked pack fails")
        else:
            print("SKIP: No locked pack to test")


class TestPackUnlocking:
    """Tests for POST /api/user/packs/{pack_id}/unlock"""
    
    def test_unlock_pack(self, api_headers):
        """Should be able to unlock a paid pack"""
        # Get a paid pack
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        taskmaster = next((p for p in packs if p["slug"] == "taskmaster"), None)
        
        # Unlock it
        response = requests.post(
            f"{BASE_URL}/api/user/packs/{taskmaster['id']}/unlock",
            headers=api_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("status") in ["unlocked", "already_unlocked"]
        print("PASS: Pack unlock works")
    
    def test_unlock_and_activate_flow(self, api_headers):
        """Full flow: unlock pack then activate it"""
        # Get companion pack
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        companion = next((p for p in packs if p["slug"] == "companion"), None)
        
        # Unlock
        requests.post(f"{BASE_URL}/api/user/packs/{companion['id']}/unlock", headers=api_headers)
        
        # Activate
        response = requests.post(
            f"{BASE_URL}/api/user/packs/{companion['id']}/activate",
            headers=api_headers
        )
        assert response.status_code == 200
        
        # Verify
        response = requests.get(f"{BASE_URL}/api/user/active-pack", headers=api_headers)
        active = response.json()
        assert active.get("slug") == "companion"
        print("PASS: Unlock and activate flow works")


class TestPackSwitching:
    """Tests for pack switching behavior"""
    
    def test_switching_deactivates_previous_pack(self, api_headers):
        """Switching to new pack should deactivate the old one"""
        # Get packs
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        coder = next((p for p in packs if p["slug"] == "coder"), None)
        companion = next((p for p in packs if p["slug"] == "companion"), None)
        
        # Ensure companion is unlocked
        requests.post(f"{BASE_URL}/api/user/packs/{companion['id']}/unlock", headers=api_headers)
        
        # Activate coder first
        requests.post(f"{BASE_URL}/api/user/packs/{coder['id']}/activate", headers=api_headers)
        
        # Switch to companion
        requests.post(f"{BASE_URL}/api/user/packs/{companion['id']}/activate", headers=api_headers)
        
        # Verify only companion is active
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=api_headers)
        user_packs = response.json()
        
        active_packs = [p for p in user_packs if p.get("is_active")]
        assert len(active_packs) == 1
        assert active_packs[0]["slug"] == "companion"
        print("PASS: Switching deactivates previous pack")


class TestAgenticChatWithPacks:
    """Tests for agentic-chat endpoint with pack context"""
    
    def test_chat_returns_pack_info(self, api_headers):
        """Agentic chat should return pack_id and pack_name"""
        # Get Devin agent ID
        response = requests.get(f"{BASE_URL}/api/agents", headers=api_headers)
        agents = response.json()
        devin = next((a for a in agents if a["name"].lower() == "devin"), None)
        
        if not devin:
            pytest.skip("Devin agent not found")
        
        # Send a chat message
        response = requests.post(
            f"{BASE_URL}/api/agentic-chat",
            headers=api_headers,
            json={
                "agent_id": devin["id"],
                "message": "Hello",
                "user_id": "test_pack_user"
            }
        )
        
        assert response.status_code == 200, f"Chat failed: {response.text}"
        data = response.json()
        
        # Should include pack info
        assert "pack_id" in data, "Response missing pack_id"
        assert "pack_name" in data, "Response missing pack_name"
        print(f"PASS: Chat returns pack info: {data.get('pack_name')}")
    
    def test_chat_uses_active_pack_system_prompt(self, api_headers):
        """Chat should use the active pack's system prompt"""
        # Activate companion pack first
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        companion = next((p for p in packs if p["slug"] == "companion"), None)
        
        requests.post(f"{BASE_URL}/api/user/packs/{companion['id']}/unlock", headers=api_headers)
        requests.post(f"{BASE_URL}/api/user/packs/{companion['id']}/activate", headers=api_headers)
        
        # Verify active pack
        response = requests.get(f"{BASE_URL}/api/user/active-pack", headers=api_headers)
        active = response.json()
        assert active.get("slug") == "companion"
        
        # The chat should now use companion's system prompt
        # (We can't directly verify the prompt used, but we verify pack_name)
        response = requests.get(f"{BASE_URL}/api/agents", headers=api_headers)
        agents = response.json()
        devin = next((a for a in agents if a["name"].lower() == "devin"), None)
        
        if devin:
            response = requests.post(
                f"{BASE_URL}/api/agentic-chat",
                headers=api_headers,
                json={
                    "agent_id": devin["id"],
                    "message": "Say hi",
                    "user_id": "test_prompt_user"
                }
            )
            data = response.json()
            assert data.get("pack_name") == "Companion"
            print("PASS: Chat uses active pack's context")


class TestToolPermissionsWithPacks:
    """Tests for tool permissions respecting pack's allowed_tools"""
    
    def test_companion_pack_has_limited_tools(self, api_headers):
        """Companion pack should only allow save_memory and recall_memories"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        companion = next((p for p in packs if p["slug"] == "companion"), None)
        
        assert companion is not None
        tools = companion.get("allowed_tools", [])
        
        assert "save_memory" in tools
        assert "recall_memories" in tools
        assert "shell" not in tools, "Companion should not have shell access"
        assert "file_write" not in tools, "Companion should not have file_write"
        print("PASS: Companion pack has limited tools")
    
    def test_coder_pack_has_full_dev_tools(self, api_headers):
        """Coder pack should have shell, file access, etc."""
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        coder = next((p for p in packs if p["slug"] == "coder"), None)
        
        assert coder is not None
        tools = coder.get("allowed_tools", [])
        
        assert "shell" in tools
        assert "file_read" in tools
        assert "file_write" in tools
        print("PASS: Coder pack has full dev tools")


# Cleanup test - reset to coder pack
class TestCleanup:
    """Cleanup test to reset state"""
    
    def test_reset_to_coder_pack(self, api_headers):
        """Reset to coder pack for consistent state"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=api_headers)
        packs = response.json()
        coder = next((p for p in packs if p["slug"] == "coder"), None)
        
        if coder:
            requests.post(f"{BASE_URL}/api/user/packs/{coder['id']}/activate", headers=api_headers)
            print("CLEANUP: Reset to Coder pack")
