// Audio Manager for game sounds
class AudioManager {
    constructor() {
        this.sounds = {};
        this.audioContext = null;
        this.masterVolume = 0.5;
        this.soundEnabled = true;
        this.loadedSounds = new Set();
        
        this.initAudioContext();
        this.loadSounds();
    }
    
    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.gain.value = this.masterVolume;
            this.masterGainNode.connect(this.audioContext.destination);
        } catch (error) {
            console.warn('Audio context not supported:', error);
            this.soundEnabled = false;
        }
    }
    
    async loadSounds() {
        // Generate synthetic 8-bit sounds
        this.generateGunshotSound();
        this.generateReloadSound();
        this.generateHitSound();
    }
    
    generateGunshotSound() {
        if (!this.audioContext) return;
        
        // Create a synthetic 8-bit gunshot sound
        const duration = 0.3;
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        
        // Generate noise burst with envelope
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 15); // Fast decay
            const noise = (Math.random() * 2 - 1) * envelope;
            const lowFreq = Math.sin(2 * Math.PI * 150 * t) * envelope * 0.3;
            data[i] = (noise * 0.7 + lowFreq * 0.3) * 0.8;
        }
        
        this.sounds.gunshot = buffer;
        this.loadedSounds.add('gunshot');
    }
    
    generateReloadSound() {
        if (!this.audioContext) return;
        
        // Create a synthetic reload sound
        const duration = 0.8;
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        
        // Generate mechanical clicking sound
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            let sound = 0;
            
            // Multiple clicks
            if (t < 0.1 || (t > 0.3 && t < 0.4) || (t > 0.6 && t < 0.7)) {
                const envelope = Math.exp(-((t % 0.1) * 50));
                sound = (Math.random() * 2 - 1) * envelope * 0.3;
            }
            
            data[i] = sound;
        }
        
        this.sounds.reload = buffer;
        this.loadedSounds.add('reload');
    }
    
    generateHitSound() {
        if (!this.audioContext) return;
        
        // Create a synthetic hit sound
        const duration = 0.2;
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        
        // Generate impact sound
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 20);
            const thud = Math.sin(2 * Math.PI * 80 * t) * envelope;
            const crack = (Math.random() * 2 - 1) * envelope * 0.4;
            data[i] = (thud * 0.6 + crack * 0.4) * 0.6;
        }
        
        this.sounds.hit = buffer;
        this.loadedSounds.add('hit');
    }
    
    playSound(soundName, volume = 1.0, pitch = 1.0) {
        if (!this.soundEnabled || !this.audioContext || !this.sounds[soundName]) {
            return;
        }
        
        try {
            // Resume audio context if suspended (required by browser policies)
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = this.sounds[soundName];
            source.playbackRate.value = pitch;
            gainNode.gain.value = volume * this.masterVolume;
            
            source.connect(gainNode);
            gainNode.connect(this.masterGainNode);
            
            source.start(0);
            
            // Clean up after sound finishes
            source.onended = () => {
                source.disconnect();
                gainNode.disconnect();
            };
            
        } catch (error) {
            console.warn('Error playing sound:', error);
        }
    }
    
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGainNode) {
            this.masterGainNode.gain.value = this.masterVolume;
        }
    }
    
    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        return this.soundEnabled;
    }
    
    // Specific sound playing methods
    playGunshot(volume = 1.0) {
        // Add slight random pitch variation for variety
        const pitch = 0.9 + Math.random() * 0.2;
        this.playSound('gunshot', volume, pitch);
    }
    
    playReload(volume = 0.7) {
        this.playSound('reload', volume);
    }
    
    playHit(volume = 0.8) {
        const pitch = 0.8 + Math.random() * 0.4;
        this.playSound('hit', volume, pitch);
    }
}

// Create global audio manager instance
window.audioManager = new AudioManager(); 