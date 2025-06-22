# 🎮 ApexFire - Real-time Multiplayer Game

A mobile-optimized, 8-bit style multiplayer shooter game inspired by ApexFire.io, built with Node.js, Socket.IO, and HTML5 Canvas.

## ✨ Features

- **Real-time Multiplayer**: Up to 6 players per room
- **Automatic Matchmaking**: Auto-join available rooms or create new ones
- **Mobile-Optimized Controls**: Virtual joysticks and touch controls
- **8-bit Pixel Art Style**: Retro aesthetic with detailed sprites
- **Strategic Map Design**: Buildings, crates, walls, and trees for tactical gameplay
- **Auto Game Start**: Games start when room is full or after 1-minute timeout
- **Live Statistics**: Real-time leaderboard and kill feed

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone or download the project files**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

4. **Open the game**
   - Open your browser and go to `http://localhost:3000`
   - On mobile devices, visit the same URL from your local network

## 🎯 How to Play

### Getting Started
1. **Enter your name** in the lobby screen
2. **Tap "PLAY"** to join matchmaking
3. **Wait for other players** - games start automatically when:
   - Room reaches 6 players (instant start)
   - 1 minute timeout with 2+ players

### Controls
- **Left Joystick**: Move your character
- **Right Joystick**: Aim your weapon
- **FIRE Button**: Shoot your AK47
- **RELOAD Button**: Reload your weapon
- **Tap Screen**: Alternative shooting method

### Gameplay
- **Health**: 100 HP, visible health bar above players
- **Ammo**: 30/120 (clip/reserve) ammo system
- **Respawn**: 3-second respawn timer after elimination
- **Scoring**: 100 points per kill
- **Game Length**: 5-minute matches

## 🏗️ Game Architecture

### Backend (Node.js + Socket.IO)
- **Room Management**: Automatic room creation and cleanup
- **Player Synchronization**: Real-time position and action updates
- **Hit Validation**: Server-side bullet collision detection
- **Game State**: Centralized game logic and scoring

### Frontend (HTML5 Canvas + JavaScript)
- **Network Manager**: Socket.IO client wrapper
- **Game Engine**: Canvas-based rendering and physics
- **Mobile Controls**: Touch-optimized virtual joysticks
- **8-bit Graphics**: Pixel art rendering system

## 🔧 Configuration

### Server Settings
Edit `server.js` to modify:
- **Max Players**: Change `maxPlayers` in GameRoom class
- **Game Length**: Modify `gameLength` (milliseconds)
- **Matchmaking Timeout**: Adjust timeout in `startMatchmakingTimer`
- **Server Port**: Set `PORT` environment variable

### Game Settings
Edit `js/game.js` to modify:
- **Map Size**: Change `mapWidth` and `mapHeight`
- **Network Update Rate**: Adjust `networkUpdateRate`
- **Player Speed**: Modify player movement speed

## 🌐 Deployment

### Local Network Play
1. Find your computer's local IP address
2. Start the server with `npm start`
3. Players connect to `http://YOUR_IP:3000`

### Production Deployment
1. **Set Environment Variables**:
   ```bash
   export PORT=80
   export NODE_ENV=production
   ```

2. **Deploy to platforms like**:
   - Heroku
   - DigitalOcean
   - AWS
   - Vercel

3. **Update client connection** in `js/networkManager.js` if needed

## 🎨 Game Features

### Map Elements
- **Buildings**: Multi-story structures with windows
- **Crates**: Wooden cover objects
- **Walls**: Brick barriers for tactical positioning
- **Trees**: Natural obstacles and cover
- **Textured Ground**: Grass and dirt tile system

### Player Features
- **8-bit Sprites**: Detailed pixel art characters
- **Team Colors**: Different colored uniforms
- **Weapon Rendering**: Visible AK47 with muzzle flash
- **Health Bars**: Real-time health visualization
- **Name Tags**: Player identification

### Network Features
- **Room System**: Automatic room management
- **Player Sync**: 60ms position updates
- **Hit Registration**: Server-validated combat
- **Reconnection**: Automatic reconnection handling

## 🐛 Troubleshooting

### Common Issues

**"Failed to join matchmaking"**
- Check if server is running
- Verify network connection
- Try refreshing the page

**Players not moving smoothly**
- Check network latency
- Reduce network update rate if needed

**Game not starting**
- Ensure minimum 2 players in room
- Wait for 1-minute timeout
- Check server console for errors

### Server Logs
Monitor server console for:
- Player connections/disconnections
- Room creation and cleanup
- Game start/end events
- Error messages

## 📱 Mobile Optimization

### Performance Tips
- **Pixel Art Rendering**: Crisp pixel scaling
- **Touch Events**: Optimized for mobile devices
- **Battery Efficiency**: Optimized rendering loops
- **Network Optimization**: Minimal data transfer

### Browser Compatibility
- **iOS Safari**: Full support
- **Android Chrome**: Full support
- **Mobile Firefox**: Full support
- **Desktop Browsers**: Full support for testing

## 🔮 Future Enhancements

- **Multiple Weapons**: Sniper, SMG, Shotgun
- **Power-ups**: Health packs, ammo crates
- **Multiple Maps**: Different battlefield layouts
- **Voice Chat**: Real-time communication
- **Spectator Mode**: Watch ongoing matches
- **Player Statistics**: Persistent player data
- **Custom Rooms**: Private lobbies with codes

## 📄 License

This project is open source. Feel free to modify and distribute according to your needs.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Enjoy playing Mobile ApexFire! 🎮** 