// World ID Authentication Manager
class WorldIdAuth {
    constructor() {
        this.isAuthenticated = false;
        this.worldIdData = null;
        this.playerWorldId = null;
        
        // Configuration - Replace with your actual World ID app details
        this.config = {
            app_id: 'app_2801b290146f908019d18744581aa6e2', // Replace with your World ID app ID
            action: 'login', // Action identifier
            verification_level: 'device' // 'device' or 'orb'
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
        this.initializeIDKit();
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

    initializeIDKit() {
        try {
            // Initialize IDKit with configuration
            window.IDKit.init({
                app_id: this.config.app_id,
                action: this.config.action,
                verification_level: this.config.verification_level,
                onSuccess: (result) => this.handleSuccess(result),
                onError: (error) => this.handleError(error),
                handleVerify: (result) => this.handleVerify(result)
            });
            
            console.log('IDKit initialized successfully');
        } catch (error) {
            console.error('Failed to initialize IDKit:', error);
            this.showError('Failed to initialize World ID. Please refresh the page.');
        }
    }

    openWorldIdVerification() {
        try {
            this.updateVerificationStatus('Connecting to World ID...', '🔄');
            window.IDKit.open();
        } catch (error) {
            console.error('Failed to open World ID verification:', error);
            this.showError('Failed to open World ID verification. Please try again.');
        }
    }

    async handleVerify(result) {
        // This function is called to verify the proof on your backend
        // For demo purposes, we'll simulate a successful verification
        // In production, you should verify the proof on your backend server
        
        try {
            this.updateVerificationStatus('Verifying proof...', '⏳');
            
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // In production, make an actual API call to your backend:
            /*
            const response = await fetch('/api/verify-worldid', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(result)
            });
            
            if (!response.ok) {
                throw new Error('Verification failed');
            }
            
            const verificationResult = await response.json();
            if (!verificationResult.success) {
                throw new Error('Invalid proof');
            }
            */
            
            return true; // Return true if verification succeeds
        } catch (error) {
            console.error('Verification failed:', error);
            throw new Error('Failed to verify World ID proof');
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
        
        if (error.code) {
            switch (error.code) {
                case 'already_signed':
                    errorMessage = 'You have already verified for this action.';
                    break;
                case 'invalid_proof':
                    errorMessage = 'Invalid proof. Please try again.';
                    break;
                case 'verification_rejected':
                    errorMessage = 'Verification was rejected or cancelled.';
                    break;
                default:
                    errorMessage = error.detail || errorMessage;
            }
        }
        
        this.showError(errorMessage);
    }

    extractPlayerWorldId(worldIdData) {
        // Extract a user-friendly identifier from the World ID data
        // Using nullifier_hash as the unique identifier for the player
        if (worldIdData.nullifier_hash) {
            // Take first 8 characters of the nullifier hash for display
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
        // Hide World ID login screen
        document.getElementById('worldIdLogin').classList.remove('active');
        
        // Show lobby screen
        document.getElementById('lobby').classList.add('active');
        
        // Update player World ID display in lobby
        const worldIdDisplay = document.getElementById('playerWorldId');
        if (worldIdDisplay && this.playerWorldId) {
            worldIdDisplay.textContent = this.playerWorldId;
        }
        
        // Update the game controller to use World ID as player name
        if (window.gameController) {
            window.gameController.setPlayerWorldId(this.playerWorldId);
        }
    }

    logout() {
        // Clear authentication data
        this.isAuthenticated = false;
        this.worldIdData = null;
        this.playerWorldId = null;
        localStorage.removeItem('worldid_auth');
        
        // Hide lobby and show login screen
        document.getElementById('lobby').classList.remove('active');
        document.getElementById('worldIdLogin').classList.add('active');
        
        // Reset verification status
        this.updateVerificationStatus('Ready to verify your World ID', '🔐');
        
        console.log('User logged out');
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
    window.worldIdAuth = new WorldIdAuth();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorldIdAuth;
} 