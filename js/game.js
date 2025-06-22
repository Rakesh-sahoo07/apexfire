// Main game engine
class GameEngine {
    constructor(playerName, gameData) {
        this.playerName = playerName;
        this.gameData = gameData;
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Game state
        this.isRunning = false;
        this.lastTime = 0;
        this.gameTime = 0;
        this.gameStartTime = Date.now();
        
        // Players and bullets
        this.myPlayer = null;
        this.networkPlayers = new Map(); // Store other players
        this.bullets = [];
        
        // Map properties
        this.mapWidth = 1200;
        this.mapHeight = 800;
        this.obstacles = [];
        this.mapTiles = [];
        
        this.generateMap();
        
        // Camera
        this.camera = { x: 0, y: 0 };
        
        // Controls
        this.controls = null;
        
        // UI Elements
        this.killFeed = [];
        this.maxKillFeedItems = 5;
        
        // Game timer
        this.gameLength = 60000; // 1 minute in milliseconds
        this.timeRemaining = this.gameLength; // Track remaining time
        this.timerElement = document.getElementById('gameTimer');
        
        // Visual effects
        this.muzzleFlashes = [];
        
        // Network sync
        this.lastNetworkUpdate = 0;
        this.networkUpdateRate = 16; // ~60 FPS updates (16ms between updates)
        this.lastSentX = 0;
        this.lastSentY = 0;
        this.lastSentAngle = 0;
        this.lastSentVx = 0;
        this.lastSentVy = 0;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.createMyPlayer();
        this.initializeNetworkPlayers();
        this.setupControls();
        this.setupUI();
        this.setupNetworkListeners();
    }
    
    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Prevent scrolling on mobile
        document.body.style.overflow = 'hidden';
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    createMyPlayer() {
        // Create main player based on network data
        const myPlayerData = this.gameData.players.find(p => p.id === window.networkManager.playerId);
        if (myPlayerData) {
            this.myPlayer = new Player(myPlayerData.name, myPlayerData.x, myPlayerData.y, true);
            this.myPlayer.id = myPlayerData.id;
        }
    }
    
    initializeNetworkPlayers() {
        // Initialize other players from network data
        if (this.gameData && this.gameData.players) {
            console.log('Initializing network players:', this.gameData.players);
            this.gameData.players.forEach(playerData => {
                if (playerData.id !== window.networkManager.playerId) {
                    const networkPlayer = new Player(playerData.name, playerData.x, playerData.y, false, true);
                    networkPlayer.id = playerData.id;
                    networkPlayer.health = playerData.health;
                    networkPlayer.ammo = playerData.ammo;
                    networkPlayer.reserveAmmo = playerData.reserveAmmo;
                    networkPlayer.kills = playerData.kills;
                    networkPlayer.deaths = playerData.deaths;
                    networkPlayer.score = playerData.score;
                    networkPlayer.angle = playerData.angle;
                    this.networkPlayers.set(playerData.id, networkPlayer);
                    console.log('Added network player:', playerData.name);
                }
            });
            console.log('Total network players:', this.networkPlayers.size);
        }
    }
    
    setupControls() {
        this.controls = new MobileControls(this);
    }
    
    setupNetworkListeners() {
        // Handle other players' movements with improved interpolation
        window.networkManager.on('playerMoved', (data) => {
            let player = this.networkPlayers.get(data.playerId);
            if (!player) {
                // Create missing player if we receive movement data for unknown player
                console.log('Creating missing player from movement data:', data.playerId);
                player = new Player('Unknown', data.x, data.y, false, true);
                player.id = data.playerId;
                this.networkPlayers.set(data.playerId, player);
            }
            
            // Store target position and velocity for smooth interpolation
            player.targetX = data.x;
            player.targetY = data.y;
            player.targetAngle = data.angle;
            player.targetVx = data.vx || 0;
            player.targetVy = data.vy || 0;
            player.lastUpdateTime = Date.now();
            
            // If this is the first update, snap to position
            if (player.networkInitialized !== true) {
                player.x = data.x;
                player.y = data.y;
                player.angle = data.angle;
                player.vx = data.vx || 0;
                player.vy = data.vy || 0;
                player.networkInitialized = true;
            }
        });

        // Handle bullets from other players
        window.networkManager.on('bulletFired', (bulletData) => {
            if (bulletData.ownerId !== window.networkManager.playerId) {
                // Add visual effects for bullet firing
                this.addMuzzleFlash(bulletData.x, bulletData.y, bulletData.angle);
                
                // Play gunshot sound for other players (with distance-based volume)
                if (window.audioManager && this.myPlayer) {
                    const distance = Math.sqrt(
                        Math.pow(bulletData.x - this.myPlayer.x, 2) + 
                        Math.pow(bulletData.y - this.myPlayer.y, 2)
                    );
                    // Reduce volume based on distance (max distance ~400 pixels)
                    const volume = Math.max(0.1, Math.min(1.0, 1.0 - (distance / 400)));
                    window.audioManager.playGunshot(volume);
                }
                
                this.bullets.push({
                    x: bulletData.x,
                    y: bulletData.y,
                    vx: bulletData.vx,
                    vy: bulletData.vy,
                    ownerId: bulletData.ownerId,
                    damage: bulletData.damage,
                    life: bulletData.life,
                    id: bulletData.id
                });
            }
        });

        // Handle ammo updates
        window.networkManager.on('playerAmmoUpdate', (data) => {
            const player = this.networkPlayers.get(data.playerId);
            if (player) {
                player.ammo = data.ammo;
                player.reserveAmmo = data.reserveAmmo;
            } else if (data.playerId === window.networkManager.playerId && this.myPlayer) {
                this.myPlayer.ammo = data.ammo;
                this.myPlayer.reserveAmmo = data.reserveAmmo;
            }
        });

        // Handle health updates
        window.networkManager.on('playerHealthUpdate', (data) => {
            const player = this.networkPlayers.get(data.playerId);
            if (player) {
                player.health = data.health;
            } else if (data.playerId === window.networkManager.playerId && this.myPlayer) {
                this.myPlayer.health = data.health;
            }
        });

        // Handle kills
        window.networkManager.on('playerKilled', (data) => {
            this.addKillFeedMessage(`${data.killerName} eliminated ${data.victimName}`);
            
            // Update killer stats
            const killer = this.networkPlayers.get(data.killerId);
            if (killer) {
                killer.kills++;
                killer.score += 100;
            } else if (data.killerId === window.networkManager.playerId && this.myPlayer) {
                this.myPlayer.kills++;
                this.myPlayer.score += 100;
            }

            // Update victim stats  
            const victim = this.networkPlayers.get(data.victimId);
            if (victim) {
                victim.deaths++;
                victim.health = 0;
            } else if (data.victimId === window.networkManager.playerId && this.myPlayer) {
                this.myPlayer.deaths++;
                this.myPlayer.health = 0;
            }
        });

        // Handle respawns
        window.networkManager.on('playerRespawn', (data) => {
            const player = this.networkPlayers.get(data.playerId);
            if (player) {
                player.x = data.x;
                player.y = data.y;
                player.health = data.health;
            } else if (data.playerId === window.networkManager.playerId && this.myPlayer) {
                this.myPlayer.x = data.x;
                this.myPlayer.y = data.y;
                this.myPlayer.health = data.health;
            }
        });

        // Handle players leaving
        window.networkManager.on('playerLeft', (data) => {
            const player = this.networkPlayers.get(data.playerId);
            if (player) {
                console.log('Player left:', player.name, data.playerId);
                this.networkPlayers.delete(data.playerId);
            }
        });

        // Handle position corrections from server
        window.networkManager.on('positionCorrection', (data) => {
            if (this.myPlayer) {
                console.log('Position corrected by server');
                this.myPlayer.x = data.x;
                this.myPlayer.y = data.y;
                this.myPlayer.angle = data.angle;
                this.myPlayer.vx = data.vx || 0;
                this.myPlayer.vy = data.vy || 0;
                
                // Update last sent values to prevent immediate re-sending of incorrect position
                this.lastSentX = data.x;
                this.lastSentY = data.y;
                this.lastSentAngle = data.angle;
                this.lastSentVx = data.vx || 0;
                this.lastSentVy = data.vy || 0;
            }
        });

        // Handle server-side position synchronization
        window.networkManager.on('playersPositionSync', (data) => {
            if (data.players) {
                data.players.forEach(playerData => {
                    if (playerData.id !== window.networkManager.playerId) {
                        let player = this.networkPlayers.get(playerData.id);
                        if (!player) {
                            // Create missing network player
                            console.log('Creating missing network player during sync:', playerData.id);
                            player = new Player(playerData.name || 'Unknown', playerData.x, playerData.y, false, true);
                            player.id = playerData.id;
                            player.health = playerData.health || 100;
                            player.ammo = playerData.ammo || 30;
                            player.reserveAmmo = playerData.reserveAmmo || 120;
                            player.kills = playerData.kills || 0;
                            player.deaths = playerData.deaths || 0;
                            player.score = playerData.score || 0;
                            player.angle = playerData.angle || 0;
                            this.networkPlayers.set(playerData.id, player);
                        }
                        
                        // Update target position for smooth interpolation
                        player.targetX = playerData.x;
                        player.targetY = playerData.y;
                        player.targetVx = playerData.vx;
                        player.targetVy = playerData.vy;
                        player.targetAngle = playerData.angle;
                        player.lastUpdateTime = Date.now();
                    }
                });
            }
        });
    }
    
    handlePlayersUpdate(data) {
        // Update existing players or add new ones from the full player list
        if (data.players) {
            console.log(`Received player update with ${data.players.length} players`);
            
            // Track which players we should have
            const expectedPlayerIds = new Set();
            
            data.players.forEach(playerData => {
                if (playerData.id !== window.networkManager.playerId) {
                    expectedPlayerIds.add(playerData.id);
                    
                    let player = this.networkPlayers.get(playerData.id);
                    if (!player) {
                        // Create new network player
                        player = new Player(playerData.name, playerData.x, playerData.y, false, true);
                        player.id = playerData.id;
                        player.networkInitialized = true;
                        this.networkPlayers.set(playerData.id, player);
                        console.log('Added new network player:', playerData.name, playerData.id);
                    }
                    
                    // Update player data (use current position if we have interpolation targets)
                    if (!player.targetX && !player.targetY) {
                        player.x = playerData.x;
                        player.y = playerData.y;
                        player.angle = playerData.angle;
                    }
                    
                    // Always update stats and health
                    player.health = playerData.health;
                    player.ammo = playerData.ammo;
                    player.reserveAmmo = playerData.reserveAmmo;
                    player.kills = playerData.kills;
                    player.deaths = playerData.deaths;
                    player.score = playerData.score;
                    player.name = playerData.name; // Update name in case it changed
                    
                    // Update velocity data if available
                    if (playerData.vx !== undefined) player.vx = playerData.vx;
                    if (playerData.vy !== undefined) player.vy = playerData.vy;
                }
            });
            
            // Remove players that are no longer in the room
            for (let [playerId, player] of this.networkPlayers) {
                if (!expectedPlayerIds.has(playerId)) {
                    console.log('Removing disconnected player:', player.name, playerId);
                    this.networkPlayers.delete(playerId);
                }
            }
            
            console.log(`Now tracking ${this.networkPlayers.size} network players`);
        }
    }
    
    handlePlayerJoined(data) {
        // Add new player during waiting phase
        const playerData = data.player;
        if (playerData.id !== window.networkManager.playerId) {
            const player = new Player(playerData.name, playerData.x, playerData.y, false, true);
            player.id = playerData.id;
            player.health = playerData.health;
            player.ammo = playerData.ammo;
            player.reserveAmmo = playerData.reserveAmmo;
            player.kills = playerData.kills;
            player.deaths = playerData.deaths;
            player.score = playerData.score;
            player.angle = playerData.angle;
            this.networkPlayers.set(playerData.id, player);
            console.log('Player joined during waiting:', playerData.name);
        }
    }
    
    setupUI() {
        // Setup leaderboard toggle functionality
        this.setupLeaderboardToggle();
    }

    setupLeaderboardToggle() {
        // Remove any existing event listeners to prevent duplicates
        this.removeExistingLeaderboardListeners();
        
        const leaderboardToggle = document.getElementById('leaderboardToggle');
        const leaderboardClose = document.getElementById('leaderboardClose');
        const leaderboard = document.getElementById('leaderboard');
        
        if (!leaderboardToggle || !leaderboardClose || !leaderboard) {
            console.warn('Leaderboard elements not found, retrying in 100ms...');
            setTimeout(() => this.setupLeaderboardToggle(), 100);
            return;
        }
        
        // Create bound methods to store references for removal
        this.toggleLeaderboardBound = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleLeaderboard();
        };
        
        this.closeLeaderboardBound = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideLeaderboard();
        };
        
        this.outsideClickBound = (e) => {
            if (!leaderboard.contains(e.target) && !leaderboardToggle.contains(e.target)) {
                if (leaderboard.classList.contains('show')) {
                    this.hideLeaderboard();
                }
            }
        };
        
        // Add event listeners
        leaderboardToggle.addEventListener('click', this.toggleLeaderboardBound);
        leaderboardToggle.addEventListener('touchend', this.toggleLeaderboardBound);
        
        leaderboardClose.addEventListener('click', this.closeLeaderboardBound);
        leaderboardClose.addEventListener('touchend', this.closeLeaderboardBound);
        
        // Delayed addition of outside click listener to prevent immediate closing
        setTimeout(() => {
            document.addEventListener('click', this.outsideClickBound);
        }, 100);
        
        console.log('Leaderboard toggle setup complete');
    }

    removeExistingLeaderboardListeners() {
        const leaderboardToggle = document.getElementById('leaderboardToggle');
        const leaderboardClose = document.getElementById('leaderboardClose');
        
        // Remove existing listeners if they exist
        if (this.toggleLeaderboardBound && leaderboardToggle) {
            leaderboardToggle.removeEventListener('click', this.toggleLeaderboardBound);
            leaderboardToggle.removeEventListener('touchend', this.toggleLeaderboardBound);
        }
        
        if (this.closeLeaderboardBound && leaderboardClose) {
            leaderboardClose.removeEventListener('click', this.closeLeaderboardBound);
            leaderboardClose.removeEventListener('touchend', this.closeLeaderboardBound);
        }
        
        if (this.outsideClickBound) {
            document.removeEventListener('click', this.outsideClickBound);
        }
    }

    toggleLeaderboard() {
        const leaderboard = document.getElementById('leaderboard');
        const toggle = document.getElementById('leaderboardToggle');
        
        if (!leaderboard || !toggle) {
            console.warn('Leaderboard elements not found for toggle');
            return;
        }
        
        console.log('Toggling leaderboard, current state:', leaderboard.classList.contains('show'));
        
        if (leaderboard.classList.contains('show')) {
            this.hideLeaderboard();
        } else {
            this.showLeaderboard();
        }
    }

    showLeaderboard() {
        const leaderboard = document.getElementById('leaderboard');
        const toggle = document.getElementById('leaderboardToggle');
        
        if (!leaderboard || !toggle) {
            console.warn('Leaderboard elements not found for show');
            return;
        }
        
        console.log('Showing leaderboard');
        
        // Ensure the leaderboard is ready
        leaderboard.classList.remove('hidden');
        
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            leaderboard.classList.add('show');
            toggle.classList.add('active');
            
            // Update leaderboard content when showing
            this.updateLeaderboard();
        });
    }

    hideLeaderboard() {
        const leaderboard = document.getElementById('leaderboard');
        const toggle = document.getElementById('leaderboardToggle');
        
        if (!leaderboard || !toggle) {
            console.warn('Leaderboard elements not found for hide');
            return;
        }
        
        console.log('Hiding leaderboard');
        
        leaderboard.classList.remove('show');
        toggle.classList.remove('active');
        
        // Add hidden class after animation completes
        setTimeout(() => {
            if (leaderboard && !leaderboard.classList.contains('show')) {
                leaderboard.classList.add('hidden');
            }
        }, 400);
    }
    
    generateMap() {
        // Generate ground tiles
        const tileSize = 32;
        for (let x = 0; x < this.mapWidth; x += tileSize) {
            for (let y = 0; y < this.mapHeight; y += tileSize) {
                this.mapTiles.push({
                    x: x,
                    y: y,
                    size: tileSize,
                    type: Math.random() > 0.8 ? 'dirt' : 'grass'
                });
            }
        }
        
        // Add buildings and obstacles
        this.obstacles = [
            // Central building complex
            { x: 500, y: 300, width: 120, height: 80, type: 'building', color: '#8B4513' },
            { x: 550, y: 250, width: 80, height: 40, type: 'building', color: '#A0522D' },
            
            // Corner structures
            { x: 100, y: 100, width: 60, height: 60, type: 'building', color: '#696969' },
            { x: 1040, y: 100, width: 60, height: 60, type: 'building', color: '#696969' },
            { x: 100, y: 640, width: 60, height: 60, type: 'building', color: '#696969' },
            { x: 1040, y: 640, width: 60, height: 60, type: 'building', color: '#696969' },
            
            // Scattered cover objects
            { x: 300, y: 200, width: 30, height: 30, type: 'crate', color: '#8B4513' },
            { x: 800, y: 300, width: 30, height: 30, type: 'crate', color: '#8B4513' },
            { x: 200, y: 500, width: 30, height: 30, type: 'crate', color: '#8B4513' },
            { x: 900, y: 500, width: 30, height: 30, type: 'crate', color: '#8B4513' },
            
            // Walls for cover
            { x: 400, y: 150, width: 100, height: 20, type: 'wall', color: '#4a4a4a' },
            { x: 700, y: 150, width: 100, height: 20, type: 'wall', color: '#4a4a4a' },
            { x: 400, y: 600, width: 100, height: 20, type: 'wall', color: '#4a4a4a' },
            { x: 700, y: 600, width: 100, height: 20, type: 'wall', color: '#4a4a4a' },
            
            // Trees
            { x: 250, y: 350, width: 25, height: 25, type: 'tree', color: '#228B22' },
            { x: 950, y: 200, width: 25, height: 25, type: 'tree', color: '#228B22' },
            { x: 150, y: 300, width: 25, height: 25, type: 'tree', color: '#228B22' },
            { x: 850, y: 450, width: 25, height: 25, type: 'tree', color: '#228B22' },
        ];
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
        const playerSize = 25;
        const safetyMargin = 15;
        
        // Check if spawn point conflicts with any obstacle (with safety margin)
        for (let obstacle of this.obstacles) {
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
        
        // Check if spawn point is within map bounds
        if (spawnPoint.x - playerSize < 0 || 
            spawnPoint.x + playerSize > this.mapWidth ||
            spawnPoint.y - playerSize < 0 || 
            spawnPoint.y + playerSize > this.mapHeight) {
            return false;
        }
        
        return true;
    }
    
    start() {
        this.isRunning = true;
        this.lastTime = performance.now();
        this.gameStartTime = Date.now();
        this.gameLoop();
    }
    
    gameLoop() {
        if (!this.isRunning) return;
        
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.update(deltaTime);
        this.render();
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    update(deltaTime) {
        if (!this.myPlayer) return;

        // Update game timer
        this.updateGameTimer(deltaTime);

        // Update player movement from controls
        if (this.myPlayer.health > 0) {
            const moveInput = this.controls.getMoveInput();
            const oldX = this.myPlayer.x;
            const oldY = this.myPlayer.y;
            const oldVx = this.myPlayer.vx;
            const oldVy = this.myPlayer.vy;
            
            // Apply movement input
            this.myPlayer.move(moveInput.x, moveInput.y);
            
            // Test collision with new position
            const newX = this.myPlayer.x + this.myPlayer.vx;
            const newY = this.myPlayer.y + this.myPlayer.vy;
            
            // Create temporary player position for collision testing
            const testPlayer = {
                x: newX,
                y: newY,
                size: this.myPlayer.size
            };
            
            // Track if collision correction occurred
            let collisionCorrected = false;
                 
            // Check collision with obstacles
            if (this.checkObstacleCollision(testPlayer)) {
                // Try moving only horizontally
                testPlayer.x = newX;
                testPlayer.y = this.myPlayer.y;
                
                if (!this.checkObstacleCollision(testPlayer)) {
                    // Horizontal movement is okay, block vertical
                    this.myPlayer.vy = 0;
                    collisionCorrected = true;
                } else {
                    // Try moving only vertically
                    testPlayer.x = this.myPlayer.x;
                    testPlayer.y = newY;
                    
                    if (!this.checkObstacleCollision(testPlayer)) {
                        // Vertical movement is okay, block horizontal
                        this.myPlayer.vx = 0;
                        collisionCorrected = true;
                    } else {
                        // Both directions blocked, stop all movement
                        this.myPlayer.vx = 0;
                        this.myPlayer.vy = 0;
                        collisionCorrected = true;
                    }
                }
            }
            
            // Send position update to server with higher frequency and precision
            const now = Date.now();
            const positionChanged = Math.abs(this.myPlayer.x - this.lastSentX) > 0.5 || 
                                   Math.abs(this.myPlayer.y - this.lastSentY) > 0.5;
            const angleChanged = Math.abs(this.myPlayer.angle - this.lastSentAngle) > 0.05;
            const velocityChanged = Math.abs(this.myPlayer.vx - this.lastSentVx) > 0.1 ||
                                   Math.abs(this.myPlayer.vy - this.lastSentVy) > 0.1;
            const isMoving = Math.abs(this.myPlayer.vx) > 0.01 || Math.abs(this.myPlayer.vy) > 0.01;
            
            // Send updates more frequently when moving, less when stationary
            const updateRate = isMoving ? this.networkUpdateRate : this.networkUpdateRate * 2;
            
            // Force immediate update if collision was corrected or regular update conditions are met
            if (collisionCorrected || 
                ((now - this.lastNetworkUpdate > updateRate) && 
                (positionChanged || angleChanged || velocityChanged || isMoving))) {
                
                window.networkManager.sendPlayerMove(
                    this.myPlayer.x, 
                    this.myPlayer.y, 
                    this.myPlayer.angle,
                    this.myPlayer.vx,
                    this.myPlayer.vy
                );
                this.lastNetworkUpdate = now;
                this.lastSentX = this.myPlayer.x;
                this.lastSentY = this.myPlayer.y;
                this.lastSentAngle = this.myPlayer.angle;
                this.lastSentVx = this.myPlayer.vx;
                this.lastSentVy = this.myPlayer.vy;
            }
        }
            
        // Update my player (no AI update) but handle collision properly
        const beforeUpdateX = this.myPlayer.x;
        const beforeUpdateY = this.myPlayer.y;
        
        this.myPlayer.update(deltaTime, [this.myPlayer], {
            width: this.mapWidth,
            height: this.mapHeight
        });

        // Check if the player moved into an obstacle after the update
        if (this.checkObstacleCollision(this.myPlayer)) {
            // Revert to previous position and stop movement
            this.myPlayer.x = beforeUpdateX;
            this.myPlayer.y = beforeUpdateY;
            this.myPlayer.vx = 0;
            this.myPlayer.vy = 0;
            
            // Send immediate correction to server
            window.networkManager.sendPlayerMove(
                this.myPlayer.x, 
                this.myPlayer.y, 
                this.myPlayer.angle,
                this.myPlayer.vx,
                this.myPlayer.vy
            );
            this.lastSentX = this.myPlayer.x;
            this.lastSentY = this.myPlayer.y;
            this.lastSentVx = this.myPlayer.vx;
            this.lastSentVy = this.myPlayer.vy;
        }
        
        // Update network players (visual only, no AI)
        this.networkPlayers.forEach(player => {
            player.update(deltaTime, [], {
                width: this.mapWidth,
                height: this.mapHeight
            });
        });

        // Update bullets
        this.updateBullets(deltaTime);
        
        // Update muzzle flashes
        this.updateMuzzleFlashes();

        // Update camera
        this.updateCamera();

        // Update UI
        this.updateUI();

        // Update controls (for auto-fire feature)
        if (this.controls) {
            this.controls.update();
        }
    }
    
    updateGameTimer(deltaTime) {
        if (this.gameStartTime) {
            const elapsed = Date.now() - this.gameStartTime;
            this.timeRemaining = Math.max(0, this.gameLength - elapsed);
            
            // Update timer display
            const minutes = Math.floor(this.timeRemaining / 60000);
            const seconds = Math.floor((this.timeRemaining % 60000) / 1000);
            const timerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            if (this.timerElement) {
                this.timerElement.textContent = timerText;
                
                // Add visual warnings based on time remaining
                this.timerElement.classList.remove('warning', 'critical');
                if (this.timeRemaining <= 10000) { // Last 10 seconds
                    this.timerElement.classList.add('critical');
                } else if (this.timeRemaining <= 20000) { // Last 20 seconds
                    this.timerElement.classList.add('warning');
                }
            }
            
            // End game when time runs out
            if (this.timeRemaining <= 0) {
                this.endGame();
            }
        }
    }

    // Linear interpolation helper
    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // Angle interpolation (handles wrapping around 2π)
    lerpAngle(a, b, t) {
        let diff = b - a;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        return a + diff * t;
    }

    // Send network update at controlled rate
    sendNetworkUpdate() {
        // This method is called from the original update function
        // Network updates are already handled in the player movement section
    }
    
    updateBullets(deltaTime) {
        this.bullets = this.bullets.filter(bullet => {
            // Update bullet position
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            bullet.life -= deltaTime;
            
            // Remove bullets that are out of bounds or expired
            if (bullet.life <= 0 || 
                bullet.x < 0 || bullet.x > this.mapWidth ||
                bullet.y < 0 || bullet.y > this.mapHeight) {
                return false;
            }
            
            // Check collision with obstacles using point-in-rectangle collision
            for (let obstacle of this.obstacles) {
                if (this.checkPointInRectangle(bullet.x, bullet.y, obstacle.x, obstacle.y, obstacle.width, obstacle.height)) {
                    return false; // Remove bullet
                }
            }
            
            // Check collision with players
            const allPlayers = [this.myPlayer, ...this.networkPlayers.values()];
            
            for (let player of allPlayers) {
                if (bullet.ownerId === player.id || player.health <= 0) continue;
                
                const distance = Math.sqrt(
                    Math.pow(bullet.x - player.x, 2) + Math.pow(bullet.y - player.y, 2)
                );
                
                if (distance < player.size) {
                    // Hit! Send to server for validation
                    window.networkManager.sendBulletHit(bullet.ownerId, player.id, bullet.damage);
                    return false; // Remove bullet
                }
            }
            
            return true; // Keep bullet
        });
    }
    
    updateMuzzleFlashes() {
        const now = Date.now();
        this.muzzleFlashes = this.muzzleFlashes.filter(flash => {
            return (now - flash.startTime) < flash.life;
        });
    }
    
    updateCamera() {
        if (this.myPlayer) {
            // Smooth camera follow
            const targetX = this.myPlayer.x - this.canvas.width / 2;
            const targetY = this.myPlayer.y - this.canvas.height / 2;
            
            this.camera.x += (targetX - this.camera.x) * 0.1;
            this.camera.y += (targetY - this.camera.y) * 0.1;
            
            // Keep camera in bounds
            this.camera.x = Math.max(0, Math.min(this.mapWidth - this.canvas.width, this.camera.x));
            this.camera.y = Math.max(0, Math.min(this.mapHeight - this.canvas.height, this.camera.y));
        }
    }
    
    updateUI() {
        if (!this.myPlayer) return;
        
        // Update health
        const healthPercent = (this.myPlayer.health / this.myPlayer.maxHealth) * 100;
        document.getElementById('healthFill').style.width = healthPercent + '%';
        document.getElementById('healthText').textContent = Math.ceil(this.myPlayer.health);
        
        // Update ammo
        document.getElementById('ammoCount').textContent = this.myPlayer.ammo;
        document.getElementById('ammoReserve').textContent = this.myPlayer.reserveAmmo;
        
        // Update kills
        document.getElementById('killCount').textContent = this.myPlayer.kills;
        
        // Update leaderboard periodically when visible
        if (Date.now() % 500 < 50) { // Update every 500ms for real-time feel
            this.updateLeaderboard();
        }
    }
    
    updateLeaderboard() {
        const leaderboardList = document.getElementById('leaderboardList');
        
        // Only update if leaderboard is visible to save performance
        if (!document.getElementById('leaderboard').classList.contains('show')) {
            return;
        }
        
        // Collect all players
        const allPlayers = [];
        if (this.myPlayer) allPlayers.push(this.myPlayer);
        this.networkPlayers.forEach(player => allPlayers.push(player));
        
        // Sort players by kills first, then by K/D ratio
        const sortedPlayers = allPlayers.sort((a, b) => {
            if (b.kills !== a.kills) {
                return b.kills - a.kills;
            }
            // If kills are equal, sort by K/D ratio
            const aKD = a.deaths === 0 ? a.kills : a.kills / a.deaths;
            const bKD = b.deaths === 0 ? b.kills : b.kills / b.deaths;
            return bKD - aKD;
        });
        
        leaderboardList.innerHTML = '';
        sortedPlayers.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            // Highlight current player
            if (player.id === window.networkManager.playerId) {
                item.classList.add('current-player');
            }
            
            // Calculate K/D ratio
            const kdRatio = player.deaths === 0 ? 
                (player.kills === 0 ? '0.00' : player.kills.toFixed(2)) : 
                (player.kills / player.deaths).toFixed(2);
            
            item.innerHTML = `
                <span class="player-name">${player.name}</span>
                <span class="stat-kills">${player.kills}</span>
                <span class="stat-deaths">${player.deaths}</span>
                <span class="stat-kd">${kdRatio}</span>
            `;
            
            leaderboardList.appendChild(item);
        });
    }
    
    addKillFeedMessage(message) {
        const messageId = Date.now() + Math.random();
        this.killFeed.unshift({
            message: message,
            time: Date.now(),
            id: messageId
        });
        
        // Limit kill feed items
        if (this.killFeed.length > this.maxKillFeedItems) {
            this.killFeed.pop();
        }
        
        // Update kill feed UI
        this.updateKillFeedUI();
        
        // Start fade-out after 2 seconds
        setTimeout(() => {
            this.fadeOutKillMessage(messageId);
        }, 2000);
        
        // Remove from array after fade animation completes (2.5 seconds total)
        setTimeout(() => {
            this.killFeed = this.killFeed.filter(item => item.id !== messageId);
            this.updateKillFeedUI();
        }, 2500);
    }
    
    updateKillFeedUI() {
        const killFeedElement = document.getElementById('killFeed');
        killFeedElement.innerHTML = '';
        
        this.killFeed.forEach(item => {
            const messageElement = document.createElement('div');
            messageElement.className = 'kill-message';
            messageElement.textContent = item.message;
            messageElement.dataset.messageId = item.id;
            killFeedElement.appendChild(messageElement);
        });
    }
    
    fadeOutKillMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.classList.add('fade-out');
        }
    }
    
    addBullet(bullet) {
        this.bullets.push(bullet);
        
        // Add muzzle flash effect for local bullets
        if (bullet.ownerId === window.networkManager.playerId && this.myPlayer) {
            this.addMuzzleFlash(this.myPlayer.x, this.myPlayer.y, this.myPlayer.angle);
        }
    }
    
    addMuzzleFlash(x, y, angle) {
        this.muzzleFlashes.push({
            x: x + Math.cos(angle) * 25,
            y: y + Math.sin(angle) * 25,
            angle: angle,
            life: 100, // milliseconds
            startTime: Date.now()
        });
    }
    
    checkObstacleCollision(player) {
        const playerSize = player.size || 25;
        
        // Check map boundaries first
        if (player.x - playerSize < 0 || 
            player.x + playerSize > this.mapWidth ||
            player.y - playerSize < 0 || 
            player.y + playerSize > this.mapHeight) {
            return true;
        }
        
        // Check obstacle collision
        for (let obstacle of this.obstacles) {
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
    
    checkRectangleCollision(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 &&
               x1 + w1 > x2 &&
               y1 < y2 + h2 &&
               y1 + h1 > y2;
    }
    
    checkCircleRectangleCollision(circleX, circleY, radius, rectX, rectY, rectWidth, rectHeight) {
        // Find the closest point on the rectangle to the circle
        const closestX = Math.max(rectX, Math.min(circleX, rectX + rectWidth));
        const closestY = Math.max(rectY, Math.min(circleY, rectY + rectHeight));
        
        // Calculate distance between circle center and closest point
        const distanceX = circleX - closestX;
        const distanceY = circleY - closestY;
        const distanceSquared = distanceX * distanceX + distanceY * distanceY;
        
        return distanceSquared < (radius * radius);
    }
    
    checkPointInRectangle(pointX, pointY, rectX, rectY, rectWidth, rectHeight) {
        return pointX >= rectX && 
               pointX <= rectX + rectWidth && 
               pointY >= rectY && 
               pointY <= rectY + rectHeight;
    }
    
    checkCircleCollision(x1, y1, r1, x2, y2, r2) {
        const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        return distance < (r1 + r2);
    }
    
    render() {
        // Clear canvas
        this.ctx.fillStyle = '#2c5530';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw ground tiles
        this.drawGroundTiles();
        
        // Draw map grid
        this.drawGrid();
        
        // Draw obstacles
        this.drawObstacles();
        
        // Draw map bounds
        this.drawMapBounds();
        
        // Draw players
        if (this.myPlayer) {
            this.myPlayer.draw(this.ctx, this.camera);
        }
        
        // Draw network players
        this.networkPlayers.forEach(player => {
            player.draw(this.ctx, this.camera);
        });
        
        // Debug: log player count and sync status occasionally
        if (Date.now() % 5000 < 50) {
            const networkPlayerNames = Array.from(this.networkPlayers.values()).map(p => p.name);
            console.log(`Players in game - Me: ${this.myPlayer ? this.myPlayer.name : 'none'}, Others: ${this.networkPlayers.size} [${networkPlayerNames.join(', ')}]`);
            
            // Check for players with missing sync data
            this.networkPlayers.forEach((player, id) => {
                if (!player.networkInitialized) {
                    console.warn(`Player ${player.name} (${id}) not properly initialized`);
                }
            });
        }
        
        // Draw bullets
        this.drawBullets();
        
        // Draw muzzle flashes
        this.drawMuzzleFlashes();
        
        // Draw crosshair for main player
        if (this.myPlayer && this.myPlayer.health > 0) {
            this.drawCrosshair();
        }
    }
    
    drawGroundTiles() {
        this.mapTiles.forEach(tile => {
            const screenX = tile.x - this.camera.x;
            const screenY = tile.y - this.camera.y;
            
            // Only draw visible tiles
            if (screenX > -tile.size && screenX < this.canvas.width &&
                screenY > -tile.size && screenY < this.canvas.height) {
                
                if (tile.type === 'grass') {
                    this.ctx.fillStyle = '#4a7c59';
                } else {
                    this.ctx.fillStyle = '#8B4513';
                }
                
                this.ctx.fillRect(screenX, screenY, tile.size, tile.size);
                
                // Add texture pattern
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        if (Math.random() > 0.7) {
                            this.ctx.fillRect(
                                screenX + i * (tile.size / 3),
                                screenY + j * (tile.size / 3),
                                2, 2
                            );
                        }
                    }
                }
            }
        });
    }
    
    drawObstacles() {
        this.obstacles.forEach(obstacle => {
            const screenX = obstacle.x - this.camera.x;
            const screenY = obstacle.y - this.camera.y;
            
            // Only draw visible obstacles
            if (screenX > -obstacle.width && screenX < this.canvas.width &&
                screenY > -obstacle.height && screenY < this.canvas.height) {
                
                this.ctx.fillStyle = obstacle.color;
                this.ctx.fillRect(screenX, screenY, obstacle.width, obstacle.height);
                
                // Add 8-bit style details based on type
                switch (obstacle.type) {
                    case 'building':
                        this.draw8BitBuilding(screenX, screenY, obstacle.width, obstacle.height);
                        break;
                    case 'crate':
                        this.draw8BitCrate(screenX, screenY, obstacle.width, obstacle.height);
                        break;
                    case 'wall':
                        this.draw8BitWall(screenX, screenY, obstacle.width, obstacle.height);
                        break;
                    case 'tree':
                        this.draw8BitTree(screenX, screenY, obstacle.width, obstacle.height);
                        break;
                }
            }
        });
    }
    
    draw8BitBuilding(x, y, width, height) {
        // Windows
        const windowSize = 8;
        const windowSpacing = 12;
        
        for (let wx = x + 8; wx < x + width - windowSize; wx += windowSpacing) {
            for (let wy = y + 8; wy < y + height - windowSize; wy += windowSpacing) {
                this.ctx.fillStyle = '#FFD700';
                this.ctx.fillRect(wx, wy, windowSize, windowSize);
                this.ctx.fillStyle = '#000';
                this.ctx.fillRect(wx + 2, wy + 2, 4, 4);
            }
        }
        
        // Building outline
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
    }
    
    draw8BitCrate(x, y, width, height) {
        // Crate planks
        this.ctx.strokeStyle = '#654321';
        this.ctx.lineWidth = 2;
        
        // Vertical planks
        for (let i = 1; i < 3; i++) {
            const plankX = x + (width / 3) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(plankX, y);
            this.ctx.lineTo(plankX, y + height);
            this.ctx.stroke();
        }
        
        // Horizontal planks
        for (let i = 1; i < 3; i++) {
            const plankY = y + (height / 3) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(x, plankY);
            this.ctx.lineTo(x + width, plankY);
            this.ctx.stroke();
        }
        
        // Crate outline
        this.ctx.strokeStyle = '#000';
        this.ctx.strokeRect(x, y, width, height);
    }
    
    draw8BitWall(x, y, width, height) {
        // Brick pattern
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        
        const brickWidth = 16;
        const brickHeight = 8;
        
        for (let row = 0; row < height / brickHeight; row++) {
            for (let col = 0; col < width / brickWidth; col++) {
                const brickX = x + col * brickWidth + (row % 2) * (brickWidth / 2);
                const brickY = y + row * brickHeight;
                
                if (brickX < x + width) {
                    this.ctx.strokeRect(brickX, brickY, Math.min(brickWidth, x + width - brickX), brickHeight);
                }
            }
        }
    }
    
    draw8BitTree(x, y, width, height) {
        // Tree trunk
        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(x + width/3, y + height/2, width/3, height/2);
        
        // Tree foliage (circular)
        this.ctx.fillStyle = '#228B22';
        this.ctx.beginPath();
        this.ctx.arc(x + width/2, y + height/3, width/2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Tree outline
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.strokeRect(x + width/3, y + height/2, width/3, height/2);
    }
    
    drawGrid() {
        const gridSize = 50;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = -this.camera.x % gridSize; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = -this.camera.y % gridSize; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }
    
    drawMapBounds() {
        this.ctx.strokeStyle = '#e74c3c';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([10, 10]);
        
        const boundsX = -this.camera.x;
        const boundsY = -this.camera.y;
        const boundsWidth = this.mapWidth;
        const boundsHeight = this.mapHeight;
        
        this.ctx.strokeRect(boundsX, boundsY, boundsWidth, boundsHeight);
        this.ctx.setLineDash([]);
    }
    
    drawBullets() {
        this.bullets.forEach(bullet => {
            const screenX = bullet.x - this.camera.x;
            const screenY = bullet.y - this.camera.y;
            
            // Only draw visible bullets
            if (screenX > -10 && screenX < this.canvas.width + 10 &&
                screenY > -10 && screenY < this.canvas.height + 10) {
                
                // Draw bullet trail
                this.ctx.fillStyle = '#FF6600';
                this.ctx.fillRect(screenX - 6, screenY - 1, 4, 2);
                
                // Draw main bullet body
                this.ctx.fillStyle = '#FFD700';
                this.ctx.fillRect(screenX - 3, screenY - 1.5, 6, 3);
                
                // Bullet highlight
                this.ctx.fillStyle = '#FFFF99';
                this.ctx.fillRect(screenX - 2, screenY - 1, 2, 1);
                
                // Bullet outline
                this.ctx.strokeStyle = '#000';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(screenX - 3, screenY - 1.5, 6, 3);
            }
        });
    }
    
    drawMuzzleFlashes() {
        const now = Date.now();
        this.muzzleFlashes.forEach(flash => {
            const screenX = flash.x - this.camera.x;
            const screenY = flash.y - this.camera.y;
            
            // Calculate flash opacity based on remaining life
            const lifePercent = 1 - ((now - flash.startTime) / flash.life);
            const opacity = Math.max(0, lifePercent);
            
            if (opacity > 0) {
                this.ctx.save();
                this.ctx.translate(screenX, screenY);
                this.ctx.rotate(flash.angle);
                
                // Draw muzzle flash
                this.ctx.fillStyle = `rgba(255, 255, 0, ${opacity})`;
                this.ctx.fillRect(-8, -4, 16, 8);
                
                this.ctx.fillStyle = `rgba(255, 165, 0, ${opacity * 0.8})`;
                this.ctx.fillRect(-6, -3, 12, 6);
                
                this.ctx.fillStyle = `rgba(255, 69, 0, ${opacity * 0.6})`;
                this.ctx.fillRect(-4, -2, 8, 4);
                
                this.ctx.restore();
            }
        });
    }
    
    drawCrosshair() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const size = 15;
        
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        
        // Horizontal line
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - size, centerY);
        this.ctx.lineTo(centerX + size, centerY);
        this.ctx.stroke();
        
        // Vertical line
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY - size);
        this.ctx.lineTo(centerX, centerY + size);
        this.ctx.stroke();
    }
    
    endGame() {
        this.isRunning = false;
        
        const stats = {
            kills: this.myPlayer ? this.myPlayer.kills : 0,
            deaths: this.myPlayer ? this.myPlayer.deaths : 0,
            score: this.myPlayer ? this.myPlayer.score : 0
        };
        
        window.gameController.endGame(stats);
    }
    
    destroy() {
        this.isRunning = false;
        
        // Clean up leaderboard listeners
        this.removeExistingLeaderboardListeners();
        
        if (this.controls) {
            this.controls.destroy();
        }
        document.body.style.overflow = '';
    }
} 