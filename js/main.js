// Random name generator
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
        const number = Math.floor(Math.random() * 999) + 1;
        return `${adjective}${noun}${number}`;
    }
}

// Main game controller
class GameController {
    constructor() {
        this.currentScreen = 'lobby';
        this.playerName = NameGenerator.generate(); // Generate random name
        this.gameInstance = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupNetworkListeners();
        this.showScreen('lobby');
        this.updateStats();
        
        // Set the generated random name in the input field
        document.getElementById('playerName').value = this.playerName;
    }

    setupEventListeners() {
        // Play button
        document.getElementById('playButton').addEventListener('click', () => {
            this.playerName = document.getElementById('playerName').value || NameGenerator.generate();
            this.startMatchmaking();
        });

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
            const newName = NameGenerator.generate();
            document.getElementById('playerName').value = newName;
            this.playerName = newName;
        });

        // Update player name when user types
        document.getElementById('playerName').addEventListener('input', (e) => {
            this.playerName = e.target.value || NameGenerator.generate();
        });

        // Prevent zoom on double tap
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        });

        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
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