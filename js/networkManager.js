// Network Manager for Socket.IO communication
class NetworkManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.roomId = null;
        this.playerId = null;
        this.callbacks = new Map();
        
        this.connect();
    }
    
    connect() {
        // Determine server URL based on environment
        let serverUrl;
        
        if (window.location.protocol === 'file:' || 
            window.location.port === '5500' || 
            window.location.port === '5501' || 
            window.location.port === '8080' ||
            window.location.hostname === '127.0.0.1') {
            // Development with Live Server or local file
            serverUrl = 'http://localhost:3000';
        } else if (window.location.port === '3000') {
            // Served directly from backend
            serverUrl = window.location.origin;
        } else {
            // Production or other environments
            serverUrl = window.location.origin.replace(/:\d+/, ':3000');
        }
            
        console.log('🔌 Connecting to server:', serverUrl);
        console.log('🌐 Current location:', window.location.href);
        this.socket = io(serverUrl);
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('🔗 Connected to server');
            this.isConnected = true;
            this.playerId = this.socket.id;
            this.emit('networkConnected');
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            this.isConnected = false;
            this.emit('networkDisconnected');
        });
        
        this.socket.on('roomJoined', (data) => {
            console.log('🏠 Joined room:', data.roomId);
            this.roomId = data.roomId;
            this.emit('roomJoined', data);
        });
        
        this.socket.on('playersUpdate', (data) => {
            this.emit('playersUpdate', data);
        });
        
        this.socket.on('playerJoined', (data) => {
            this.emit('playerJoined', data);
        });
        
        this.socket.on('gameStart', (data) => {
            console.log('🎮 Game starting!');
            this.emit('gameStart', data);
        });
        
        this.socket.on('gameEnd', (data) => {
            console.log('🏁 Game ended');
            this.emit('gameEnd', data);
        });
        
        this.socket.on('playerMoved', (data) => {
            this.emit('playerMoved', data);
        });
        
        this.socket.on('bulletFired', (data) => {
            this.emit('bulletFired', data);
        });
        
        this.socket.on('playerAmmoUpdate', (data) => {
            this.emit('playerAmmoUpdate', data);
        });
        
        this.socket.on('playerHealthUpdate', (data) => {
            this.emit('playerHealthUpdate', data);
        });
        
        this.socket.on('playerKilled', (data) => {
            this.emit('playerKilled', data);
        });
        
        this.socket.on('playerRespawn', (data) => {
            this.emit('playerRespawn', data);
        });
        
        this.socket.on('playerLeft', (data) => {
            this.emit('playerLeft', data);
        });
        
        this.socket.on('positionCorrection', (data) => {
            this.emit('positionCorrection', data);
        });
        
        this.socket.on('playersPositionSync', (data) => {
            this.emit('playersPositionSync', data);
        });
        
        this.socket.on('matchmakingError', (error) => {
            console.error('Matchmaking error:', error);
            this.emit('matchmakingError', error);
        });
    }
    
    // Event emitter system
    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event).push(callback);
    }
    
    emit(event, data) {
        if (this.callbacks.has(event)) {
            this.callbacks.get(event).forEach(callback => callback(data));
        }
    }
    
    off(event, callback) {
        if (this.callbacks.has(event)) {
            const callbacks = this.callbacks.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    // Game actions
    joinMatchmaking(playerName) {
        if (this.isConnected) {
            console.log('🔍 Joining matchmaking...');
            this.socket.emit('joinMatchmaking', { name: playerName });
        } else {
            console.error('Not connected to server');
        }
    }
    
    sendPlayerMove(x, y, angle, vx, vy) {
        if (this.isConnected && this.roomId) {
            this.socket.emit('playerMove', { x, y, angle, vx, vy });
        }
    }
    
    sendPlayerShoot() {
        if (this.isConnected && this.roomId) {
            this.socket.emit('playerShoot');
        }
    }
    
    sendPlayerReload() {
        if (this.isConnected && this.roomId) {
            this.socket.emit('playerReload');
        }
    }
    
    sendBulletHit(shooterId, targetId, damage) {
        if (this.isConnected && this.roomId) {
            this.socket.emit('bulletHit', {
                shooterId,
                targetId,
                damage
            });
        }
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Create global network manager instance
window.networkManager = new NetworkManager(); 