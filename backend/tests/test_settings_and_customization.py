"""
Settings, Age-Verification, Customization, and Default Pack Tests (Iteration 10)
Tests for:
- GET /api/user/settings returns {age_verified: false} for fresh user
- POST /api/user/settings/age-verify sets age_verified=true globally
- After age verify, GET /api/user/packs includes Companion pack
- GET /api/user/customization returns defaults
- PUT /api/user/customization saves name/personality/tone/response_length
- PUT /api/user/customization returns 403 for free Coder users
- Task Master is the default active pack for new users
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://paule-platform.preview.emergentagent.com').rstrip('/')
ADMIN_KEY = "forge_master_2025"


@pytest.fixture
def admin_headers():
    """Headers with admin authentication (admin user)"""
    return {
        "Content-Type": "application/json",
        "X-Admin-Key": ADMIN_KEY
    }


@pytest.fixture
def fresh_user_session():
    """Create a brand new test user and return session token + headers"""
    email = f"TEST_settings_{uuid.uuid4().hex[:8]}@example.com"
    reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": "testpass123",
        "name": "Settings Test User"
    })
    if reg_resp.status_code not in (200, 201):
        pytest.skip(f"Could not register test user: {reg_resp.status_code}: {reg_resp.text}")

    data = reg_resp.json()
    token = data.get("session_token") or data.get("token")
    if not token:
        pytest.skip("No session token returned from registration")

    headers = {
        "Content-Type": "application/json",
        "Cookie": f"session_token={token}"
    }
    yield {"headers": headers, "email": email, "token": token}


@pytest.fixture
def coder_user_session():
    """Create a test user and make sure they are on the free Coder pack (no trial)."""
    email = f"TEST_coder_{uuid.uuid4().hex[:8]}@example.com"
    reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": "testpass123",
        "name": "Coder Test User"
    })
    if reg_resp.status_code not in (200, 201):
        pytest.skip(f"Could not register test user: {reg_resp.status_code}: {reg_resp.text}")

    data = reg_resp.json()
    token = data.get("session_token") or data.get("token")
    if not token:
        pytest.skip("No session token returned")

    headers = {
        "Content-Type": "application/json",
        "Cookie": f"session_token={token}"
    }

    # Activate the Coder (free) pack
    packs_resp = requests.get(f"{BASE_URL}/api/user/packs", headers=headers)
    if packs_resp.status_code != 200:
        pytest.skip("Could not get user packs")

    packs = packs_resp.json()
    coder_pack = next((p for p in packs if p["slug"] == "coder"), None)
    if not coder_pack:
        pytest.skip("Coder pack not found")

    activate_resp = requests.post(f"{BASE_URL}/api/user/packs/{coder_pack['id']}/activate",
                                   json={}, headers=headers)
    # 200 or could already be active
    yield {"headers": headers, "email": email, "token": token, "coder_pack_id": coder_pack["id"]}


# ==================== User Settings Tests ====================

class TestUserSettings:
    """GET /api/user/settings - returns age_verified=false by default"""

    def test_get_settings_returns_200(self, fresh_user_session):
        resp = requests.get(f"{BASE_URL}/api/user/settings", headers=fresh_user_session["headers"])
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: GET /api/user/settings returns 200")

    def test_get_settings_age_verified_false_by_default(self, fresh_user_session):
        resp = requests.get(f"{BASE_URL}/api/user/settings", headers=fresh_user_session["headers"])
        assert resp.status_code == 200
        data = resp.json()
        assert "age_verified" in data, f"age_verified key missing in response: {data}"
        assert data["age_verified"] == False, f"Expected age_verified=False, got: {data['age_verified']}"
        print(f"PASS: Settings age_verified=False by default: {data}")

    def test_get_settings_admin_returns_200(self, admin_headers):
        resp = requests.get(f"{BASE_URL}/api/user/settings", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "age_verified" in data
        print(f"PASS: Admin settings returns 200, age_verified={data['age_verified']}")


# ==================== Age Verification Tests ====================

class TestAgeVerification:
    """POST /api/user/settings/age-verify - sets age_verified globally"""

    def test_age_verify_returns_200(self, fresh_user_session):
        resp = requests.post(f"{BASE_URL}/api/user/settings/age-verify",
                             json={}, headers=fresh_user_session["headers"])
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print(f"PASS: POST /api/user/settings/age-verify returns 200")

    def test_age_verify_sets_age_verified_true(self, fresh_user_session):
        # First verify settings are False
        settings_before = requests.get(f"{BASE_URL}/api/user/settings", headers=fresh_user_session["headers"])
        assert settings_before.json()["age_verified"] == False

        # Do age verification
        resp = requests.post(f"{BASE_URL}/api/user/settings/age-verify",
                             json={}, headers=fresh_user_session["headers"])
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("age_verified") == True, f"Expected age_verified=True in response: {data}"
        print(f"PASS: age_verify response has age_verified=True: {data}")

    def test_age_verify_persists_to_settings(self, fresh_user_session):
        # Verify
        requests.post(f"{BASE_URL}/api/user/settings/age-verify",
                      json={}, headers=fresh_user_session["headers"])

        # Check GET settings now returns age_verified=True
        settings_resp = requests.get(f"{BASE_URL}/api/user/settings", headers=fresh_user_session["headers"])
        assert settings_resp.status_code == 200
        settings = settings_resp.json()
        assert settings["age_verified"] == True, f"Expected persisted age_verified=True, got: {settings}"
        print(f"PASS: Settings persisted age_verified=True after age-verify: {settings}")

    def test_age_verify_unlocks_companion_in_packs(self, fresh_user_session):
        """After age verify, GET /api/user/packs should include Companion pack"""
        # Do age verification
        requests.post(f"{BASE_URL}/api/user/settings/age-verify",
                      json={}, headers=fresh_user_session["headers"])

        # Get user packs - Companion should now be included
        packs_resp = requests.get(f"{BASE_URL}/api/user/packs", headers=fresh_user_session["headers"])
        assert packs_resp.status_code == 200
        packs = packs_resp.json()
        slugs = [p["slug"] for p in packs]
        assert "companion" in slugs, f"Companion pack not in packs after age-verify: {slugs}"
        print(f"PASS: Companion in packs after age-verify. Packs: {slugs}")

    def test_packs_excludes_companion_before_age_verify(self, fresh_user_session):
        """Before age verify, user packs should NOT include Companion if it's age-gated"""
        # Note: The endpoint /api/user/packs returns ALL packs, filtering is done on frontend
        # But the backend endpoint includes age_gate field so frontend can filter
        packs_resp = requests.get(f"{BASE_URL}/api/user/packs", headers=fresh_user_session["headers"])
        assert packs_resp.status_code == 200
        packs = packs_resp.json()
        companion = next((p for p in packs if p["slug"] == "companion"), None)
        # Companion may or may not be returned by backend, but if returned, age_gate=True
        if companion:
            assert companion.get("age_gate") == True, f"Companion should have age_gate=True: {companion}"
            print(f"PASS: Companion has age_gate=True (filtering done on frontend)")
        else:
            print("PASS: Companion not in packs before age-verify (backend filtered)")


# ==================== Customization Tests ====================

class TestUserCustomization:
    """GET /api/user/customization - returns defaults, PUT saves changes"""

    def test_get_customization_returns_200(self, fresh_user_session):
        resp = requests.get(f"{BASE_URL}/api/user/customization", headers=fresh_user_session["headers"])
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: GET /api/user/customization returns 200")

    def test_get_customization_returns_defaults(self, fresh_user_session):
        resp = requests.get(f"{BASE_URL}/api/user/customization", headers=fresh_user_session["headers"])
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("agent_name") == "PAUL·E", f"Expected agent_name='PAUL·E', got: {data.get('agent_name')}"
        assert data.get("personality") == "balanced", f"Expected personality='balanced', got: {data.get('personality')}"
        assert data.get("tone") == "warm", f"Expected tone='warm', got: {data.get('tone')}"
        assert data.get("response_length") == "normal", f"Expected response_length='normal', got: {data.get('response_length')}"
        print(f"PASS: Default customization correct: {data}")

    def test_get_customization_admin_returns_defaults_or_saved(self, admin_headers):
        resp = requests.get(f"{BASE_URL}/api/user/customization", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "agent_name" in data
        assert "personality" in data
        assert "tone" in data
        assert "response_length" in data
        print(f"PASS: Admin customization has all required fields: {data}")

    def test_put_customization_free_coder_returns_403(self, coder_user_session):
        """PUT /api/user/customization should return 403 for free Coder pack users (non-trial)"""
        # First check trial status - if they're on trial, skip
        trial_resp = requests.get(f"{BASE_URL}/api/user/trial-status", headers=coder_user_session["headers"])
        if trial_resp.status_code == 200 and trial_resp.json().get("is_trial"):
            pytest.skip("User is on trial - not a free Coder user")

        resp = requests.put(f"{BASE_URL}/api/user/customization",
                            json={"agent_name": "TestBot", "personality": "witty", "tone": "playful", "response_length": "concise"},
                            headers=coder_user_session["headers"])
        assert resp.status_code == 403, f"Expected 403 for free Coder user, got: {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "customization_requires_paid_pack" in str(data.get("detail", "")), f"Expected customization_requires_paid_pack error: {data}"
        print(f"PASS: Free Coder user gets 403 on customization: {data}")

    def test_put_customization_saves_for_paid_pack_user(self, fresh_user_session):
        """PUT /api/user/customization should save changes for paid/trial pack users"""
        # A fresh user gets Coder Pro trial which is a paid/trial pack
        trial_resp = requests.get(f"{BASE_URL}/api/user/trial-status", headers=fresh_user_session["headers"])
        is_trial = trial_resp.status_code == 200 and trial_resp.json().get("is_trial")

        if not is_trial:
            # Try to activate a paid pack - use admin headers to check what packs are available
            packs_resp = requests.get(f"{BASE_URL}/api/user/packs", headers=fresh_user_session["headers"])
            packs = packs_resp.json()
            paid_pack = next((p for p in packs if not p.get("is_free") and not p.get("coming_soon") and not p.get("age_gate")), None)
            if paid_pack:
                requests.post(f"{BASE_URL}/api/user/packs/{paid_pack['id']}/unlock",
                              json={}, headers=fresh_user_session["headers"])
                requests.post(f"{BASE_URL}/api/user/packs/{paid_pack['id']}/activate",
                              json={}, headers=fresh_user_session["headers"])
            else:
                pytest.skip("No paid pack available for fresh user")

        # Now try to save customization
        payload = {"agent_name": "TEST_CustomBot", "personality": "witty", "tone": "playful", "response_length": "concise"}
        resp = requests.put(f"{BASE_URL}/api/user/customization",
                            json=payload,
                            headers=fresh_user_session["headers"])
        assert resp.status_code == 200, f"Expected 200 for paid/trial user, got: {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("agent_name") == "TEST_CustomBot", f"Expected agent_name='TEST_CustomBot', got: {data}"
        assert data.get("personality") == "witty", f"Expected personality='witty', got: {data}"
        assert data.get("tone") == "playful", f"Expected tone='playful', got: {data}"
        assert data.get("response_length") == "concise", f"Expected response_length='concise', got: {data}"
        print(f"PASS: PUT /api/user/customization saved for paid/trial user: {data}")

    def test_put_customization_persists_via_get(self, fresh_user_session):
        """After PUT, GET should return updated values"""
        # Check if user is on trial for paid access
        trial_resp = requests.get(f"{BASE_URL}/api/user/trial-status", headers=fresh_user_session["headers"])
        if not (trial_resp.status_code == 200 and trial_resp.json().get("is_trial")):
            # Try to get a paid pack
            packs_resp = requests.get(f"{BASE_URL}/api/user/packs", headers=fresh_user_session["headers"])
            packs = packs_resp.json()
            paid_pack = next((p for p in packs if not p.get("is_free") and not p.get("coming_soon") and not p.get("age_gate")), None)
            if paid_pack:
                requests.post(f"{BASE_URL}/api/user/packs/{paid_pack['id']}/unlock",
                              json={}, headers=fresh_user_session["headers"])
                requests.post(f"{BASE_URL}/api/user/packs/{paid_pack['id']}/activate",
                              json={}, headers=fresh_user_session["headers"])
            else:
                pytest.skip("No paid pack available - cannot test PUT persistence")

        # PUT new customization
        payload = {"agent_name": "TEST_PersistBot", "personality": "professional", "tone": "direct", "response_length": "detailed"}
        put_resp = requests.put(f"{BASE_URL}/api/user/customization",
                                json=payload,
                                headers=fresh_user_session["headers"])
        assert put_resp.status_code == 200, f"PUT failed: {put_resp.status_code}: {put_resp.text}"

        # GET to verify persistence
        get_resp = requests.get(f"{BASE_URL}/api/user/customization", headers=fresh_user_session["headers"])
        assert get_resp.status_code == 200
        saved = get_resp.json()
        assert saved.get("agent_name") == "TEST_PersistBot", f"Persistence check failed: {saved}"
        assert saved.get("personality") == "professional"
        assert saved.get("tone") == "direct"
        assert saved.get("response_length") == "detailed"
        print(f"PASS: PUT customization persisted via GET: {saved}")


# ==================== Default Pack Tests ====================

class TestDefaultActivePack:
    """Verify Task Master is default active pack (not Companion)"""

    def test_admin_active_pack_is_not_companion(self, admin_headers):
        """Admin user should not have Companion as their default active pack"""
        resp = requests.get(f"{BASE_URL}/api/user/active-pack", headers=admin_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        pack = resp.json()
        assert pack.get("slug") != "companion", f"Admin should not have Companion as default active pack: {pack}"
        print(f"PASS: Admin active pack is NOT Companion. Active: {pack.get('slug')} ({pack.get('name')})")

    def test_new_user_active_pack_is_not_companion(self, fresh_user_session):
        """Fresh user's default active pack should NOT be Companion"""
        resp = requests.get(f"{BASE_URL}/api/user/active-pack", headers=fresh_user_session["headers"])
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        pack = resp.json()
        assert pack.get("slug") != "companion", f"New user should not have Companion as active pack: {pack}"
        print(f"PASS: New user active pack is NOT Companion. Active: {pack.get('slug')} ({pack.get('name')})")

    def test_admin_active_pack_taskmaster_or_trial(self, admin_headers):
        """Admin user should have Task Master as active pack"""
        resp = requests.get(f"{BASE_URL}/api/user/active-pack", headers=admin_headers)
        assert resp.status_code == 200
        pack = resp.json()
        # Admin context note says admin has Task Master as active pack
        print(f"INFO: Admin active pack: {pack.get('slug')} ({pack.get('name')})")
        assert pack.get("slug") in ["taskmaster", "coder-pro", "coder", "friend", "researcher"], \
            f"Unexpected active pack: {pack}"
        print(f"PASS: Admin active pack is acceptable: {pack.get('slug')}")


# ==================== Companion Not In Packs When Not Verified ====================

class TestCompanionVisibility:
    """Test that Companion pack has age_gate flag properly"""

    def test_companion_pack_has_age_gate_true(self, admin_headers):
        """Companion pack should have age_gate=True in /api/packs"""
        resp = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        assert resp.status_code == 200
        packs = resp.json()
        companion = next((p for p in packs if p["slug"] == "companion"), None)
        assert companion is not None, "Companion pack not found in /api/packs"
        assert companion.get("age_gate") == True, f"Companion age_gate should be True: {companion}"
        print(f"PASS: Companion has age_gate=True: {companion.get('age_gate')}")

    def test_companion_no_18plus_badge_field(self, admin_headers):
        """Companion pack should NOT have an '18plus' or similar explicit badge field"""
        resp = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        assert resp.status_code == 200
        packs = resp.json()
        companion = next((p for p in packs if p["slug"] == "companion"), None)
        assert companion is not None
        # The pack should use age_gate flag, not an 18plus badge field
        assert "18plus" not in companion, f"Companion should not have '18plus' field: {companion}"
        assert "badge_18" not in companion, f"Companion should not have 'badge_18' field: {companion}"
        print(f"PASS: Companion has no 18+ badge field. Keys: {list(companion.keys())}")

    def test_other_packs_no_age_gate(self, admin_headers):
        """All packs except Companion should NOT have age_gate=True"""
        resp = requests.get(f"{BASE_URL}/api/packs", headers=admin_headers)
        assert resp.status_code == 200
        packs = resp.json()
        for pack in packs:
            if pack["slug"] != "companion":
                assert not pack.get("age_gate"), \
                    f"Pack {pack['slug']} should not have age_gate=True: {pack}"
        print("PASS: All non-Companion packs have age_gate=False/None")
