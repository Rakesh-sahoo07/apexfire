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
        
        // Input smoothing to reduce jitter
        this.smoothedMoveInput = { x: 0, y: 0 };
        this.inputSmoothingFactor = 0.15;
        
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
            // Apply deadzone to raw input
            const deadzone = 0.08;
            this.moveInput.x = Math.abs(x) < deadzone ? 0 : x;
            this.moveInput.y = Math.abs(y) < deadzone ? 0 : y;
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
                
                // Add visual feedback
                this.lookJoystick.container.classList.add('auto-fire');
                
                // Start immediate first shot
                this.handleAutoFire();
            }
        } else {
            if (this.isAutoFiring) {
                this.isAutoFiring = false;
                
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
        // Smooth the move input to reduce jitter
        this.smoothedMoveInput.x += (this.moveInput.x - this.smoothedMoveInput.x) * this.inputSmoothingFactor;
        this.smoothedMoveInput.y += (this.moveInput.y - this.smoothedMoveInput.y) * this.inputSmoothingFactor;
        
        // Stop micro-movements
        if (Math.abs(this.smoothedMoveInput.x) < 0.02) this.smoothedMoveInput.x = 0;
        if (Math.abs(this.smoothedMoveInput.y) < 0.02) this.smoothedMoveInput.y = 0;
        
        // Call this method in the game loop to handle continuous auto-fire
        if (this.isAutoFiring) {
            this.handleAutoFire();
        }
    }
    
    getMoveInput() {
        return this.smoothedMoveInput; // Return smoothed input instead of raw
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

// Tutorial System Class
class TutorialSystem {
    constructor(gameEngine) {
        console.log('TutorialSystem constructor called');
        this.gameEngine = gameEngine; // Can be null during loading screen
        this.currentStep = 1;
        this.totalSteps = 5;
        this.isActive = false;
        
        this.tutorialOverlay = document.getElementById('tutorialOverlay');
        this.tutorialContent = document.getElementById('tutorialContent');
        
        console.log('Tutorial elements found:', {
            overlay: !!this.tutorialOverlay,
            content: !!this.tutorialContent
        });
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Navigation buttons - use event delegation to avoid multiple listeners
        if (!TutorialSystem.eventListenerAdded) {
            document.addEventListener('click', (e) => {
                if (e.target.id === 'tutorialNext') {
                    // Find the active tutorial instance
                    const activeTutorial = this.getActiveTutorialInstance();
                    if (activeTutorial) activeTutorial.nextStep();
                } else if (e.target.id === 'tutorialPrev') {
                    const activeTutorial = this.getActiveTutorialInstance();
                    if (activeTutorial) activeTutorial.previousStep();
                } else if (e.target.id === 'tutorialSkip') {
                    const activeTutorial = this.getActiveTutorialInstance();
                    if (activeTutorial) activeTutorial.skipTutorial();
                } else if (e.target.id === 'tutorialStart') {
                    const activeTutorial = this.getActiveTutorialInstance();
                    if (activeTutorial) activeTutorial.completeTutorial();
                }
            });
            TutorialSystem.eventListenerAdded = true;
        }
        
        // Prevent clicks outside tutorial from closing it
        if (this.tutorialOverlay && !this.tutorialOverlay.hasClickListener) {
            this.tutorialOverlay.addEventListener('click', (e) => {
                if (e.target === this.tutorialOverlay) {
                    // Don't close tutorial by clicking outside
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
            this.tutorialOverlay.hasClickListener = true;
        }
    }
    
    getActiveTutorialInstance() {
        // Return the currently active tutorial instance
        if (this.isActive) return this;
        if (window.loadingTutorialSystem && window.loadingTutorialSystem.isActive) return window.loadingTutorialSystem;
        if (window.helpTutorialSystem && window.helpTutorialSystem.isActive) return window.helpTutorialSystem;
        return null;
    }
    
    showTutorial() {
        console.log('showTutorial called');
        // Close any other active tutorials first
        this.closeOtherTutorials();
        
        this.isActive = true;
        this.currentStep = 1;
        
        console.log('tutorialOverlay exists:', !!this.tutorialOverlay);
        
        if (this.tutorialOverlay) {
            console.log('Adding active class to tutorial overlay');
            this.tutorialOverlay.classList.add('active');
        } else {
            console.error('Tutorial overlay not found!');
        }
        
        this.updateStepDisplay();
        
        // Play tutorial start sound
        if (window.audioManager) {
            window.audioManager.playMenuSound();
        }
        
        console.log('Tutorial should now be visible, isActive:', this.isActive);
    }
    
    closeOtherTutorials() {
        // Close any other active tutorial instances
        if (window.loadingTutorialSystem && window.loadingTutorialSystem !== this && window.loadingTutorialSystem.isActive) {
            window.loadingTutorialSystem.hideTutorial();
        }
        if (window.helpTutorialSystem && window.helpTutorialSystem !== this && window.helpTutorialSystem.isActive) {
            window.helpTutorialSystem.hideTutorial();
        }
    }
    
    hideTutorial() {
        this.isActive = false;
        if (this.tutorialOverlay) {
            this.tutorialOverlay.classList.remove('active');
        }
    }
    
    nextStep() {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateStepDisplay();
            this.playStepSound();
        }
    }
    
    previousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateStepDisplay();
            this.playStepSound();
        }
    }
    
    updateStepDisplay() {
        // Hide all steps
        const allSteps = this.tutorialContent.querySelectorAll('.tutorial-step');
        allSteps.forEach(step => step.classList.remove('active'));
        
        // Show current step
        const currentStepElement = this.tutorialContent.querySelector(`[data-step="${this.currentStep}"]`);
        if (currentStepElement) {
            currentStepElement.classList.add('active');
        }
        
        // Update progress indicators
        const currentStepSpans = this.tutorialContent.querySelectorAll('.current-step');
        currentStepSpans.forEach(span => {
            span.textContent = this.currentStep;
        });
        
        // Update navigation buttons
        this.updateNavigationButtons();
    }
    
    updateNavigationButtons() {
        const prevButtons = document.querySelectorAll('#tutorialPrev');
        const nextButtons = document.querySelectorAll('#tutorialNext');
        
        prevButtons.forEach(btn => {
            btn.style.display = this.currentStep === 1 ? 'none' : 'inline-block';
        });
        
        nextButtons.forEach(btn => {
            if (this.currentStep === this.totalSteps) {
                btn.style.display = 'none';
            } else {
                btn.style.display = 'inline-block';
            }
        });
    }
    
    skipTutorial() {
        this.completeTutorial();
    }
    
    completeTutorial() {
        // Mark tutorial as completed
        localStorage.setItem('apexfire_tutorial_completed', 'true');
        localStorage.setItem('apexfire_tutorial_completed_date', Date.now());
        
        this.hideTutorial();
        
        // Play completion sound
        if (window.audioManager) {
            window.audioManager.playMenuSound();
        }
        
        // Show different messages based on context
        if (this.gameEngine) {
            // In-game tutorial completion
            this.showQuickTips();
        } else {
            // Loading screen tutorial completion
            this.showLoadingTips();
        }
    }
    
    showQuickTips() {
        // Create a quick tips overlay that appears for 3 seconds
        const quickTips = document.createElement('div');
        quickTips.className = 'quick-tips-overlay';
        quickTips.innerHTML = `
            <div class="quick-tips-content">
                <h3>🎯 Quick Reminders</h3>
                <div class="tips-list">
                    <div class="tip">📱 Left joystick = Move</div>
                    <div class="tip">🎯 Right joystick = Aim & Auto-fire</div>
                    <div class="tip">🔥 Push right joystick to edge for auto-fire</div>
                    <div class="tip">🏆 Good luck, soldier!</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(quickTips);
        
        // Add CSS for quick tips
        const style = document.createElement('style');
        style.textContent = `
            .quick-tips-overlay {
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #2c5530 0%, #1a332e 100%);
                border: 2px solid #4ecdc4;
                border-radius: 15px;
                padding: 20px;
                z-index: 1001;
                min-width: 250px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                animation: slideInRight 0.5s ease, fadeOutRight 0.5s ease 4s forwards;
            }
            
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            @keyframes fadeOutRight {
                to { transform: translateX(100%); opacity: 0; }
            }
            
            .quick-tips-content h3 {
                color: #4ecdc4;
                font-size: 1.1rem;
                margin-bottom: 15px;
                text-align: center;
            }
            
            .tips-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .tip {
                color: white;
                font-size: 0.9rem;
                background: rgba(255, 255, 255, 0.1);
                padding: 8px 12px;
                border-radius: 8px;
            }
            
            @media (max-width: 768px) {
                .quick-tips-overlay {
                    top: 10px;
                    right: 10px;
                    left: 10px;
                    min-width: auto;
                }
            }
        `;
        document.head.appendChild(style);
        
        // Remove after 5 seconds
        setTimeout(() => {
            if (quickTips.parentNode) {
                quickTips.parentNode.removeChild(quickTips);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 5000);
    }
    
    showLoadingTips() {
        // Create a loading-specific tips overlay
        const loadingTips = document.createElement('div');
        loadingTips.className = 'loading-tips-overlay';
        loadingTips.innerHTML = `
            <div class="loading-tips-content">
                <h3>🎯 Ready to Play!</h3>
                <div class="tips-list">
                    <div class="tip">✅ You've learned the controls!</div>
                    <div class="tip">⏳ Waiting for other players...</div>
                    <div class="tip">🎮 Game will start automatically</div>
                    <div class="tip">❓ Use help button if you need a reminder</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(loadingTips);
        
        // Add CSS for loading tips
        const style = document.createElement('style');
        style.textContent = `
            .loading-tips-overlay {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #2c5530 0%, #1a332e 100%);
                border: 2px solid #4ecdc4;
                border-radius: 15px;
                padding: 20px;
                z-index: 999;
                min-width: 280px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                animation: scaleIn 0.5s ease, fadeOutScale 0.5s ease 3s forwards;
            }
            
            @keyframes scaleIn {
                from { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
                to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
            
            @keyframes fadeOutScale {
                to { transform: translate(-50%, -50%) scale(0.9); opacity: 0; }
            }
            
            .loading-tips-content h3 {
                color: #4ecdc4;
                font-size: 1.1rem;
                margin-bottom: 15px;
                text-align: center;
            }
            
            .loading-tips-content .tips-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .loading-tips-content .tip {
                color: white;
                font-size: 0.9rem;
                background: rgba(255, 255, 255, 0.1);
                padding: 8px 12px;
                border-radius: 8px;
                text-align: center;
            }
            
            @media (max-width: 768px) {
                .loading-tips-overlay {
                    min-width: 250px;
                    padding: 15px;
                }
                
                .loading-tips-content .tip {
                    font-size: 0.8rem;
                    padding: 6px 10px;
                }
            }
        `;
        document.head.appendChild(style);
        
        // Remove after 4 seconds
        setTimeout(() => {
            if (loadingTips.parentNode) {
                loadingTips.parentNode.removeChild(loadingTips);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 4000);
    }
    
    playStepSound() {
        if (window.audioManager) {
            // Play a subtle click sound
            window.audioManager.playMenuSound(0.3);
        }
    }
    
    // Method to reset tutorial (for testing or settings)
    resetTutorial() {
        localStorage.removeItem('apexfire_tutorial_completed');
        localStorage.removeItem('apexfire_tutorial_completed_date');
    }
    
    // Method to force show tutorial
    forceShowTutorial() {
        this.showTutorial();
    }
    
    // Method to force close tutorial (used when game starts)
    forceCloseTutorial() {
        if (this.isActive) {
            this.hideTutorial();
            
            // Show a brief message that game is starting (only for loading screen tutorial)
            if (!this.gameEngine) {
                this.showGameStartingMessage();
            }
        }
    }
    
    showGameStartingMessage() {
        const startMessage = document.createElement('div');
        startMessage.className = 'game-starting-message';
        startMessage.innerHTML = `
            <div class="start-message-content">
                <h3>🚀 Game Starting!</h3>
                <p>Get ready to battle!</p>
            </div>
        `;
        
        document.body.appendChild(startMessage);
        
        // Add CSS for start message
        const style = document.createElement('style');
        style.textContent = `
            .game-starting-message {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #ff4444, #ff6666);
                color: white;
                border-radius: 10px;
                padding: 15px 25px;
                z-index: 1002;
                font-weight: bold;
                text-align: center;
                box-shadow: 0 5px 20px rgba(255, 68, 68, 0.5);
                animation: slideDown 0.5s ease, slideUp 0.5s ease 1.5s forwards;
            }
            
            @keyframes slideDown {
                from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
            
            @keyframes slideUp {
                to { transform: translateX(-50%) translateY(-100%); opacity: 0; }
            }
            
            .start-message-content h3 {
                margin: 0 0 5px 0;
                font-size: 1.1rem;
            }
            
            .start-message-content p {
                margin: 0;
                font-size: 0.9rem;
                opacity: 0.9;
            }
        `;
        document.head.appendChild(style);
        
        // Remove after 2 seconds
        setTimeout(() => {
            if (startMessage.parentNode) {
                startMessage.parentNode.removeChild(startMessage);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 2000);
    }
    
    // Check if user might need tutorial reminder (played many games without tutorial)
    shouldShowTutorialReminder() {
        const completedDate = localStorage.getItem('apexfire_tutorial_completed_date');
        const gamesPlayed = parseInt(localStorage.getItem('apexfire_games_played') || '0');
        
        if (!completedDate && gamesPlayed > 3) {
            return true; // User has played multiple games without seeing tutorial
        }
        
        return false;
    }
}

// Helper function to add tutorial reset option to settings (if needed)
window.resetTutorial = function() {
    if (window.tutorialSystem) {
        window.tutorialSystem.resetTutorial();
    }
};

// Store tutorial system globally for debugging
window.TutorialSystem = TutorialSystem; 