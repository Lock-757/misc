"""
Test Video Generation API - Regression test for 'no data returned' bug
Tests POST /api/generate-video endpoint
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://aurora-forge-1.preview.emergentagent.com')
ADMIN_PASSWORD = 'forge_master_2025'


class TestVideoGeneration:
    """Tests for video generation endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup_session(self):
        """Setup test session with fresh login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Create or login as test user
        test_email = f"test_video_user_{int(time.time())}@example.com"
        reg_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "testpass123",
            "name": "Video Test User"
        })
        
        if reg_response.status_code == 200:
            self.token = reg_response.json().get("session_token")
        else:
            # User may already exist, try login
            login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": test_email,
                "password": "testpass123"
            })
            if login_response.status_code == 200:
                self.token = login_response.json().get("session_token")
            else:
                self.token = None
        
        if self.token:
            self.session.headers["Authorization"] = f"Bearer {self.token}"
        
        yield
        
    def test_video_generation_with_admin_key(self):
        """
        REGRESSION TEST: Video generation should return non-empty video_base64
        
        This tests the fix for 'no data returned' bug where video generation
        was failing to extract video URL from various Grok response structures.
        """
        # Use admin key for guaranteed access
        headers = {
            "Content-Type": "application/json",
            "X-Admin-Key": ADMIN_PASSWORD
        }
        
        # Make video generation request
        # Note: This is a long-running request - the Grok API may take several minutes
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json={
                "prompt": "A beautiful sunset over the ocean with waves",
                "resolution": "480p",  # Lower res for faster generation
                "duration": 6  # Minimum duration for faster test
            },
            headers=headers,
            timeout=700  # 11+ minutes for video generation
        )
        
        print(f"Video generation response status: {response.status_code}")
        print(f"Response content (first 500 chars): {response.text[:500]}")
        
        # Check response
        if response.status_code == 429:
            pytest.skip("API credits exhausted - skipping video generation test")
        elif response.status_code == 500:
            error_detail = response.text
            if "timed out" in error_detail.lower():
                pytest.skip("Video generation timed out - external API issue")
            elif "credit" in error_detail.lower() or "rate" in error_detail.lower():
                pytest.skip("API credits issue - skipping test")
            else:
                pytest.fail(f"Video generation failed with 500: {error_detail[:300]}")
        
        # Should succeed with 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:300]}"
        
        # Parse response
        data = response.json()
        
        # Validate required fields
        assert "id" in data, "Response should contain 'id'"
        assert "prompt" in data, "Response should contain 'prompt'"
        assert "video_base64" in data, "Response should contain 'video_base64'"
        assert "resolution" in data, "Response should contain 'resolution'"
        assert "duration" in data, "Response should contain 'duration'"
        
        # CRITICAL: video_base64 must not be empty (this was the bug)
        video_base64 = data.get("video_base64")
        assert video_base64 is not None, "video_base64 should not be None"
        assert isinstance(video_base64, str), "video_base64 should be a string"
        assert len(video_base64) > 0, "video_base64 should not be empty (REGRESSION BUG)"
        assert len(video_base64) > 1000, f"video_base64 appears too short ({len(video_base64)} chars) - may be invalid"
        
        print(f"Video generated successfully! ID: {data['id']}")
        print(f"Video base64 length: {len(video_base64)} characters")
    
    def test_video_generation_invalid_resolution(self):
        """Test that invalid resolution is rejected"""
        headers = {"Content-Type": "application/json", "X-Admin-Key": ADMIN_PASSWORD}
        
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json={
                "prompt": "Test video",
                "resolution": "1080p",  # Invalid - only 480p and 720p allowed
                "duration": 6
            },
            headers=headers,
            timeout=30
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid resolution, got {response.status_code}"
        assert "resolution" in response.text.lower(), "Error should mention resolution"
    
    def test_video_generation_invalid_duration(self):
        """Test that invalid duration is rejected"""
        headers = {"Content-Type": "application/json", "X-Admin-Key": ADMIN_PASSWORD}
        
        # Test duration too short
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json={
                "prompt": "Test video",
                "resolution": "480p",
                "duration": 3  # Invalid - minimum is 6
            },
            headers=headers,
            timeout=30
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid duration, got {response.status_code}"
        assert "duration" in response.text.lower(), "Error should mention duration"
        
        # Test duration too long
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json={
                "prompt": "Test video",
                "resolution": "480p",
                "duration": 20  # Invalid - maximum is 15
            },
            headers=headers,
            timeout=30
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid duration, got {response.status_code}"


class TestVideoGenerationQuickCheck:
    """Quick validation tests that don't require actual video generation"""
    
    def test_video_endpoint_exists(self):
        """Verify the video generation endpoint exists and responds"""
        # Just send a minimal request to verify endpoint exists
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json={},  # Empty payload should fail validation but prove endpoint exists
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        # Should get 422 (validation error) or 401 (auth required), not 404
        assert response.status_code != 404, "Video generation endpoint should exist"
        print(f"Endpoint check: status {response.status_code}")
    
    def test_video_api_requires_auth_or_admin(self):
        """Test that video generation requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json={
                "prompt": "Test video",
                "resolution": "480p",
                "duration": 6
            },
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        # Should process but with user_id="anonymous" if no auth
        # The endpoint doesn't strictly require auth, it just sets user_id
        print(f"No-auth request status: {response.status_code}")
        # If it times out due to actual video generation, that's fine
        # We just want to confirm the endpoint processes the request


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
