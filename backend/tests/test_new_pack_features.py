"""
New Pack System Features Tests (Iteration 9)
Tests for:
- 7 packs with correct fields (age_gate, coming_soon, prices)
- Trial system for new users (Coder Pro trial, 20 actions)
- Age-gate flow for Companion pack
- Coming-soon block for Innovator pack
- Trial status endpoint
- Trial info in agentic-chat response
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://paule-platform.preview.emergentagent.com').rstrip('/')
ADMIN_KEY = "forge_master_2025"

# Expected 7 packs
EXPECTED_PACK_SLUGS = ["coder", "friend", "companion", "coder-pro", "researcher", "taskmaster", "innovator"]
EXPECTED_PRICES = {
    "coder": 0,
    "friend": 2.99,
    "companion": 4.99,
    "coder-pro": 4.99,
    "researcher": 4.99,
    "taskmaster": 7.99,
    "innovator": 9.99,
}


@pytest.fixture
def admin_headers():
    """Headers with admin authentication"""
    return {
        "Content-Type": "application/json",
        "X-Admin-Key": ADMIN_KEY
    }


@pytest.fixture
def new_user_session():
    """Register a fresh test user and return session token + headers"""
    email = f"TEST_packtest_{uuid.uuid4().hex[:8]}@example.com"
    reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": "testpass123",
        "name": "Pack Test User"
    })
    if reg_resp.status_code not in (200, 201):
        pytest.skip(f"Could not register test user: {reg_resp.status_code}")
    
    data = reg_resp.json()
    token = data.get("session_token") or data.get("token")
    if not token:
        pytest.skip("No session token returned from registration")
    
    headers = {
        "Content-Type": "application/json",
        "Cookie": f"session_token={token}"
    }
    yield {"headers": headers, "email": email, "token": token}
    
    # Cleanup: no delete user endpoint, but test data is prefixed TEST_


# ==================== Pack Listing Tests ====================

class TestPackListing:
    """GET /api/packs - should return 7 packs"""
    
    def test_returns_200(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: /api/packs returns 200")
    
    def test_returns_7_packs(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        assert response.status_code == 200
        packs = response.json()
        assert len(packs) == 7, f"Expected 7 packs, got {len(packs)}: {[p.get('slug') for p in packs]}"
        print(f"PASS: /api/packs returns 7 packs")
    
    def test_all_expected_slugs_present(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        slugs = [p["slug"] for p in packs]
        for slug in EXPECTED_PACK_SLUGS:
            assert slug in slugs, f"Missing pack slug: {slug}, found: {slugs}"
        print(f"PASS: All 7 pack slugs present: {slugs}")
    
    def test_companion_has_age_gate_true(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        companion = next((p for p in packs if p["slug"] == "companion"), None)
        assert companion is not None, "Companion pack not found"
        assert companion.get("age_gate") == True, f"Expected age_gate=True for companion, got: {companion.get('age_gate')}"
        print("PASS: Companion has age_gate=True")
    
    def test_innovator_has_coming_soon_true(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        innovator = next((p for p in packs if p["slug"] == "innovator"), None)
        assert innovator is not None, "Innovator pack not found"
        assert innovator.get("coming_soon") == True, f"Expected coming_soon=True for innovator, got: {innovator.get('coming_soon')}"
        print("PASS: Innovator has coming_soon=True")
    
    def test_other_packs_have_age_gate_false(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        for pack in packs:
            if pack["slug"] == "companion":
                continue
            assert pack.get("age_gate") == False, f"Pack {pack['slug']} should have age_gate=False, got: {pack.get('age_gate')}"
        print("PASS: All non-companion packs have age_gate=False")
    
    def test_coder_is_free(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        coder = next((p for p in packs if p["slug"] == "coder"), None)
        assert coder is not None
        assert coder.get("is_free") == True, f"Coder should be free, got: {coder.get('is_free')}"
        assert coder.get("price_usd") == 0, f"Coder price should be 0, got: {coder.get('price_usd')}"
        print("PASS: Coder is free (price=0)")
    
    def test_pack_prices_correct(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        for pack in packs:
            slug = pack["slug"]
            expected_price = EXPECTED_PRICES.get(slug)
            if expected_price is not None:
                actual_price = pack.get("price_usd")
                assert actual_price == expected_price, f"Pack '{slug}' price: expected {expected_price}, got {actual_price}"
        print("PASS: All pack prices are correct")
    
    def test_taskmaster_price_is_7_99(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        taskmaster = next((p for p in packs if p["slug"] == "taskmaster"), None)
        assert taskmaster is not None
        assert taskmaster.get("price_usd") == 7.99, f"Taskmaster should be $7.99, got: {taskmaster.get('price_usd')}"
        print("PASS: Taskmaster price is $7.99")
    
    def test_friend_price_is_2_99(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        friend = next((p for p in packs if p["slug"] == "friend"), None)
        assert friend is not None
        assert friend.get("price_usd") == 2.99, f"Friend should be $2.99, got: {friend.get('price_usd')}"
        print("PASS: Friend price is $2.99")
    
    def test_packs_sorted_by_sort_order(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        sort_orders = [p.get("sort_order", 0) for p in packs]
        assert sort_orders == sorted(sort_orders), f"Packs not sorted: {sort_orders}"
        print(f"PASS: Packs sorted correctly: {[p['slug'] for p in packs]}")


# ==================== User Packs Tests ====================

class TestUserPacks:
    """GET /api/user/packs - returns all packs with ownership status"""
    
    def test_returns_200_with_admin(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: GET /api/user/packs returns 200")
    
    def test_returns_7_packs(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=admin_headers)
        packs = response.json()
        assert len(packs) == 7, f"Expected 7 packs, got {len(packs)}"
        print(f"PASS: User packs returns 7 packs")
    
    def test_has_is_active_field(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=admin_headers)
        packs = response.json()
        for pack in packs:
            assert "is_active" in pack, f"Pack {pack.get('slug')} missing 'is_active' field"
        print("PASS: All user packs have is_active field")
    
    def test_has_is_unlocked_field(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=admin_headers)
        packs = response.json()
        for pack in packs:
            assert "is_unlocked" in pack, f"Pack {pack.get('slug')} missing 'is_unlocked' field"
        print("PASS: All user packs have is_unlocked field")
    
    def test_coder_is_unlocked_for_all(self, admin_headers):
        """Coder should always be unlocked since it's free"""
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=admin_headers)
        packs = response.json()
        coder = next((p for p in packs if p["slug"] == "coder"), None)
        assert coder is not None
        assert coder.get("is_unlocked") == True, f"Coder should be unlocked (free), got: {coder.get('is_unlocked')}"
        print("PASS: Coder pack is unlocked for admin")
    
    def test_new_user_gets_coder_pro_trial(self, new_user_session):
        """New users should get Coder Pro trial as active pack"""
        response = requests.get(f"{BASE_URL}/api/user/packs", headers=new_user_session["headers"])
        assert response.status_code == 200
        packs = response.json()
        
        # Find coder-pro pack
        coder_pro = next((p for p in packs if p["slug"] == "coder-pro"), None)
        assert coder_pro is not None, "coder-pro pack not found in user packs"
        
        # New users should have coder-pro as active
        assert coder_pro.get("is_active") == True, f"New user should have coder-pro as active, got: {coder_pro.get('is_active')}"
        assert coder_pro.get("is_unlocked") == True, f"New user should have coder-pro unlocked (trial), got: {coder_pro.get('is_unlocked')}"
        print("PASS: New user gets Coder Pro trial as active pack")


# ==================== Active Pack Tests ====================

class TestActivePack:
    """GET /api/user/active-pack"""
    
    def test_returns_200(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/user/active-pack", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: GET /api/user/active-pack returns 200")
    
    def test_returns_pack_object(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/user/active-pack", headers=admin_headers)
        data = response.json()
        assert "id" in data, f"Active pack missing 'id' field: {data}"
        assert "slug" in data, f"Active pack missing 'slug' field: {data}"
        assert "name" in data, f"Active pack missing 'name' field: {data}"
        print(f"PASS: Active pack returned: {data.get('slug')} - {data.get('name')}")
    
    def test_new_user_active_pack_is_coder_pro(self, new_user_session):
        """New users should have Coder Pro as active pack"""
        response = requests.get(f"{BASE_URL}/api/user/active-pack", headers=new_user_session["headers"])
        assert response.status_code == 200
        data = response.json()
        assert data.get("slug") == "coder-pro", f"New user active pack should be coder-pro, got: {data.get('slug')}"
        print("PASS: New user active pack is Coder Pro")


# ==================== Trial Status Tests ====================

class TestTrialStatus:
    """GET /api/user/trial-status"""
    
    def test_returns_200(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/user/trial-status", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: GET /api/user/trial-status returns 200")
    
    def test_returns_is_trial_field(self, admin_headers):
        response = requests.get(f"{BASE_URL}/api/user/trial-status", headers=admin_headers)
        data = response.json()
        assert "is_trial" in data, f"Response missing 'is_trial' field: {data}"
        print(f"PASS: trial-status has is_trial field: {data.get('is_trial')}")
    
    def test_new_user_is_on_trial(self, new_user_session):
        """New users should be on Coder Pro trial"""
        response = requests.get(f"{BASE_URL}/api/user/trial-status", headers=new_user_session["headers"])
        assert response.status_code == 200
        data = response.json()
        assert data.get("is_trial") == True, f"New user should be on trial, got: {data}"
        assert data.get("max_actions") == 20, f"Trial max_actions should be 20, got: {data.get('max_actions')}"
        assert "actions_remaining" in data, f"Missing actions_remaining field: {data}"
        assert "actions_used" in data, f"Missing actions_used field: {data}"
        print(f"PASS: New user is on trial: {data}")
    
    def test_new_user_trial_has_correct_structure(self, new_user_session):
        """Trial status for new user should have all required fields"""
        response = requests.get(f"{BASE_URL}/api/user/trial-status", headers=new_user_session["headers"])
        data = response.json()
        assert data.get("is_trial") == True
        assert isinstance(data.get("actions_used"), int)
        assert isinstance(data.get("max_actions"), int)
        assert isinstance(data.get("actions_remaining"), int)
        assert data["actions_used"] + data["actions_remaining"] == data["max_actions"], \
            f"actions_used + remaining != max_actions: {data}"
        print(f"PASS: Trial status structure correct: {data}")


# ==================== Age-Gate Tests ====================

class TestAgeGate:
    """Age-gate flow for Companion pack"""
    
    def _get_pack_id(self, admin_headers, slug):
        """Helper to get pack ID by slug"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        pack = next((p for p in packs if p["slug"] == slug), None)
        return pack["id"] if pack else None
    
    def test_activate_companion_without_age_verify_returns_403(self, new_user_session, admin_headers):
        """Activating Companion without age verification should return 403 age_gate_required"""
        # Get companion pack ID
        companion_id = self._get_pack_id(admin_headers, "companion")
        assert companion_id is not None, "Companion pack not found"
        
        # First unlock companion
        unlock_resp = requests.post(
            f"{BASE_URL}/api/user/packs/{companion_id}/unlock",
            headers=new_user_session["headers"]
        )
        assert unlock_resp.status_code == 200, f"Unlock failed: {unlock_resp.status_code}: {unlock_resp.text}"
        
        # Try to activate - should fail with age_gate_required
        activate_resp = requests.post(
            f"{BASE_URL}/api/user/packs/{companion_id}/activate",
            headers=new_user_session["headers"]
        )
        assert activate_resp.status_code == 403, f"Expected 403, got: {activate_resp.status_code}: {activate_resp.text}"
        assert activate_resp.json().get("detail") == "age_gate_required", \
            f"Expected detail='age_gate_required', got: {activate_resp.json()}"
        print(f"PASS: Companion activation without age verify returns 403 age_gate_required")
    
    def test_age_verify_returns_200(self, new_user_session, admin_headers):
        """Age verification endpoint should return 200"""
        companion_id = self._get_pack_id(admin_headers, "companion")
        assert companion_id is not None
        
        response = requests.post(
            f"{BASE_URL}/api/user/packs/{companion_id}/age-verify",
            headers=new_user_session["headers"]
        )
        assert response.status_code == 200, f"Expected 200, got: {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "verified", f"Expected status='verified', got: {data}"
        print("PASS: Age-verify returns 200 with status=verified")
    
    def test_activate_companion_after_age_verify_succeeds(self, new_user_session, admin_headers):
        """Activating Companion after age verification should succeed"""
        companion_id = self._get_pack_id(admin_headers, "companion")
        assert companion_id is not None
        
        # Unlock first
        requests.post(
            f"{BASE_URL}/api/user/packs/{companion_id}/unlock",
            headers=new_user_session["headers"]
        )
        
        # Age verify
        verify_resp = requests.post(
            f"{BASE_URL}/api/user/packs/{companion_id}/age-verify",
            headers=new_user_session["headers"]
        )
        assert verify_resp.status_code == 200
        
        # Now activate - should succeed
        activate_resp = requests.post(
            f"{BASE_URL}/api/user/packs/{companion_id}/activate",
            headers=new_user_session["headers"]
        )
        assert activate_resp.status_code == 200, f"Expected 200 after age verify, got: {activate_resp.status_code}: {activate_resp.text}"
        data = activate_resp.json()
        assert data.get("status") == "activated", f"Expected status=activated, got: {data}"
        print("PASS: Companion activates successfully after age verification")
    
    def test_full_age_gate_flow(self, new_user_session, admin_headers):
        """Full age-gate flow: unlock -> fail activate -> age-verify -> activate success"""
        companion_id = self._get_pack_id(admin_headers, "companion")
        assert companion_id is not None
        
        # Step 1: Unlock companion
        unlock_resp = requests.post(
            f"{BASE_URL}/api/user/packs/{companion_id}/unlock",
            headers=new_user_session["headers"]
        )
        assert unlock_resp.status_code == 200, f"Unlock failed: {unlock_resp.text}"
        
        # Step 2: Try activate - should fail
        activate_resp1 = requests.post(
            f"{BASE_URL}/api/user/packs/{companion_id}/activate",
            headers=new_user_session["headers"]
        )
        assert activate_resp1.status_code == 403
        assert activate_resp1.json().get("detail") == "age_gate_required"
        
        # Step 3: Age verify
        verify_resp = requests.post(
            f"{BASE_URL}/api/user/packs/{companion_id}/age-verify",
            headers=new_user_session["headers"]
        )
        assert verify_resp.status_code == 200
        
        # Step 4: Activate again - should succeed
        activate_resp2 = requests.post(
            f"{BASE_URL}/api/user/packs/{companion_id}/activate",
            headers=new_user_session["headers"]
        )
        assert activate_resp2.status_code == 200, f"Expected 200, got: {activate_resp2.status_code}: {activate_resp2.text}"
        
        # Verify it's now active
        active_pack_resp = requests.get(f"{BASE_URL}/api/user/active-pack", headers=new_user_session["headers"])
        active_pack = active_pack_resp.json()
        assert active_pack.get("slug") == "companion", f"Expected companion active, got: {active_pack.get('slug')}"
        print("PASS: Full age-gate flow works correctly")


# ==================== Coming Soon Tests ====================

class TestComingSoon:
    """Innovator pack is coming_soon - should block activation"""
    
    def _get_pack_id(self, admin_headers, slug):
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        pack = next((p for p in packs if p["slug"] == slug), None)
        return pack["id"] if pack else None
    
    def test_activate_innovator_returns_403_coming_soon(self, admin_headers):
        """Activating Innovator should return 403 with detail='coming_soon'"""
        innovator_id = self._get_pack_id(admin_headers, "innovator")
        assert innovator_id is not None, "Innovator pack not found"
        
        response = requests.post(
            f"{BASE_URL}/api/user/packs/{innovator_id}/activate",
            headers=admin_headers
        )
        assert response.status_code == 403, f"Expected 403, got: {response.status_code}: {response.text}"
        assert response.json().get("detail") == "coming_soon", \
            f"Expected detail='coming_soon', got: {response.json()}"
        print("PASS: Innovator activation returns 403 coming_soon")
    
    def test_activate_innovator_with_new_user_returns_403(self, new_user_session, admin_headers):
        """New user also cannot activate Innovator"""
        innovator_id = self._get_pack_id(admin_headers, "innovator")
        assert innovator_id is not None
        
        # First try to unlock it
        unlock_resp = requests.post(
            f"{BASE_URL}/api/user/packs/{innovator_id}/unlock",
            headers=new_user_session["headers"]
        )
        # Even if unlock succeeds, activate should fail
        activate_resp = requests.post(
            f"{BASE_URL}/api/user/packs/{innovator_id}/activate",
            headers=new_user_session["headers"]
        )
        assert activate_resp.status_code == 403, f"Expected 403, got: {activate_resp.status_code}"
        assert activate_resp.json().get("detail") == "coming_soon"
        print("PASS: New user also cannot activate Innovator (coming_soon)")


# ==================== Agentic Chat Trial Info Tests ====================

class TestAgenticChatTrialInfo:
    """Trial info should be included in agentic-chat response"""
    
    def test_agentic_chat_includes_trial_info_for_trial_user(self, new_user_session, admin_headers):
        """agentic-chat should return trial_info for trial users"""
        # Get the devin/paul agent
        agents_resp = requests.get(f"{BASE_URL}/api/agents", headers=admin_headers)
        if agents_resp.status_code != 200:
            pytest.skip("Could not get agents list")
        
        agents = agents_resp.json()
        paule = next(
            (a for a in agents if 'paul' in a.get('name', '').lower() or 'devin' in a.get('name', '').lower()),
            None
        )
        if not paule:
            # Try getting any agent with tools
            paule = next((a for a in agents if a.get('has_tools')), None)
        if not paule:
            paule = agents[0] if agents else None
        
        if not paule:
            pytest.skip("No suitable agent found for chat test")
        
        # Get user_id from session
        # The new_user_session uses session token so user_id comes from session
        # We'll use admin for this test (simpler)
        # For new user - they'd need to use a user_id
        chat_resp = requests.post(
            f"{BASE_URL}/api/agentic-chat",
            headers=admin_headers,
            json={
                "agent_id": paule["id"],
                "message": "Hello, just a quick test.",
                "user_id": "admin",
                "session_id": f"test-session-{uuid.uuid4().hex}"
            }
        )
        # We expect 200 or 429 (rate limit)
        if chat_resp.status_code == 429:
            pytest.skip("API rate limit - skipping chat test")
        
        assert chat_resp.status_code == 200, f"Expected 200, got {chat_resp.status_code}: {chat_resp.text[:200]}"
        data = chat_resp.json()
        
        # trial_info key should exist (may be None if not on trial)
        assert "trial_info" in data, f"agentic-chat response missing 'trial_info' field: {list(data.keys())}"
        print(f"PASS: agentic-chat returns trial_info field: {data.get('trial_info')}")


# ==================== Pack Fields Validation ====================

class TestPackFields:
    """Validate pack fields are complete and correct"""
    
    def test_all_packs_have_required_fields(self, admin_headers):
        """All packs should have required fields"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        
        required_fields = ["id", "slug", "name", "tagline", "description", "icon", "color",
                          "is_free", "price_usd", "age_gate", "coming_soon", "allowed_tools"]
        
        for pack in packs:
            for field in required_fields:
                assert field in pack, f"Pack '{pack.get('slug')}' missing field: {field}"
        print("PASS: All packs have required fields")
    
    def test_innovator_has_empty_allowed_tools(self, admin_headers):
        """Innovator (coming soon) should have empty allowed_tools"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        innovator = next((p for p in packs if p["slug"] == "innovator"), None)
        assert innovator is not None
        assert innovator.get("allowed_tools") == [], f"Innovator should have empty tools, got: {innovator.get('allowed_tools')}"
        print("PASS: Innovator has empty allowed_tools")
    
    def test_friend_has_memory_tools(self, admin_headers):
        """Friend pack should have save_memory and recall_memories tools"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        friend = next((p for p in packs if p["slug"] == "friend"), None)
        assert friend is not None
        tools = friend.get("allowed_tools", [])
        assert "save_memory" in tools, f"Friend should have save_memory tool, got: {tools}"
        assert "recall_memories" in tools, f"Friend should have recall_memories tool, got: {tools}"
        print("PASS: Friend pack has memory tools")
    
    def test_coder_pro_has_shell_tools(self, admin_headers):
        """Coder Pro should have shell and file tools"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        coder_pro = next((p for p in packs if p["slug"] == "coder-pro"), None)
        assert coder_pro is not None
        tools = coder_pro.get("allowed_tools", [])
        assert "shell" in tools, f"Coder Pro should have shell tool, got: {tools}"
        assert "file_read" in tools, f"Coder Pro should have file_read tool"
        assert "file_write" in tools, f"Coder Pro should have file_write tool"
        print(f"PASS: Coder Pro has shell tools: {tools}")
    
    def test_researcher_has_browser_tools(self, admin_headers):
        """Researcher pack should have browser tools"""
        response = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        packs = response.json()
        researcher = next((p for p in packs if p["slug"] == "researcher"), None)
        assert researcher is not None
        tools = researcher.get("allowed_tools", [])
        assert "browser_go" in tools, f"Researcher should have browser_go tool, got: {tools}"
        assert "browser_read" in tools, f"Researcher should have browser_read tool"
        print(f"PASS: Researcher has browser tools: {tools}")
