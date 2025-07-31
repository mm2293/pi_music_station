import requests
import sys
import json
import io
from datetime import datetime
import websocket
import threading
import time

class PiMusicStationTester:
    def __init__(self, base_url="https://597efab0-3eb8-44a4-9d36-b652a011da13.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.ws_messages = []

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'} if not files else {}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, timeout=10)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                except:
                    print(f"   Response: {response.text[:200]}...")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")

            return success, response.json() if success and response.text else {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_spotify_endpoints(self):
        """Test all Spotify-related endpoints"""
        print("\n" + "="*50)
        print("TESTING SPOTIFY ENDPOINTS")
        print("="*50)
        
        # Test Spotify config
        self.run_test("Spotify Config", "GET", "spotify/config", 200)
        
        # Test Spotify auth with dummy code
        self.run_test("Spotify Auth", "POST", "spotify/auth", 200, {"code": "dummy_auth_code"})
        
        # Test Spotify player
        self.run_test("Spotify Player", "GET", "spotify/player", 200)
        
        # Test Spotify play
        self.run_test("Spotify Play", "POST", "spotify/play", 200, {"track_uri": "spotify:track:test123"})

    def test_audio_endpoints(self):
        """Test all audio-related endpoints"""
        print("\n" + "="*50)
        print("TESTING AUDIO ENDPOINTS")
        print("="*50)
        
        # Test get audio files (should be empty initially)
        self.run_test("Get Audio Files", "GET", "audio/files", 200)
        
        # Test volume control
        self.run_test("Set Volume", "POST", "audio/volume", 200, {"volume": 75})
        
        # Test invalid volume
        self.run_test("Invalid Volume", "POST", "audio/volume", 200, {"volume": 150})
        
        # Test stop audio
        self.run_test("Stop Audio", "POST", "audio/stop", 200)
        
        # Test file upload with valid format
        test_mp3_content = b"fake mp3 content for testing"
        files = {'file': ('test.mp3', io.BytesIO(test_mp3_content), 'audio/mpeg')}
        success, response = self.run_test("Upload MP3 File", "POST", "audio/upload", 200, files=files)
        
        if success and 'id' in response:
            file_id = response['id']
            # Test playing the uploaded file
            self.run_test("Play Audio File", "POST", f"audio/play/{file_id}", 200)
        
        # Test invalid file format
        files = {'file': ('test.txt', io.BytesIO(b"not an audio file"), 'text/plain')}
        self.run_test("Upload Invalid File", "POST", "audio/upload", 200, files=files)

    def test_announcement_endpoints(self):
        """Test announcement-related endpoints"""
        print("\n" + "="*50)
        print("TESTING ANNOUNCEMENT ENDPOINTS")
        print("="*50)
        
        # Test text-to-speech announcement
        self.run_test("Text-to-Speech", "POST", "announcements/text-to-speech", 200, 
                     {"text": "This is a test announcement"})
        
        # Test creating announcement directly
        announcement_data = {
            "text": "Direct announcement test",
            "type": "text-to-speech"
        }
        self.run_test("Create Announcement", "POST", "announcements", 200, announcement_data)

    def test_websocket_connection(self):
        """Test WebSocket connection"""
        print("\n" + "="*50)
        print("TESTING WEBSOCKET CONNECTION")
        print("="*50)
        
        try:
            ws_url = self.base_url.replace('https://', 'wss://') + '/api/ws'
            print(f"🔍 Testing WebSocket connection to: {ws_url}")
            
            def on_message(ws, message):
                self.ws_messages.append(json.loads(message))
                print(f"📨 WebSocket message received: {message}")
            
            def on_error(ws, error):
                print(f"❌ WebSocket error: {error}")
            
            def on_close(ws, close_status_code, close_msg):
                print(f"🔌 WebSocket connection closed")
            
            def on_open(ws):
                print(f"✅ WebSocket connection opened")
                # Send test messages
                test_messages = [
                    {"type": "voice_data", "data": "test_voice_data"},
                    {"type": "audio_stream", "data": "test_audio_stream"}
                ]
                
                for msg in test_messages:
                    ws.send(json.dumps(msg))
                    print(f"📤 Sent: {msg}")
                    time.sleep(1)
                
                # Close after testing
                ws.close()
            
            ws = websocket.WebSocketApp(ws_url,
                                      on_open=on_open,
                                      on_message=on_message,
                                      on_error=on_error,
                                      on_close=on_close)
            
            # Run WebSocket in a separate thread with timeout
            ws_thread = threading.Thread(target=ws.run_forever)
            ws_thread.daemon = True
            ws_thread.start()
            ws_thread.join(timeout=10)
            
            if len(self.ws_messages) > 0:
                print(f"✅ WebSocket test passed - Received {len(self.ws_messages)} messages")
                self.tests_passed += 1
            else:
                print(f"⚠️  WebSocket connected but no messages received")
            
            self.tests_run += 1
            
        except Exception as e:
            print(f"❌ WebSocket test failed: {str(e)}")
            self.tests_run += 1

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Pi Music Station Backend Tests")
        print(f"📍 Testing against: {self.base_url}")
        
        # Test all endpoints
        self.test_spotify_endpoints()
        self.test_audio_endpoints()
        self.test_announcement_endpoints()
        self.test_websocket_connection()
        
        # Print final results
        print("\n" + "="*50)
        print("FINAL TEST RESULTS")
        print("="*50)
        print(f"📊 Tests passed: {self.tests_passed}/{self.tests_run}")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    tester = PiMusicStationTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())