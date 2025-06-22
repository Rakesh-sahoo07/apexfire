// Mobile controls for touch devices
class MobileControls {
    constructor(gameEngine) {
        this.gameEngine = gameEngine;
        this.moveJoystick = null;
        this.lookJoystick = null;
        this.shootButton = null;
        this.reloadButton = null;
        
        this.moveInput = { x: 0, y: 0 };
        this.lookInput = { x: 0, y: 0 };
        
        // Auto-fire feature
        this.isAutoFiring = false;
        this.autoFireThreshold = 0.85; // 85% of maximum joystick distance
        this.lastAutoFireTime = 0;
        this.autoFireInterval = 100; // milliseconds between auto-fire shots
        
        this.activeTouches = new Map();
        this.init();
    }
    
    init() {
        this.setupJoysticks();
        this.setupButtons();
        this.setupTouchEvents();
    }
    
    setupJoysticks() {
        this.moveJoystick = new VirtualJoystick('moveJoystick', (x, y) => {
            this.moveInput.x = x;
            this.moveInput.y = y;
        });
        
        this.lookJoystick = new VirtualJoystick('lookJoystick', (x, y) => {
            this.lookInput.x = x;
            this.lookInput.y = y;
            
            // Update player angle based on look input
            if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) {
                const angle = Math.atan2(y, x);
                if (this.gameEngine.myPlayer) {
                    this.gameEngine.myPlayer.setAngle(angle);
                }
            }
            
            // Check for auto-fire trigger
            this.checkAutoFire(x, y);
        });
    }
    
    setupButtons() {
        this.shootButton = document.getElementById('shootBtn');
        this.reloadButton = document.getElementById('reloadBtn');
        
        // Shoot button
        this.shootButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleShoot();
        });
        
        this.shootButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.handleShoot();
        });
        
        // Reload button
        this.reloadButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleReload();
        });
        
        this.reloadButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.handleReload();
        });
    }
    
    setupTouchEvents() {
        const canvas = document.getElementById('gameCanvas');
        
        // Prevent default touch behaviors
        canvas.addEventListener('touchstart', (e) => e.preventDefault());
        canvas.addEventListener('touchmove', (e) => e.preventDefault());
        canvas.addEventListener('touchend', (e) => e.preventDefault());
        
        // Handle canvas touches for shooting
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;
                
                // Check if touch is not on controls
                if (!this.isTouchOnControls(x, y)) {
                    this.handleShoot();
                }
            }
        });
    }
    
    isTouchOnControls(x, y) {
        const screenHeight = window.innerHeight;
        const screenWidth = window.innerWidth;
        
        // Bottom area where controls are located
        return y > screenHeight - 200;
    }
    
    handleShoot() {
        if (this.gameEngine && this.gameEngine.myPlayer && this.gameEngine.myPlayer.canShoot()) {
            // Create bullet immediately for visual feedback
            const bullet = this.gameEngine.myPlayer.shoot();
            if (bullet) {
                // Add bullet to local game
                bullet.ownerId = window.networkManager.playerId;
                bullet.id = Date.now() + Math.random();
                this.gameEngine.addBullet(bullet);
                
                // Send shoot event to server
                window.networkManager.sendPlayerShoot();
            }
        }
    }
    
    handleReload() {
        if (this.gameEngine && this.gameEngine.myPlayer) {
            window.networkManager.sendPlayerReload();
        }
    }
    
    checkAutoFire(x, y) {
        // Calculate distance from center (0,0 to x,y)
        const distance = Math.sqrt(x * x + y * y);
        
        // Check if joystick is extended beyond threshold
        if (distance >= this.autoFireThreshold) {
            if (!this.isAutoFiring) {
                this.isAutoFiring = true;
                this.lastAutoFireTime = Date.now();
                console.log('Auto-fire activated!');
                
                // Add visual feedback
                this.lookJoystick.container.classList.add('auto-fire');
                
                // Start immediate first shot
                this.handleAutoFire();
            }
        } else {
            if (this.isAutoFiring) {
                this.isAutoFiring = false;
                console.log('Auto-fire deactivated');
                
                // Remove visual feedback
                this.lookJoystick.container.classList.remove('auto-fire');
            }
        }
    }
    
    handleAutoFire() {
        if (!this.isAutoFiring) return;
        
        const now = Date.now();
        if (now - this.lastAutoFireTime >= this.autoFireInterval) {
            this.handleShoot();
            this.lastAutoFireTime = now;
        }
    }
    
    update() {
        // Call this method in the game loop to handle continuous auto-fire
        if (this.isAutoFiring) {
            this.handleAutoFire();
        }
    }
    
    getMoveInput() {
        return this.moveInput;
    }
    
    getLookInput() {
        return this.lookInput;
    }
    
    destroy() {
        // Stop auto-fire and remove visual feedback
        this.isAutoFiring = false;
        if (this.lookJoystick) {
            this.lookJoystick.container.classList.remove('auto-fire');
            this.lookJoystick.destroy();
        }
        if (this.moveJoystick) this.moveJoystick.destroy();
    }
}

// Virtual joystick class
class VirtualJoystick {
    constructor(containerId, callback) {
        this.container = document.getElementById(containerId);
        this.knob = this.container.querySelector('.joystick-knob');
        this.callback = callback;
        
        this.isActive = false;
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.currentY = 0;
        
        this.maxDistance = 40; // Maximum distance from center
        
        this.init();
    }
    
    init() {
        // Touch events
        this.container.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.start(touch.clientX, touch.clientY);
        });
        
        document.addEventListener('touchmove', (e) => {
            if (this.isActive) {
                e.preventDefault();
                const touch = e.touches[0];
                this.move(touch.clientX, touch.clientY);
            }
        });
        
        document.addEventListener('touchend', (e) => {
            if (this.isActive) {
                e.preventDefault();
                this.end();
            }
        });
        
        // Mouse events for desktop testing
        this.container.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.start(e.clientX, e.clientY);
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isActive) {
                e.preventDefault();
                this.move(e.clientX, e.clientY);
            }
        });
        
        document.addEventListener('mouseup', (e) => {
            if (this.isActive) {
                e.preventDefault();
                this.end();
            }
        });
    }
    
    start(clientX, clientY) {
        const rect = this.container.getBoundingClientRect();
        this.startX = rect.left + rect.width / 2;
        this.startY = rect.top + rect.height / 2;
        this.isActive = true;
        
        this.move(clientX, clientY);
    }
    
    move(clientX, clientY) {
        if (!this.isActive) return;
        
        const deltaX = clientX - this.startX;
        const deltaY = clientY - this.startY;
        
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance <= this.maxDistance) {
            this.currentX = deltaX;
            this.currentY = deltaY;
        } else {
            const angle = Math.atan2(deltaY, deltaX);
            this.currentX = Math.cos(angle) * this.maxDistance;
            this.currentY = Math.sin(angle) * this.maxDistance;
        }
        
        // Update knob position
        this.knob.style.transform = `translate(-50%, -50%) translate(${this.currentX}px, ${this.currentY}px)`;
        
        // Normalize values (-1 to 1)
        const normalizedX = this.currentX / this.maxDistance;
        const normalizedY = this.currentY / this.maxDistance;
        
        // Call callback with normalized values
        this.callback(normalizedX, normalizedY);
    }
    
    end() {
        this.isActive = false;
        this.currentX = 0;
        this.currentY = 0;
        
        // Reset knob position
        this.knob.style.transform = 'translate(-50%, -50%)';
        
        // Call callback with zero values
        this.callback(0, 0);
    }
    
    destroy() {
        // Remove event listeners if needed
        this.isActive = false;
    }
} 