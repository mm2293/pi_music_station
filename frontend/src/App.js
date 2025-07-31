import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Slider } from './components/ui/slider';
import { Badge } from './components/ui/badge';
import { Separator } from './components/ui/separator';
import { 
  Play, 
  Pause, 
  Volume2, 
  Upload, 
  Mic, 
  MicOff, 
  Music, 
  Radio,
  MessageSquare,
  Smartphone,
  Speaker
} from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [activeTab, setActiveTab] = useState('spotify');
  const [volume, setVolume] = useState([75]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioFiles, setAudioFiles] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [announcementText, setAnnouncementText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [ws, setWs] = useState(null);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  // WebSocket connection
  useEffect(() => {
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    const websocket = new WebSocket(`${wsUrl}/api/ws`);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      setWs(websocket);
    };
    
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('WebSocket message:', message);
      
      if (message.type === 'audio_uploaded') {
        loadAudioFiles();
      }
    };
    
    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setWs(null);
    };
    
    return () => {
      websocket.close();
    };
  }, []);

  // Load audio files
  const loadAudioFiles = async () => {
    try {
      const response = await axios.get(`${API}/audio/files`);
      setAudioFiles(response.data);
    } catch (error) {
      console.error('Error loading audio files:', error);
    }
  };

  useEffect(() => {
    loadAudioFiles();
  }, []);

  // Spotify functions
  const connectSpotify = async () => {
    try {
      const response = await axios.get(`${API}/spotify/config`);
      console.log('Spotify config loaded (placeholder):', response.data);
      setSpotifyConnected(true);
    } catch (error) {
      console.error('Error connecting to Spotify:', error);
    }
  };

  const playSpotifyTrack = async (trackUri = 'spotify:track:placeholder') => {
    try {
      await axios.post(`${API}/spotify/play`, { track_uri: trackUri });
      setIsPlaying(true);
      setCurrentTrack({ name: 'Placeholder Track', artist: 'Placeholder Artist' });
    } catch (error) {
      console.error('Error playing Spotify track:', error);
    }
  };

  // Audio file functions
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API}/audio/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      console.log('File uploaded:', response.data);
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  const playAudioFile = async (fileId) => {
    try {
      await axios.post(`${API}/audio/play/${fileId}`);
      setIsPlaying(true);
      const file = audioFiles.find(f => f.id === fileId);
      setCurrentTrack({ name: file.filename, artist: 'Local File' });
    } catch (error) {
      console.error('Error playing audio file:', error);
    }
  };

  // Announcement functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws) {
          const reader = new FileReader();
          reader.onload = () => {
            ws.send(JSON.stringify({
              type: 'voice_data',
              data: reader.result
            }));
          };
          reader.readAsDataURL(event.data);
        }
      };
      
      mediaRecorder.start(1000); // Send data every second
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const sendTextAnnouncement = async () => {
    if (!announcementText.trim()) return;
    
    try {
      await axios.post(`${API}/announcements/text-to-speech`, { text: announcementText });
      setAnnouncementText('');
    } catch (error) {
      console.error('Error sending announcement:', error);
    }
  };

  // Audio control functions
  const handleVolumeChange = async (newVolume) => {
    setVolume(newVolume);
    try {
      await axios.post(`${API}/audio/volume`, { volume: newVolume[0] });
    } catch (error) {
      console.error('Error setting volume:', error);
    }
  };

  const stopAudio = async () => {
    try {
      await axios.post(`${API}/audio/stop`);
      setIsPlaying(false);
      setCurrentTrack(null);
    } catch (error) {
      console.error('Error stopping audio:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Speaker className="w-10 h-10 text-purple-400" />
            Pi Music Station
          </h1>
          <p className="text-slate-300">Spotify • Smartphone Audio • Durchsagen</p>
        </div>

        {/* Current Playing */}
        {currentTrack && (
          <Card className="mb-6 bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
                    <Music className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{currentTrack.name}</h3>
                    <p className="text-slate-400">{currentTrack.artist}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={isPlaying ? stopAudio : playSpotifyTrack}
                    className="bg-slate-700 border-slate-600 hover:bg-slate-600"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={stopAudio}
                    className="bg-slate-700 border-slate-600 hover:bg-slate-600"
                  >
                    Stop
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Volume Control */}
        <Card className="mb-6 bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Volume2 className="w-5 h-5 text-slate-400" />
              <div className="flex-1">
                <Slider
                  value={volume}
                  onValueChange={handleVolumeChange}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>
              <span className="text-slate-400 min-w-[3rem] text-sm">{volume[0]}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-slate-800 border-slate-700">
            <TabsTrigger value="spotify" className="data-[state=active]:bg-purple-600">
              <Music className="w-4 h-4 mr-2" />
              Spotify
            </TabsTrigger>
            <TabsTrigger value="smartphone" className="data-[state=active]:bg-purple-600">
              <Smartphone className="w-4 h-4 mr-2" />
              Smartphone
            </TabsTrigger>
            <TabsTrigger value="announcements" className="data-[state=active]:bg-purple-600">
              <MessageSquare className="w-4 h-4 mr-2" />
              Durchsagen
            </TabsTrigger>
          </TabsList>

          {/* Spotify Tab */}
          <TabsContent value="spotify" className="space-y-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Music className="w-5 h-5 text-green-500" />
                  Spotify Integration
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Verbinde dich mit Spotify und steuere die Musikwiedergabe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!spotifyConnected ? (
                  <div className="text-center py-8">
                    <Button onClick={connectSpotify} className="bg-green-600 hover:bg-green-700">
                      Mit Spotify verbinden
                    </Button>
                    <p className="text-slate-400 text-sm mt-2">
                      (Aktuell mit Platzhalter-Konfiguration)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Badge variant="secondary" className="bg-green-600 text-white">
                      Spotify Verbunden (Placeholder)
                    </Badge>
                    <div className="grid grid-cols-2 gap-4">
                      <Button 
                        onClick={() => playSpotifyTrack()}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Test Track
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={stopAudio}
                        className="border-slate-600 hover:bg-slate-700"
                      >
                        Stop
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Smartphone Tab */}
          <TabsContent value="smartphone" className="space-y-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-blue-500" />
                  Smartphone Audio
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Lade Audiodateien hoch oder streame direkt vom Smartphone
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Upload */}
                <div className="space-y-2">
                  <label className="text-white text-sm font-medium">Audio-Datei hochladen</label>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="border-slate-600 hover:bg-slate-700 flex-1"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Datei wählen
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mp3,.wav,.m4a,.ogg"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                <Separator className="bg-slate-700" />

                {/* Audio Files List */}
                <div className="space-y-2">
                  <label className="text-white text-sm font-medium">Hochgeladene Dateien</label>
                  {audioFiles.length === 0 ? (
                    <p className="text-slate-400 text-sm py-4 text-center">
                      Noch keine Dateien hochgeladen
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {audioFiles.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                          <div>
                            <p className="text-white text-sm font-medium">{file.filename}</p>
                            <p className="text-slate-400 text-xs">
                              {new Date(file.uploaded_at).toLocaleString('de-DE')}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => playAudioFile(file.id)}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <Play className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="space-y-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-orange-500" />
                  Durchsagen
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Mache Durchsagen per Mikrofon oder Text-to-Speech
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Voice Recording */}
                <div className="space-y-3">
                  <label className="text-white text-sm font-medium">Mikrofon-Durchsage</label>
                  <div className="flex items-center gap-4">
                    <Button
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                      {isRecording ? (
                        <>
                          <MicOff className="w-4 h-4 mr-2" />
                          Aufnahme stoppen
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4 mr-2" />
                          Aufnahme starten
                        </>
                      )}
                    </Button>
                    {isRecording && (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-red-400 text-sm">Live</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-slate-700" />

                {/* Text to Speech */}
                <div className="space-y-3">
                  <label className="text-white text-sm font-medium">Text-to-Speech Durchsage</label>
                  <Textarea
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    placeholder="Geben Sie Ihren Durchsagetext hier ein..."
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    rows={3}
                  />
                  <Button
                    onClick={sendTextAnnouncement}
                    disabled={!announcementText.trim()}
                    className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
                  >
                    <Radio className="w-4 h-4 mr-2" />
                    Durchsage senden
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;