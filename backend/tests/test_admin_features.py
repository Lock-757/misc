"""
Backend API tests for Aurora AI Admin Features (Iteration 2):
- Admin authentication (X-Admin-Key header)
- Admin users endpoint
- Admin stats endpoint
- Admin download logs endpoint
- Download tracking endpoint
- Auth login/register (for test user setup)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback to read from frontend .env
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip()
                    break
    except:
        BASE_URL = 'https://aurora-forge-1.preview.emergentagent.com'

ADMIN_KEY = 'forge_master_2025'
ADMIN_HEADERS = {'X-Admin-Key': ADMIN_KEY}
WRONG_ADMIN_HEADERS = {'X-Admin-Key': 'wrong_key'}

TEST_EMAIL = 'test_session_user_12345@example.com'
TEST_PASSWORD = 'testpass123'
TEST_NAME = 'Test Session User'


@pytest.fixture(scope='module')
def session():
    """Shared requests session"""
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


@pytest.fixture(scope='module')
def auth_token(session):
    """Get auth token for test user - create if not exists"""
    # Try login first
    resp = session.post(f'{BASE_URL}/api/auth/login', json={
        'email': TEST_EMAIL, 'password': TEST_PASSWORD
    })
    if resp.status_code == 200:
        return resp.json().get('session_token')
    # Register if not exists
    resp = session.post(f'{BASE_URL}/api/auth/register', json={
        'email': TEST_EMAIL, 'password': TEST_PASSWORD, 'name': TEST_NAME
    })
    if resp.status_code == 200:
        return resp.json().get('session_token')
    pytest.skip(f'Could not get auth token: {resp.status_code} {resp.text}')


# ==================== Health Check ====================
class TestHealthCheck:
    """Basic health check"""

    def test_api_root(self, session):
        resp = session.get(f'{BASE_URL}/api/')
        assert resp.status_code == 200
        data = resp.json()
        assert 'version' in data or 'message' in data
        print(f'PASS: API root returned {resp.status_code}')


# ==================== Admin Authentication ====================
class TestAdminAuth:
    """Test admin key authentication"""

    def test_admin_users_with_valid_key(self, session):
        resp = session.get(f'{BASE_URL}/api/admin/users', headers=ADMIN_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f'PASS: admin/users returned {len(data)} users')

    def test_admin_users_without_key(self, session):
        resp = session.get(f'{BASE_URL}/api/admin/users')
        assert resp.status_code == 403
        print(f'PASS: admin/users without key returns 403')

    def test_admin_users_with_wrong_key(self, session):
        resp = session.get(f'{BASE_URL}/api/admin/users', headers=WRONG_ADMIN_HEADERS)
        assert resp.status_code == 403
        print(f'PASS: admin/users with wrong key returns 403')

    def test_admin_stats_with_valid_key(self, session):
        resp = session.get(f'{BASE_URL}/api/admin/stats', headers=ADMIN_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert 'total_users' in data
        assert 'total_conversations' in data
        assert 'total_images' in data
        assert 'total_downloads' in data
        assert isinstance(data['total_users'], int)
        print(f'PASS: admin/stats returned counts: {data}')

    def test_admin_stats_without_key(self, session):
        resp = session.get(f'{BASE_URL}/api/admin/stats')
        assert resp.status_code == 403
        print(f'PASS: admin/stats without key returns 403')

    def test_admin_download_logs_with_valid_key(self, session):
        resp = session.get(f'{BASE_URL}/api/admin/download-logs', headers=ADMIN_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f'PASS: admin/download-logs returned {len(data)} logs')

    def test_admin_download_logs_without_key(self, session):
        resp = session.get(f'{BASE_URL}/api/admin/download-logs')
        assert resp.status_code == 403
        print(f'PASS: admin/download-logs without key returns 403')


# ==================== Admin Users Data ====================
class TestAdminUsersData:
    """Test admin users endpoint data structure"""

    def test_users_have_expected_fields(self, session):
        resp = session.get(f'{BASE_URL}/api/admin/users', headers=ADMIN_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        if len(data) > 0:
            user = data[0]
            assert 'user_id' in user
            assert 'email' in user
            assert 'conversation_count' in user
            assert 'image_count' in user
            assert 'download_count' in user
            assert isinstance(user['conversation_count'], int)
            assert isinstance(user['image_count'], int)
            assert isinstance(user['download_count'], int)
            print(f'PASS: User fields validated: {list(user.keys())}')
        else:
            print('INFO: No users in DB yet, skipping field check')

    def test_password_hash_not_exposed(self, session):
        """Admin users endpoint must NOT expose password hashes"""
        resp = session.get(f'{BASE_URL}/api/admin/users', headers=ADMIN_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        for user in data:
            assert 'password_hash' not in user, 'Password hash exposed in admin users endpoint!'
        print('PASS: password_hash not in admin users response')


# ==================== Download Tracking ====================
class TestDownloadTracking:
    """Test download tracking endpoint"""

    def test_track_download_with_auth(self, session, auth_token):
        headers = {'Authorization': f'Bearer {auth_token}'}
        payload = {
            'image_id': 'test-img-001',
            'image_prompt': 'TEST_a beautiful sunset over mountains'
        }
        resp = session.post(f'{BASE_URL}/api/track-download', json=payload, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get('status') == 'logged'
        print(f'PASS: track-download returned status=logged')

    def test_track_download_appears_in_logs(self, session, auth_token):
        """After tracking a download, verify it appears in admin logs"""
        # Track a download first
        headers = {'Authorization': f'Bearer {auth_token}'}
        unique_prompt = 'TEST_VERIFY_IN_LOGS_aurora_sunset_unique123'
        payload = {'image_id': 'verify-test-img-002', 'image_prompt': unique_prompt}
        track_resp = session.post(f'{BASE_URL}/api/track-download', json=payload, headers=headers)
        assert track_resp.status_code == 200

        # Now check download logs
        logs_resp = session.get(f'{BASE_URL}/api/admin/download-logs', headers=ADMIN_HEADERS)
        assert logs_resp.status_code == 200
        logs = logs_resp.json()
        
        # Find the log entry we just created
        matching = [l for l in logs if l.get('image_prompt') == unique_prompt]
        assert len(matching) > 0, f'Download log entry not found for prompt: {unique_prompt}'
        log = matching[0]
        assert 'user_email' in log
        assert 'downloaded_at' in log
        assert 'image_id' in log
        print(f'PASS: Download log found in admin logs: {log["user_email"]}')

    def test_track_download_without_auth(self, session):
        """Track download without auth - should still work but as anonymous"""
        payload = {'image_id': 'anon-test-img-003', 'image_prompt': 'TEST_anonymous download'}
        resp = session.post(f'{BASE_URL}/api/track-download', json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get('status') == 'logged'
        print('PASS: Anonymous download tracking works')


# ==================== Admin User Conversations ====================
class TestAdminUserConversations:
    """Test admin view of user conversations"""

    def test_admin_get_user_conversations(self, session):
        """Get users list and try to get conversations for first user"""
        users_resp = session.get(f'{BASE_URL}/api/admin/users', headers=ADMIN_HEADERS)
        assert users_resp.status_code == 200
        users = users_resp.json()
        
        if not users:
            print('INFO: No users found, skipping conversation test')
            return
        
        user_id = users[0]['user_id']
        convos_resp = session.get(
            f'{BASE_URL}/api/admin/users/{user_id}/conversations',
            headers=ADMIN_HEADERS
        )
        assert convos_resp.status_code == 200
        data = convos_resp.json()
        assert isinstance(data, list)
        print(f'PASS: User {user_id} has {len(data)} conversations')

    def test_admin_conversations_without_key(self, session):
        resp = session.get(f'{BASE_URL}/api/admin/users/some-user-id/conversations')
        assert resp.status_code == 403
        print('PASS: Admin conversations endpoint protected without key')


# ==================== Regular Auth ====================
class TestRegularAuth:
    """Test regular user auth flows"""

    def test_login_valid_credentials(self, session):
        resp = session.post(f'{BASE_URL}/api/auth/login', json={
            'email': TEST_EMAIL, 'password': TEST_PASSWORD
        })
        assert resp.status_code == 200
        data = resp.json()
        assert 'session_token' in data
        assert data.get('email') == TEST_EMAIL
        print(f'PASS: Login returns session_token')

    def test_login_invalid_credentials(self, session):
        resp = session.post(f'{BASE_URL}/api/auth/login', json={
            'email': TEST_EMAIL, 'password': 'wrongpassword123'
        })
        assert resp.status_code == 401
        print(f'PASS: Invalid login returns 401')

    def test_auth_me_with_token(self, session, auth_token):
        headers = {'Authorization': f'Bearer {auth_token}'}
        resp = session.get(f'{BASE_URL}/api/auth/me', headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get('email') == TEST_EMAIL
        print(f'PASS: auth/me returns user data: {data["email"]}')

    def test_auth_me_without_token(self):
        """Use fresh session without cookies"""
        import requests as req
        fresh = req.Session()
        fresh.headers.update({'Content-Type': 'application/json'})
        resp = fresh.get(f'{BASE_URL}/api/auth/me')
        assert resp.status_code == 401
        print(f'PASS: auth/me without token returns 401')
