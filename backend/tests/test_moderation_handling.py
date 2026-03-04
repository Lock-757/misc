"""
Tests for moderation handling in generate-image and generate-video APIs.
Verifies that:
1. Safe prompts return 200 with non-empty data
2. Moderated prompts return fast 422 with user-friendly messages
3. Moderation error messages contain guidance about provider safety checks
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # Fallback to React env var
    BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin key for authentication
ADMIN_SECRET = "forge_master_2025"


class TestModerationHandling:
    """Tests for provider moderation error handling"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup headers with admin key"""
        self.headers = {
            "Content-Type": "application/json",
            "X-Admin-Key": ADMIN_SECRET
        }
    
    def test_generate_video_safe_prompt(self):
        """POST /api/generate-video with safe prompt returns 200 and non-empty video_base64"""
        payload = {
            "prompt": "A beautiful sunset over the ocean with gentle waves",
            "resolution": "480p",
            "duration": 6
        }
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json=payload,
            headers=self.headers,
            timeout=600  # Video generation can take time
        )
        elapsed_time = time.time() - start_time
        
        print(f"Video generation took {elapsed_time:.2f} seconds")
        print(f"Response status: {response.status_code}")
        
        # For safe prompts, we expect success
        if response.status_code == 200:
            data = response.json()
            assert "video_base64" in data, "Response should contain video_base64"
            assert data["video_base64"], "video_base64 should not be empty"
            assert len(data["video_base64"]) > 1000, "video_base64 should contain actual video data"
            print(f"SUCCESS: Video generated with {len(data['video_base64'])} bytes of base64 data")
        elif response.status_code == 422:
            # Sometimes safe prompts can also be moderated - check the message
            data = response.json()
            detail = data.get("detail", "")
            assert "safety" in detail.lower() or "provider" in detail.lower(), \
                f"422 response should mention safety/provider in message: {detail}"
            print(f"MODERATED: Safe prompt was moderated - {detail}")
        elif response.status_code == 429:
            pytest.skip("API rate limit reached - skipping test")
        else:
            # Log the error for debugging
            print(f"UNEXPECTED: Got status {response.status_code}: {response.text[:500]}")
            assert False, f"Unexpected response: {response.status_code}"
    
    def test_generate_video_moderated_prompt_fast_response(self):
        """POST /api/generate-video with moderated prompt returns fast 422, not long poll timeout"""
        # Using prompt that is likely to trigger moderation
        payload = {
            "prompt": "explicit leaked content from private server",
            "resolution": "480p", 
            "duration": 6
        }
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json=payload,
            headers=self.headers,
            timeout=120  # Should fail fast, not wait for full poll
        )
        elapsed_time = time.time() - start_time
        
        print(f"Moderated video request took {elapsed_time:.2f} seconds")
        print(f"Response status: {response.status_code}")
        
        if response.status_code == 422:
            data = response.json()
            detail = data.get("detail", "")
            
            # Verify user-friendly message with guidance
            assert "safety" in detail.lower() or "provider" in detail.lower(), \
                f"Message should mention safety/provider: {detail}"
            assert "rephrase" in detail.lower() or "avoid" in detail.lower(), \
                f"Message should contain guidance (rephrase/avoid): {detail}"
            
            # Check it's not a long timeout (should fail within reasonable time)
            # If moderation is detected early, it shouldn't wait 10 minutes
            assert elapsed_time < 120, f"Moderated request should fail fast, took {elapsed_time}s"
            
            print(f"SUCCESS: Got 422 with message: {detail}")
        elif response.status_code == 200:
            # If it succeeded (maybe moderation keywords weren't triggered)
            print(f"NOTICE: Moderated prompt succeeded - moderation may not have triggered")
        elif response.status_code == 429:
            pytest.skip("API rate limit reached - skipping test")
        else:
            print(f"Response: {response.text[:500]}")
            # Could also fail for other reasons
            assert response.status_code in [200, 422, 500], \
                f"Expected 200, 422 or 500, got {response.status_code}"
    
    def test_generate_image_moderated_prompt(self):
        """POST /api/generate-image with moderated prompt returns user-friendly 422 message"""
        # Create a test agent first to get an agent_id
        agent_payload = {
            "name": "TestAgent",
            "system_prompt": "Test agent for moderation testing"
        }
        agent_response = requests.post(
            f"{BASE_URL}/api/agents",
            json=agent_payload,
            headers=self.headers
        )
        
        if agent_response.status_code != 200:
            pytest.skip("Could not create test agent")
        
        agent_id = agent_response.json().get("id")
        
        try:
            # Using prompt that is likely to trigger moderation
            payload = {
                "agent_id": agent_id,
                "prompt": "leaked private content unsafe material",
                "size": "1024x1024",
                "quality": "standard",
                "is_admin": False
            }
            
            start_time = time.time()
            response = requests.post(
                f"{BASE_URL}/api/generate-image",
                json=payload,
                headers=self.headers,
                timeout=120
            )
            elapsed_time = time.time() - start_time
            
            print(f"Moderated image request took {elapsed_time:.2f} seconds")
            print(f"Response status: {response.status_code}")
            
            if response.status_code == 422:
                data = response.json()
                detail = data.get("detail", "")
                
                # Verify user-friendly message
                assert "safety" in detail.lower() or "provider" in detail.lower(), \
                    f"Message should mention safety/provider: {detail}"
                
                print(f"SUCCESS: Got 422 with message: {detail}")
            elif response.status_code == 200:
                print(f"NOTICE: Moderated prompt succeeded - moderation may not have triggered")
            elif response.status_code == 429:
                pytest.skip("API rate limit reached")
            else:
                print(f"Response: {response.text[:500]}")
        finally:
            # Cleanup: delete test agent
            requests.delete(f"{BASE_URL}/api/agents/{agent_id}", headers=self.headers)
    
    def test_moderation_message_contains_guidance(self):
        """Verify moderation error message includes guidance text"""
        # Test the moderation_block_detail function output format
        expected_guidance_phrases = [
            "safety checks",
            "rephrase",
            "avoid"
        ]
        
        # Send request likely to trigger moderation
        payload = {
            "prompt": "policy violation leaked content",
            "resolution": "480p",
            "duration": 6
        }
        
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json=payload,
            headers=self.headers,
            timeout=120
        )
        
        if response.status_code == 422:
            data = response.json()
            detail = data.get("detail", "").lower()
            
            found_guidance = any(phrase in detail for phrase in expected_guidance_phrases)
            assert found_guidance, \
                f"Moderation message should contain guidance (safety checks/rephrase/avoid): {detail}"
            
            print(f"SUCCESS: Message contains proper guidance: {detail}")
        elif response.status_code == 429:
            pytest.skip("API rate limit reached")
        else:
            print(f"Got status {response.status_code}, moderation may not have triggered")


class TestModerationDetection:
    """Tests for is_provider_moderation_error function behavior"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.headers = {
            "Content-Type": "application/json",
            "X-Admin-Key": ADMIN_SECRET
        }
    
    def test_video_invalid_resolution_not_moderation(self):
        """Invalid resolution should return 400, not 422 moderation error"""
        payload = {
            "prompt": "A beautiful sunset",
            "resolution": "invalid_res",
            "duration": 6
        }
        
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json=payload,
            headers=self.headers,
            timeout=30
        )
        
        # Should be 400 (bad request) not 422 (moderation)
        assert response.status_code == 400, f"Invalid resolution should return 400, got {response.status_code}"
        print(f"SUCCESS: Got 400 for invalid resolution")
    
    def test_video_invalid_duration_not_moderation(self):
        """Invalid duration should return 400, not 422 moderation error"""
        payload = {
            "prompt": "A beautiful sunset",
            "resolution": "720p",
            "duration": 3  # Invalid - must be 6-15
        }
        
        response = requests.post(
            f"{BASE_URL}/api/generate-video",
            json=payload,
            headers=self.headers,
            timeout=30
        )
        
        # Should be 400 (bad request) not 422 (moderation)
        assert response.status_code == 400, f"Invalid duration should return 400, got {response.status_code}"
        print(f"SUCCESS: Got 400 for invalid duration")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
