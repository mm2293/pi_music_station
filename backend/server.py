from fastapi import FastAPI, APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import json
import aiofiles
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Create uploads directory
uploads_dir = ROOT_DIR / "uploads"
uploads_dir.mkdir(exist_ok=True)

# Define Models
class SpotifyConfig(BaseModel):
    client_id: str = "your_spotify_client_id_placeholder"
    client_secret: str = "your_spotify_client_secret_placeholder"
    redirect_uri: str = "http://localhost:3000/callback"

class AudioFile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    file_path: str
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)

class Announcement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    type: str  # "text-to-speech" or "voice-recording"
    created_at: datetime = Field(default_factory=datetime.utcnow)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()

# Spotify Routes
@api_router.get("/spotify/config")
async def get_spotify_config():
    return SpotifyConfig()

@api_router.post("/spotify/auth")
async def spotify_auth(data: dict):
    code = data.get("code")
    # Placeholder for Spotify OAuth
    return {"status": "placeholder", "message": "Spotify auth will be implemented with real credentials"}

@api_router.get("/spotify/player")
async def get_spotify_player():
    # Placeholder for Spotify Web Playback SDK
    return {"status": "placeholder", "player": None}

@api_router.post("/spotify/play")
async def play_spotify(track_uri: str):
    # Placeholder for Spotify play command
    await manager.broadcast({"type": "spotify_play", "track_uri": track_uri})
    return {"status": "playing", "track": track_uri}

# Audio Upload Routes
@api_router.post("/audio/upload")
async def upload_audio(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(('.mp3', '.wav', '.m4a', '.ogg')):
        return {"error": "Invalid file format. Please upload MP3, WAV, M4A, or OGG files."}
    
    file_id = str(uuid.uuid4())
    file_extension = Path(file.filename).suffix
    new_filename = f"{file_id}{file_extension}"
    file_path = uploads_dir / new_filename
    
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    audio_file = AudioFile(
        id=file_id,
        filename=file.filename,
        file_path=str(file_path)
    )
    
    await db.audio_files.insert_one(audio_file.dict())
    
    # Broadcast to connected clients
    await manager.broadcast({
        "type": "audio_uploaded", 
        "file": audio_file.dict()
    })
    
    return audio_file

@api_router.get("/audio/files")
async def get_audio_files():
    files = await db.audio_files.find().to_list(100)
    return [AudioFile(**f) for f in files]

@api_router.post("/audio/play/{file_id}")
async def play_audio_file(file_id: str):
    file_doc = await db.audio_files.find_one({"id": file_id})
    if not file_doc:
        return {"error": "File not found"}
    
    # Broadcast play command to Pi audio system
    await manager.broadcast({
        "type": "play_audio_file",
        "file_id": file_id,
        "file_path": file_doc["file_path"]
    })
    
    return {"status": "playing", "file_id": file_id}

# Announcement Routes
@api_router.post("/announcements")
async def create_announcement(announcement: Announcement):
    await db.announcements.insert_one(announcement.dict())
    
    # Broadcast announcement
    await manager.broadcast({
        "type": "announcement",
        "announcement": announcement.dict()
    })
    
    return announcement

@api_router.post("/announcements/text-to-speech")
async def text_to_speech_announcement(text: str):
    announcement = Announcement(
        text=text,
        type="text-to-speech"
    )
    
    await db.announcements.insert_one(announcement.dict())
    
    # Broadcast TTS announcement
    await manager.broadcast({
        "type": "tts_announcement",
        "text": text,
        "id": announcement.id
    })
    
    return announcement

# Audio Control Routes
@api_router.post("/audio/volume")
async def set_volume(volume: int):
    if volume < 0 or volume > 100:
        return {"error": "Volume must be between 0 and 100"}
    
    await manager.broadcast({
        "type": "volume_change",
        "volume": volume
    })
    
    return {"status": "volume_set", "volume": volume}

@api_router.post("/audio/stop")
async def stop_audio():
    await manager.broadcast({"type": "stop_audio"})
    return {"status": "stopped"}

# WebSocket endpoint
@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types
            if message["type"] == "voice_data":
                # Broadcast voice data for announcements
                await manager.broadcast({
                    "type": "voice_announcement",
                    "data": message["data"]
                })
            elif message["type"] == "audio_stream":
                # Handle real-time audio streaming
                await manager.broadcast(message)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()