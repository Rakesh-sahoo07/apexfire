// Random name generator with unique ID system
class NameGenerator {
    static adjectives = [
        'Shadow', 'Silent', 'Swift', 'Deadly', 'Elite', 'Ghost', 'Viper', 'Storm', 'Fire', 'Ice',
        'Dark', 'Bright', 'Steel', 'Iron', 'Gold', 'Silver', 'Crimson', 'Azure', 'Neon', 'Cyber',
        'Phantom', 'Mystic', 'Savage', 'Wild', 'Fierce', 'Bold', 'Quick', 'Sharp', 'Toxic', 'Rogue',
        'Alpha', 'Beta', 'Omega', 'Prime', 'Ultra', 'Mega', 'Super', 'Hyper', 'Turbo', 'Nitro',
        'Blazing', 'Frozen', 'Thunder', 'Lightning', 'Plasma', 'Laser', 'Sniper', 'Assault', 'Combat', 'Battle'
    ];

    static nouns = [
        'Wolf', 'Eagle', 'Tiger', 'Dragon', 'Phoenix', 'Falcon', 'Hawk', 'Lion', 'Panther', 'Cobra',
        'Shark', 'Bear', 'Fox', 'Raven', 'Lynx', 'Jaguar', 'Leopard', 'Cheetah', 'Rhino', 'Venom',
        'Hunter', 'Sniper', 'Soldier', 'Warrior', 'Fighter', 'Assassin', 'Ranger', 'Scout', 'Guard', 'Knight',
        'Blade', 'Bullet', 'Arrow', 'Spike', 'Claw', 'Fang', 'Strike', 'Force', 'Power', 'Rage',
        'Storm', 'Blaze', 'Frost', 'Bolt', 'Flash', 'Dash', 'Rush', 'Crush', 'Smash', 'Blast'
    ];

    static generate() {
        const adjective = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
        const noun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
        return `${adjective}${noun}`;
    }

    // Generate unique player ID (timestamp + random)
    static generateUniqueId() {
        const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
        const random = Math.floor(Math.random() * 999).toString().padStart(3, '0'); // 3-digit random number
        return `${timestamp}${random}`;
    }

    // Add unique ID to any name
    static makeUnique(baseName) {
        const uniqueId = this.generateUniqueId();
        // Remove any existing numbers from the end of the name
        const cleanName = baseName.replace(/\d+$/, '').trim();
        return `${cleanName}#${uniqueId}`;
    }

    // Generate complete unique name
    static generateUnique() {
        const baseName = this.generate();
        return this.makeUnique(baseName);
    }
}

// Main game controller
class GameController {
    constructor() {
        this.currentScreen = 'worldIdLogin';
        this.playerName = NameGenerator.generateUnique(); // Generate unique random name
        this.worldIdPlayerName = null; // Will be set by World ID auth
        this.gameInstance = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupNetworkListeners();
        // Don't show lobby initially - World ID auth will handle this
        this.updateStats();
        
        // Set the generated random name in the input field (show only base name)
        const baseName = this.playerName.split('#')[0];
        const playerNameInput = document.getElementById('playerName');
        if (playerNameInput) {
            playerNameInput.value = baseName;
        }
    }

    // Method to be called by World ID auth when user is authenticated
    setPlayerWorldId(worldId) {
        this.worldIdPlayerName = worldId;
        // Use World ID as the primary player identifier
        this.playerName = `WorldID_${worldId}`;
        console.log('Player World ID set:', this.worldIdPlayerName);
    }

    setupEventListeners() {
        // Play button
        const playButton = document.getElementById('playButton');
        if (playButton) {
            playButton.addEventListener('click', () => {
                // Check if user is authenticated with World ID
                if (!window.worldIdAuth || !window.worldIdAuth.isUserAuthenticated()) {
                    alert('Please verify with World ID first!');
                    return;
                }

                const inputName = document.getElementById('playerName').value.trim();
                if (inputName && this.worldIdPlayerName) {
                    // Combine custom name with World ID
                    this.playerName = `${inputName}_${this.worldIdPlayerName}`;
                } else if (this.worldIdPlayerName) {
                    // Use World ID as player name
                    this.playerName = `Player_${this.worldIdPlayerName}`;
                } else {
                    // Fallback (shouldn't happen if World ID is required)
                    this.playerName = NameGenerator.generateUnique();
                }
                this.startMatchmaking();
            });
        }

        // Play again button
        document.getElementById('playAgainButton').addEventListener('click', () => {
            this.startMatchmaking();
        });

        // Menu button
        document.getElementById('menuButton').addEventListener('click', () => {
            this.showScreen('lobby');
        });

        // Sound toggle button
        document.getElementById('soundToggle').addEventListener('click', () => {
            if (window.audioManager) {
                const isEnabled = window.audioManager.toggleSound();
                const button = document.getElementById('soundToggle');
                button.textContent = isEnabled ? '🔊' : '🔇';
                button.classList.toggle('muted', !isEnabled);
            }
        });

        // Generate name button
        document.getElementById('generateNameBtn').addEventListener('click', () => {
            const newName = NameGenerator.generateUnique();
            // Show only the base name in the input field (without the unique ID)
            const baseName = newName.split('#')[0];
            document.getElementById('playerName').value = baseName;
            this.playerName = newName; // Store the full unique name
        });

        // Update player name when user types (but don't generate unique ID until play)
        document.getElementById('playerName').addEventListener('input', (e) => {
            const inputValue = e.target.value.trim();
            if (inputValue) {
                // Store just the base name, unique ID will be added when playing
                this.playerName = inputValue;
            } else {
                // Generate new unique name if field is empty
                this.playerName = NameGenerator.generateUnique();
            }
        });

        // Enhanced mobile zoom prevention
        this.setupMobileZoomPrevention();
    }

    setupMobileZoomPrevention() {
        // Prevent multi-touch zoom
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });

        // Prevent double-tap zoom
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });

        // Prevent gesturestart events (iOS)
        document.addEventListener('gesturestart', (e) => {
            e.preventDefault();
        }, { passive: false });

        // Prevent wheel zoom
        document.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        }, { passive: false });

        // Prevent keyboard zoom shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0')) {
                e.preventDefault();
            }
        });
    }

    showScreen(screenName) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show target screen
        document.getElementById(screenName).classList.add('active');
        this.currentScreen = screenName;
    }

    startMatchmaking() {
        this.showScreen('loading');
        document.getElementById('loadingPlayers').textContent = '1/6';
        
        // Join matchmaking through network manager
        window.networkManager.joinMatchmaking(this.playerName);
    }

    startGame(gameData) {
        this.showScreen('game');
        
        // Initialize game
        if (this.gameInstance) {
            this.gameInstance.destroy();
        }
        
        this.gameInstance = new GameEngine(this.playerName, gameData);
        this.gameInstance.start();
    }

    endGame(stats) {
        this.showScreen('gameOver');
        
        // Update final stats
        document.getElementById('finalKills').textContent = stats.kills;
        document.getElementById('finalDeaths').textContent = stats.deaths;
        document.getElementById('finalScore').textContent = stats.score;
        
        if (this.gameInstance) {
            this.gameInstance.destroy();
            this.gameInstance = null;
        }
    }

    setupNetworkListeners() {
        // Handle room joined
        window.networkManager.on('roomJoined', (data) => {
            document.getElementById('loadingPlayers').textContent = `${data.playersCount}/${data.maxPlayers}`;
            // Create a simple lobby to show other waiting players
            this.initializeLobbyPlayers(data.players);
        });

        // Handle player count updates
        window.networkManager.on('playersUpdate', (data) => {
            document.getElementById('loadingPlayers').textContent = `${data.playersCount}/6`;
            // Also emit to game engine if it exists
            if (this.gameInstance) {
                this.gameInstance.handlePlayersUpdate(data);
            }
        });

        // Handle new player joining
        window.networkManager.on('playerJoined', (data) => {
            if (this.gameInstance) {
                this.gameInstance.handlePlayerJoined(data);
            }
        });

        // Handle game start
        window.networkManager.on('gameStart', (data) => {
            this.startGame(data);
        });

        // Handle game end
        window.networkManager.on('gameEnd', (data) => {
            // Calculate player's stats from the game instance
            const playerStats = this.gameInstance ? {
                kills: this.gameInstance.myPlayer.kills,
                deaths: this.gameInstance.myPlayer.deaths,
                score: this.gameInstance.myPlayer.score
            } : { kills: 0, deaths: 0, score: 0 };
            
            this.endGame(playerStats);
        });

        // Handle matchmaking errors
        window.networkManager.on('matchmakingError', (error) => {
            console.error('Matchmaking failed:', error);
            this.showScreen('lobby');
            alert('Failed to join matchmaking. Please try again.');
        });

        // Handle network disconnection
        window.networkManager.on('networkDisconnected', () => {
            if (this.currentScreen === 'game') {
                this.showScreen('lobby');
                alert('Connection lost. Returning to lobby.');
            }
        });
    }

    initializeLobbyPlayers(players) {
        console.log('Players in lobby:', players);
        if (players && players.length > 1) {
            // Update UI to show that other players are in the lobby
            const waitingInfo = document.querySelector('.loading-container p');
            if (waitingInfo) {
                waitingInfo.innerHTML = `Players: <span id="loadingPlayers">${players.length}/6</span><br><small>Waiting for ${players.map(p => p.name).join(', ')}</small>`;
            }
        }
    }

    updateStats() {
        // Simulate online stats
        const playersOnline = 98 + Math.floor(Math.random() * 60);
        const roomsAvailable = 5 + Math.floor(Math.random() * 10);
        
        document.getElementById('playersOnline').textContent = playersOnline;
        document.getElementById('roomsAvailable').textContent = roomsAvailable;
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.gameController = new GameController();
    
    // Update stats periodically
    setInterval(() => {
        if (window.gameController.currentScreen === 'lobby') {
            window.gameController.updateStats();
        }
    }, 5000);
}); 