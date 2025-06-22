const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Serve the game files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state management
class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = new Map();
        this.gameState = 'waiting'; // waiting, playing, finished
        this.maxPlayers = 6;
        this.gameStartTime = null;
        this.matchmakingTimer = null;
        this.gameLength = 60000; // 1 minute
        this.bullets = [];
        this.mapWidth = 1200;
        this.mapHeight = 800;
    }

    addPlayer(socket, playerData) {
        if (this.players.size >= this.maxPlayers) {
            return false;
        }

        const spawnPoint = this.getRandomSpawnPoint();
        const player = {
            id: socket.id,
            socket: socket,
            name: playerData.name,
            x: spawnPoint.x,
            y: spawnPoint.y,
            vx: 0,
            vy: 0,
            health: 100,
            maxHealth: 100,
            ammo: 30,
            maxAmmo: 30,
            reserveAmmo: 120,
            kills: 0,
            deaths: 0,
            score: 0,
            angle: 0,
            joinTime: Date.now(),
            lastUpdate: Date.now()
        };

        this.players.set(socket.id, player);
        socket.join(this.id);
        
        // Start matchmaking timer if this is the first player
        if (this.players.size === 1) {
            this.startMatchmakingTimer();
        }

        // Auto-start game if room is full
        if (this.players.size >= this.maxPlayers) {
            this.startGame();
        }

        return true;
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        if (player) {
            this.players.delete(socketId);
            
            // End game if not enough players during gameplay
            if (this.gameState === 'playing' && this.players.size < 2) {
                this.endGame();
            }
            
            // Cancel matchmaking if no players left
            if (this.players.size === 0 && this.matchmakingTimer) {
                clearTimeout(this.matchmakingTimer);
                this.matchmakingTimer = null;
            }
        }
    }

    startMatchmakingTimer() {
        this.matchmakingTimer = setTimeout(() => {
            if (this.gameState === 'waiting' && this.players.size >= 2) {
                this.startGame();
            }
        }, 30000); // 30 seconds timeout
    }

    startGame() {
        if (this.gameState !== 'waiting') return;

        this.gameState = 'playing';
        this.gameStartTime = Date.now();
        
        // Clear matchmaking timer
        if (this.matchmakingTimer) {
            clearTimeout(this.matchmakingTimer);
            this.matchmakingTimer = null;
        }

        // Notify all players in room
        io.to(this.id).emit('gameStart', {
            players: this.getPlayersData(),
            roomId: this.id
        });

        console.log(`Game started in room ${this.id} with ${this.players.size} players`);

        // Start position sync interval for real-time updates
        this.positionSyncInterval = setInterval(() => {
            if (this.gameState === 'playing') {
                this.broadcastPlayerPositions();
                this.updateServerBullets();
            }
        }, 33); // ~30 FPS server-side position sync
        
        // Start periodic full player list sync to ensure all clients have all players
        this.playerListSyncInterval = setInterval(() => {
            if (this.gameState === 'playing' && this.players.size > 0) {
                io.to(this.id).emit('playersUpdate', {
                    playersCount: this.players.size,
                    players: this.getPlayersData()
                });
            }
        }, 1000); // Every 1 second

        // Set game end timer
        setTimeout(() => {
            this.endGame();
        }, this.gameLength);
    }

    endGame() {
        if (this.gameState !== 'playing') return;

        this.gameState = 'finished';
        
        // Clear position sync interval
        if (this.positionSyncInterval) {
            clearInterval(this.positionSyncInterval);
            this.positionSyncInterval = null;
        }
        
        // Clear player list sync interval
        if (this.playerListSyncInterval) {
            clearInterval(this.playerListSyncInterval);
            this.playerListSyncInterval = null;
        }
        
        const finalStats = Array.from(this.players.values())
            .sort((a, b) => b.score - a.score)
            .map(player => ({
                name: player.name,
                kills: player.kills,
                deaths: player.deaths,
                score: player.score
            }));

        io.to(this.id).emit('gameEnd', { finalStats });
        
        console.log(`Game ended in room ${this.id}`);

        // Clean up room after 30 seconds
        setTimeout(() => {
            this.cleanup();
        }, 30000);
    }

    cleanup() {
        // Clear position sync interval
        if (this.positionSyncInterval) {
            clearInterval(this.positionSyncInterval);
            this.positionSyncInterval = null;
        }
        
        // Clear player list sync interval
        if (this.playerListSyncInterval) {
            clearInterval(this.playerListSyncInterval);
            this.playerListSyncInterval = null;
        }
        
        // Remove all players from room
        this.players.forEach(player => {
            player.socket.leave(this.id);
        });
        this.players.clear();
        
        // Remove room from rooms map
        rooms.delete(this.id);
        console.log(`Room ${this.id} cleaned up`);
    }
    
    broadcastPlayerPositions() {
        // Broadcast current positions and full data of all players to ensure synchronization
        const playerPositions = Array.from(this.players.values()).map(player => ({
            id: player.id,
            name: player.name,
            x: player.x,
            y: player.y,
            vx: player.vx || 0,
            vy: player.vy || 0,
            angle: player.angle,
            health: player.health,
            ammo: player.ammo,
            reserveAmmo: player.reserveAmmo,
            kills: player.kills,
            deaths: player.deaths,
            score: player.score,
            timestamp: Date.now()
        }));
        
        if (playerPositions.length > 0) {
            io.to(this.id).emit('playersPositionSync', { players: playerPositions });
        }
    }
    
    updateServerBullets() {
        const now = Date.now();
        
        // Update bullet positions and check collisions
        this.bullets = this.bullets.filter(bullet => {
            // Update bullet position
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            bullet.life -= 33; // Decrease life by update interval
            
            // Remove expired or out-of-bounds bullets
            if (bullet.life <= 0 || 
                bullet.x < 0 || bullet.x > this.mapWidth ||
                bullet.y < 0 || bullet.y > this.mapHeight) {
                return false;
            }
            
            // Check collision with obstacles
            const obstacles = this.getObstacles();
            for (let obstacle of obstacles) {
                if (bullet.x >= obstacle.x && bullet.x <= obstacle.x + obstacle.width &&
                    bullet.y >= obstacle.y && bullet.y <= obstacle.y + obstacle.height) {
                    return false; // Remove bullet
                }
            }
            
            return true; // Keep bullet
        });
    }

    getRandomSpawnPoint() {
        // Define safe spawn areas that are guaranteed to be clear of obstacles
        const safeSpawnPoints = [
            // Top area spawns
            { x: 80, y: 80 },
            { x: 250, y: 50 },
            { x: 450, y: 80 },
            { x: 750, y: 50 },
            { x: 950, y: 80 },
            { x: 1120, y: 80 },
            
            // Middle area spawns  
            { x: 50, y: 250 },
            { x: 350, y: 350 },
            { x: 650, y: 400 },
            { x: 950, y: 350 },
            { x: 1150, y: 250 },
            
            // Bottom area spawns
            { x: 80, y: 720 },
            { x: 250, y: 750 },
            { x: 450, y: 720 },
            { x: 750, y: 750 },
            { x: 950, y: 720 },
            { x: 1120, y: 720 },
            
            // Open field spawns
            { x: 200, y: 400 },
            { x: 400, y: 500 },
            { x: 800, y: 200 },
            { x: 1000, y: 600 },
            { x: 300, y: 650 },
            { x: 700, y: 450 }
        ];
        
        // Try multiple spawn points to find a clear one
        for (let attempts = 0; attempts < 10; attempts++) {
            const spawnPoint = safeSpawnPoints[Math.floor(Math.random() * safeSpawnPoints.length)];
            
            // Verify the spawn point is clear
            if (this.isSpawnPointClear(spawnPoint)) {
                return spawnPoint;
            }
        }
        
        // Fallback to corner if all attempts fail
        return { x: 80, y: 80 };
    }
    
    isSpawnPointClear(spawnPoint) {
        const playerSize = 25; // Player collision radius
        const safetyMargin = 15; // Extra margin for safety
        const obstacles = this.getObstacles();
        
        // Check if spawn point conflicts with any obstacle (with safety margin)
        for (let obstacle of obstacles) {
            if (this.checkRectangleCollision(
                spawnPoint.x - playerSize - safetyMargin,
                spawnPoint.y - playerSize - safetyMargin,
                (playerSize + safetyMargin) * 2,
                (playerSize + safetyMargin) * 2,
                obstacle.x,
                obstacle.y,
                obstacle.width,
                obstacle.height
            )) {
                return false; // Spawn point is blocked
            }
        }
        
        // Check if spawn point conflicts with existing players
        for (let [playerId, player] of this.players) {
            const distance = Math.sqrt(
                Math.pow(spawnPoint.x - player.x, 2) + 
                Math.pow(spawnPoint.y - player.y, 2)
            );
            if (distance < 80) { // Minimum distance between players
                return false;
            }
        }
        
        // Check if spawn point is within map bounds
        if (spawnPoint.x - playerSize < 0 || 
            spawnPoint.x + playerSize > this.mapWidth ||
            spawnPoint.y - playerSize < 0 || 
            spawnPoint.y + playerSize > this.mapHeight) {
            return false;
        }
        
        return true;
    }
    
    checkRectangleCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 &&
               x1 + w1 > x2 &&
               y1 < y2 + h2 &&
               y1 + h1 > y2;
    }
    
    checkPlayerObstacleCollision(player) {
        const obstacles = this.getObstacles();
        const playerSize = 25;
        
        for (let obstacle of obstacles) {
            if (this.checkRectangleCollision(
                player.x - playerSize,
                player.y - playerSize,
                playerSize * 2,
                playerSize * 2,
                obstacle.x,
                obstacle.y,
                obstacle.width,
                obstacle.height
            )) {
                return true;
            }
        }
        return false;
    }
    
    getObstacles() {
        // Return the same obstacles as defined in the client-side game
        return [
            // Central building complex
            { x: 500, y: 300, width: 120, height: 80 },
            { x: 550, y: 250, width: 80, height: 40 },
            
            // Corner structures
            { x: 100, y: 100, width: 60, height: 60 },
            { x: 1040, y: 100, width: 60, height: 60 },
            { x: 100, y: 640, width: 60, height: 60 },
            { x: 1040, y: 640, width: 60, height: 60 },
            
            // Scattered cover objects
            { x: 300, y: 200, width: 30, height: 30 },
            { x: 800, y: 300, width: 30, height: 30 },
            { x: 200, y: 500, width: 30, height: 30 },
            { x: 900, y: 500, width: 30, height: 30 },
            
            // Walls for cover
            { x: 400, y: 150, width: 100, height: 20 },
            { x: 700, y: 150, width: 100, height: 20 },
            { x: 400, y: 600, width: 100, height: 20 },
            { x: 700, y: 600, width: 100, height: 20 },
            
            // Trees
            { x: 250, y: 350, width: 25, height: 25 },
            { x: 950, y: 200, width: 25, height: 25 },
            { x: 150, y: 300, width: 25, height: 25 },
            { x: 850, y: 450, width: 25, height: 25 }
        ];
    }

    getPlayersData() {
        return Array.from(this.players.values()).map(player => ({
            id: player.id,
            name: player.name,
            x: player.x,
            y: player.y,
            vx: player.vx || 0,
            vy: player.vy || 0,
            health: player.health,
            ammo: player.ammo,
            reserveAmmo: player.reserveAmmo,
            kills: player.kills,
            deaths: player.deaths,
            score: player.score,
            angle: player.angle
        }));
    }

    updatePlayer(socketId, data) {
        const player = this.players.get(socketId);
        if (player && this.gameState === 'playing') {
            const newX = data.x;
            const newY = data.y;
            const newAngle = data.angle;
            const newVx = data.vx || 0;
            const newVy = data.vy || 0;
            
            // Validate movement (check for obstacles and boundaries)
            if (this.isValidPlayerPosition(newX, newY)) {
                // Check if movement is reasonable (anti-cheat)
                const distance = Math.sqrt(
                    Math.pow(newX - player.x, 2) + 
                    Math.pow(newY - player.y, 2)
                );
                
                // Allow reasonable movement speed (increased for 60fps updates)
                const maxDistance = 15; // Reduced since we're sending updates more frequently
                
                if (distance <= maxDistance) {
                    player.x = newX;
                    player.y = newY;
                    if (newAngle !== undefined) player.angle = newAngle;
                    player.vx = newVx;
                    player.vy = newVy;
                    player.lastUpdate = Date.now();
                    return true;
                } else {
                    // Movement too fast, likely cheating
                    console.log(`Player ${socketId} attempted invalid movement: distance ${distance}`);
                    return false;
                }
            } else {
                // Invalid position (obstacle or out of bounds)
                console.log(`Player ${socketId} attempted invalid position: (${newX}, ${newY})`);
                return false;
            }
        }
        return false;
    }
    
    isValidPlayerPosition(x, y) {
        const playerSize = 25;
        
        // Check map boundaries
        if (x - playerSize < 0 || 
            x + playerSize > this.mapWidth ||
            y - playerSize < 0 || 
            y + playerSize > this.mapHeight) {
            return false;
        }
        
        // Check obstacle collision
        const obstacles = this.getObstacles();
        for (let obstacle of obstacles) {
            if (this.checkRectangleCollision(
                x - playerSize,
                y - playerSize,
                playerSize * 2,
                playerSize * 2,
                obstacle.x,
                obstacle.y,
                obstacle.width,
                obstacle.height
            )) {
                return false;
            }
        }
        
        return true;
    }

    handlePlayerShoot(socketId) {
        const player = this.players.get(socketId);
        if (!player || this.gameState !== 'playing' || player.health <= 0) return null;

        if (player.ammo <= 0) return null;

        player.ammo--;
        
        const bullet = {
            id: Date.now() + Math.random(),
            x: player.x + Math.cos(player.angle) * 25,
            y: player.y + Math.sin(player.angle) * 25,
            vx: Math.cos(player.angle) * 15,
            vy: Math.sin(player.angle) * 15,
            ownerId: socketId,
            ownerName: player.name,
            angle: player.angle,
            damage: 25,
            life: 1000,
            timestamp: Date.now()
        };

        this.bullets.push(bullet);
        
        // Broadcast bullet to all players in room (including the shooter for confirmation)
        io.to(this.id).emit('bulletFired', bullet);

        return bullet;
    }

    handlePlayerReload(socketId) {
        const player = this.players.get(socketId);
        if (!player || this.gameState !== 'playing' || player.health <= 0) return false;

        if (player.reserveAmmo <= 0 || player.ammo >= player.maxAmmo) return false;

        const ammoNeeded = player.maxAmmo - player.ammo;
        const ammoToReload = Math.min(ammoNeeded, player.reserveAmmo);
        
        player.ammo += ammoToReload;
        player.reserveAmmo -= ammoToReload;

        return true;
    }
}

// Store all game rooms
const rooms = new Map();
let roomCounter = 1;

// Find or create available room
function findAvailableRoom() {
    // Look for existing room with space
    for (let room of rooms.values()) {
        if (room.gameState === 'waiting' && room.players.size < room.maxPlayers) {
            return room;
        }
    }
    
    // Create new room if none available
    const roomId = `room_${roomCounter++}`;
    const newRoom = new GameRoom(roomId);
    rooms.set(roomId, newRoom);
    console.log(`Created new room: ${roomId}`);
    return newRoom;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    let currentRoom = null;

    // Handle player joining matchmaking
    socket.on('joinMatchmaking', (playerData) => {
        console.log(`${playerData.name} (${socket.id}) joining matchmaking`);
        
        // Find available room
        const room = findAvailableRoom();
        
        if (room.addPlayer(socket, playerData)) {
            currentRoom = room;
            
            // Send room status to player including current players
            socket.emit('roomJoined', {
                roomId: room.id,
                playersCount: room.players.size,
                maxPlayers: room.maxPlayers,
                gameState: room.gameState,
                players: room.getPlayersData()
            });

            // Broadcast updated player list to all players in room
            io.to(room.id).emit('playersUpdate', {
                playersCount: room.players.size,
                players: room.getPlayersData()
            });

            // Send the new player info to existing players
            const newPlayer = room.players.get(socket.id);
            if (newPlayer) {
                socket.to(room.id).emit('playerJoined', {
                    player: {
                        id: socket.id,
                        name: newPlayer.name,
                        x: newPlayer.x,
                        y: newPlayer.y,
                        vx: newPlayer.vx || 0,
                        vy: newPlayer.vy || 0,
                        health: newPlayer.health,
                        ammo: newPlayer.ammo,
                        reserveAmmo: newPlayer.reserveAmmo,
                        kills: newPlayer.kills,
                        deaths: newPlayer.deaths,
                        score: newPlayer.score,
                        angle: newPlayer.angle
                    }
                });
            }

            console.log(`${playerData.name} joined room ${room.id} (${room.players.size}/${room.maxPlayers})`);
        } else {
            socket.emit('matchmakingError', 'Could not join room');
        }
    });

    // Handle player movement
    socket.on('playerMove', (data) => {
        if (currentRoom) {
            const updateResult = currentRoom.updatePlayer(socket.id, data);
            if (updateResult) {
                // Broadcast movement to other players with velocity data
                socket.to(currentRoom.id).emit('playerMoved', {
                    playerId: socket.id,
                    x: data.x,
                    y: data.y,
                    angle: data.angle,
                    vx: data.vx || 0,
                    vy: data.vy || 0,
                    timestamp: Date.now()
                });
            } else {
                // Movement was rejected, send position correction back to client
                const player = currentRoom.players.get(socket.id);
                if (player) {
                    socket.emit('positionCorrection', {
                        x: player.x,
                        y: player.y,
                        angle: player.angle,
                        vx: player.vx || 0,
                        vy: player.vy || 0
                    });
                }
            }
        }
    });

    // Handle player shooting
    socket.on('playerShoot', () => {
        if (currentRoom) {
            const bullet = currentRoom.handlePlayerShoot(socket.id);
            if (bullet) {
                const player = currentRoom.players.get(socket.id);
                // Broadcast updated ammo
                io.to(currentRoom.id).emit('playerAmmoUpdate', {
                    playerId: socket.id,
                    ammo: player.ammo,
                    reserveAmmo: player.reserveAmmo
                });
            }
        }
    });

    // Handle player reload
    socket.on('playerReload', () => {
        if (currentRoom && currentRoom.handlePlayerReload(socket.id)) {
            const player = currentRoom.players.get(socket.id);
            io.to(currentRoom.id).emit('playerAmmoUpdate', {
                playerId: socket.id,
                ammo: player.ammo,
                reserveAmmo: player.reserveAmmo
            });
        }
    });

    // Handle bullet hit
    socket.on('bulletHit', (data) => {
        if (!currentRoom || currentRoom.gameState !== 'playing') return;

        const shooter = currentRoom.players.get(data.shooterId);
        const target = currentRoom.players.get(data.targetId);
        
        if (!shooter || !target || target.health <= 0) return;

        target.health -= data.damage;
        
        if (target.health <= 0) {
            target.health = 0;
            target.deaths++;
            shooter.kills++;
            shooter.score += 100;

            // Broadcast kill
            io.to(currentRoom.id).emit('playerKilled', {
                killerId: shooter.id,
                killerName: shooter.name,
                victimId: target.id,
                victimName: target.name
            });

            // Respawn after 3 seconds
            setTimeout(() => {
                if (currentRoom && target.health <= 0) {
                    const spawnPoint = currentRoom.getRandomSpawnPoint();
                    target.x = spawnPoint.x;
                    target.y = spawnPoint.y;
                    target.health = target.maxHealth;

                    io.to(currentRoom.id).emit('playerRespawn', {
                        playerId: target.id,
                        x: target.x,
                        y: target.y,
                        health: target.health
                    });
                }
            }, 3000);
        }

        // Broadcast health update
        io.to(currentRoom.id).emit('playerHealthUpdate', {
            playerId: target.id,
            health: target.health
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        
        if (currentRoom) {
            currentRoom.removePlayer(socket.id);
            
            // Broadcast updated player count
            io.to(currentRoom.id).emit('playersUpdate', {
                playersCount: currentRoom.players.size,
                players: currentRoom.getPlayersData()
            });

            // Broadcast player left
            io.to(currentRoom.id).emit('playerLeft', {
                playerId: socket.id
            });
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Mobile ApexFire Server running on port ${PORT}`);
    console.log(`📡 Socket.IO server ready for connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Server shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
}); 