// World ID Authentication Manager for Mini Apps
class WorldIdAuth {
    constructor() {
        this.isAuthenticated = false;
        this.worldIdData = null;
        this.playerWorldId = null;
        
        // Configuration - Replace with your actual World ID app details
        this.config = {
            app_id: 'app_2801b290146f908019d18744581aa6e2', // Replace with your actual World ID app ID from Developer Portal
            action: 'login', // Action identifier - must match action created in Developer Portal
            verification_level: 'Device' // 'Device' or 'Orb' - note the capitalization
        };
        
        this.init();
    }

    init() {
        // Check if user is already authenticated
        const storedAuth = localStorage.getItem('worldid_auth');
        if (storedAuth) {
            try {
                const authData = JSON.parse(storedAuth);
                if (this.isValidAuth(authData)) {
                    this.isAuthenticated = true;
                    this.worldIdData = authData;
                    this.playerWorldId = this.extractPlayerWorldId(authData);
                    this.showLobby();
                    return;
                }
            } catch (e) {
                console.log('Invalid stored auth data');
                localStorage.removeItem('worldid_auth');
            }
        }

        this.setupEventListeners();
        this.initializeMiniKit();
    }

    setupEventListeners() {
        // World ID verify button
        const verifyBtn = document.getElementById('worldIdVerifyBtn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', () => {
                this.openWorldIdVerification();
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }
    }

    initializeMiniKit() {
        try {
            // Check if MiniKit is available (running in World App)
            if (typeof window.MiniKit === 'undefined') {
                console.error('MiniKit not available - not running in World App');
                this.showError('This app must be opened in World App to verify your World ID.');
                return;
            }

            console.log('MiniKit object found:', window.MiniKit);
            console.log('MiniKit methods available:', Object.keys(window.MiniKit));
            
            // Initialize MiniKit (it might already be installed)
            if (typeof window.MiniKit.install === 'function') {
                window.MiniKit.install();
                console.log('MiniKit install() called successfully');
            } else {
                console.log('MiniKit install() method not found - may already be installed');
            }
            
            // Check if MiniKit is properly installed
            if (typeof window.MiniKit.isInstalled === 'function') {
                const isInstalled = window.MiniKit.isInstalled();
                console.log('MiniKit installation status:', isInstalled);
            }
            
            // Update UI to show ready state
            this.updateVerificationStatus('Ready to verify your World ID', '🔐');
        } catch (error) {
            console.error('Failed to initialize MiniKit:', error);
            this.showError('Failed to initialize World ID. Please refresh the page.');
        }
    }

    async openWorldIdVerification() {
        try {
            // Check if we're in World App environment
            const isInWorldApp = this.isInWorldApp();
            console.log('World App environment check:', isInWorldApp);
            
            if (!isInWorldApp) {
                this.showError('This app must be opened in World App to verify your World ID.');
                return;
            }

            this.updateVerificationStatus('Connecting to World ID...', '🔄');

            // Prepare verification payload for MiniKit
            const verifyPayload = {
                action: this.config.action,
                verification_level: this.config.verification_level,
                signal: '' // Optional additional data
            };

            console.log('Starting World ID verification with payload:', verifyPayload);

            // Use MiniKit's verify command
            const response = await window.MiniKit.commandsAsync.verify(verifyPayload);
            const { finalPayload } = response;
            
            if (finalPayload.status === 'error') {
                console.error('Verification error:', finalPayload);
                this.handleError(finalPayload);
                return;
            }

            if (finalPayload.status === 'success') {
                console.log('Verification successful:', finalPayload);
                this.handleSuccess(finalPayload);
            }

        } catch (error) {
            console.error('Failed to open World ID verification:', error);
            
            // More specific error handling
            if (error.message && error.message.includes('MiniKit')) {
                this.showError('MiniKit error: Please ensure you are using the latest version of World App.');
            } else if (error.message && error.message.includes('verify')) {
                this.showError('Verification failed: Please check your app configuration.');
            } else {
                this.showError(`Failed to open World ID verification: ${error.message || 'Unknown error'}`);
            }
        }
    }

    handleSuccess(result) {
        console.log('World ID verification successful:', result);
        
        // Store authentication data
        this.worldIdData = {
            ...result,
            timestamp: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        };
        
        // Extract player World ID for display
        this.playerWorldId = this.extractPlayerWorldId(result);
        
        // Store in localStorage for persistence
        localStorage.setItem('worldid_auth', JSON.stringify(this.worldIdData));
        
        this.isAuthenticated = true;
        this.updateVerificationStatus('Verification successful!', '✅');
        
        // Transition to lobby after a brief delay
        setTimeout(() => {
            this.showLobby();
        }, 1500);
    }

    handleError(error) {
        console.error('World ID verification error:', error);
        let errorMessage = 'Verification failed. Please try again.';
        
        if (error.error_code) {
            switch (error.error_code) {
                case 'already_signed':
                    errorMessage = 'You have already verified for this action.';
                    break;
                case 'invalid_proof':
                    errorMessage = 'Invalid proof. Please try again.';
                    break;
                case 'verification_rejected':
                    errorMessage = 'Verification was rejected or cancelled.';
                    break;
                case 'user_cancelled':
                    errorMessage = 'Verification was cancelled.';
                    break;
                default:
                    errorMessage = error.error_message || errorMessage;
            }
        }
        
        this.showError(errorMessage);
    }

    extractPlayerWorldId(worldIdData) {
        // Extract a user-friendly identifier from the World ID data
        // Using nullifier_hash as the unique identifier for the player
        if (worldIdData.nullifier_hash) {
            // Take first 12 characters of the nullifier hash for display
            return worldIdData.nullifier_hash.substring(0, 12);
        }
        return 'Unknown';
    }

    isValidAuth(authData) {
        // Check if stored authentication is still valid
        if (!authData || !authData.nullifier_hash || !authData.expiresAt) {
            return false;
        }
        
        // Check if not expired
        return Date.now() < authData.expiresAt;
    }

    updateVerificationStatus(message, icon) {
        const statusElement = document.getElementById('verificationStatus');
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="status-icon">${icon}</div>
                <p>${message}</p>
            `;
        }
    }

    showError(message) {
        this.updateVerificationStatus(message, '❌');
        
        // Reset to initial state after delay
        setTimeout(() => {
            this.updateVerificationStatus('Ready to verify your World ID', '🔐');
        }, 3000);
    }

    showLobby() {
        // Update the game controller to use World ID as player name
        if (window.gameController) {
            window.gameController.setPlayerWorldId(this.playerWorldId);
            // Use the game controller's showScreen method to properly manage screens
            window.gameController.showScreen('lobby');
        } else {
            // Fallback if game controller isn't available
            document.getElementById('worldIdLogin').classList.remove('active');
            document.getElementById('lobby').classList.add('active');
        }
        
        // Update player World ID display in lobby
        const worldIdDisplay = document.getElementById('playerWorldId');
        if (worldIdDisplay && this.playerWorldId) {
            worldIdDisplay.textContent = this.playerWorldId;
        }
    }

    logout() {
        // Clear authentication data
        this.isAuthenticated = false;
        this.worldIdData = null;
        this.playerWorldId = null;
        localStorage.removeItem('worldid_auth');
        
        // Use game controller to manage screen transition
        if (window.gameController) {
            window.gameController.showScreen('worldIdLogin');
        } else {
            // Fallback if game controller isn't available
            document.getElementById('lobby').classList.remove('active');
            document.getElementById('worldIdLogin').classList.add('active');
        }
        
        // Reset verification status
        this.updateVerificationStatus('Ready to verify your World ID', '🔐');
        
        console.log('User logged out');
    }

    // Better method to detect World App environment
    isInWorldApp() {
        // Check multiple indicators that we're in World App
        const indicators = {
            miniKitExists: typeof window.MiniKit !== 'undefined',
            userAgent: navigator.userAgent.toLowerCase().includes('world'),
            worldAppContext: window.location.href.includes('worldapp') || 
                           window.location.href.includes('world-app') ||
                           document.referrer.includes('worldapp'),
            miniKitInstalled: false,
            hasCommandsAsync: false
        };

        // Check if MiniKit is properly installed
        if (indicators.miniKitExists) {
            try {
                // Check if commandsAsync exists (this is a good indicator)
                indicators.hasCommandsAsync = typeof window.MiniKit.commandsAsync !== 'undefined';
                
                if (typeof window.MiniKit.isInstalled === 'function') {
                    indicators.miniKitInstalled = window.MiniKit.isInstalled();
                } else {
                    // If isInstalled method doesn't exist, assume it's installed if commandsAsync exists
                    indicators.miniKitInstalled = indicators.hasCommandsAsync;
                }
            } catch (error) {
                console.log('Error checking MiniKit installation:', error);
                indicators.miniKitInstalled = false;
            }
        }

        console.log('World App detection indicators:', indicators);
        
        // We're in World App if MiniKit exists and has the necessary methods
        return indicators.miniKitExists && (indicators.hasCommandsAsync || indicators.miniKitInstalled);
    }

    // Public methods for the game to use
    getPlayerWorldId() {
        return this.playerWorldId;
    }

    isUserAuthenticated() {
        return this.isAuthenticated;
    }

    getAuthData() {
        return this.worldIdData;
    }
}

// Initialize World ID Authentication when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add a small delay to ensure game controller is ready
    setTimeout(() => {
        window.worldIdAuth = new WorldIdAuth();
    }, 100);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorldIdAuth;
} 