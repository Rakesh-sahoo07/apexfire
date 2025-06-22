// Player class for handling player state and actions
class Player {
    constructor(name, x, y, isMainPlayer = false, isNetworkPlayer = false) {
        this.name = name;
        this.x = x;
        this.y = y;
        this.isMainPlayer = isMainPlayer;
        this.isNetworkPlayer = isNetworkPlayer; // Real player controlled over network
        this.id = null; // Will be set by network manager
        
        // Player stats
        this.health = 100;
        this.maxHealth = 100;
        this.ammo = 30;
        this.maxAmmo = 30;
        this.reserveAmmo = 120;
        this.kills = 0;
        this.deaths = 0;
        this.score = 0;
        
        // Movement properties
        this.vx = 0;
        this.vy = 0;
        this.speed = 3;
        this.angle = 0;
        
        // Weapon properties
        this.weapon = 'AK47';
        this.fireRate = 100; // milliseconds between shots
        this.lastShotTime = 0;
        this.isReloading = false;
        this.reloadTime = 2500; // milliseconds
        this.reloadStartTime = 0;
        
        // Auto-reload properties
        this.autoReloadTime = 3000; // 3 seconds total for auto-reload
        this.autoReloadStartTime = 0;
        this.isAutoReloadPending = false;
        
        // Visual properties
        this.color = isMainPlayer ? '#4ecdc4' : this.getRandomColor();
        this.size = 20;
        
        // AI properties (for non-main players)
        if (!isMainPlayer) {
            this.aiTarget = null;
            this.aiLastDirectionChange = 0;
            this.aiDirection = Math.random() * Math.PI * 2;
            this.aiShootCooldown = 0;
        }
    }
    
    getRandomColor() {
        const colors = ['#e74c3c', '#f39c12', '#9b59b6', '#3498db', '#2ecc71', '#f1c40f'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    update(deltaTime, otherPlayers, mapBounds) {
        // Only run AI for actual AI players, not network players or main player
        if (!this.isMainPlayer && !this.isNetworkPlayer) {
            this.updateAI(deltaTime, otherPlayers, mapBounds);
        }
        
        // Update position (only apply velocity for main player and AI)
        if (this.isMainPlayer || !this.isNetworkPlayer) {
            this.x += this.vx;
            this.y += this.vy;
            
            // Apply friction
            this.vx *= 0.9;
            this.vy *= 0.9;
            
            // Stop very small movements to prevent jitter
            if (Math.abs(this.vx) < 0.01) this.vx = 0;
            if (Math.abs(this.vy) < 0.01) this.vy = 0;
        } else if (this.isNetworkPlayer) {
            // Advanced interpolation and prediction for network players
            if (this.targetX !== undefined && this.targetY !== undefined) {
                const now = Date.now();
                const timeSinceUpdate = now - (this.lastUpdateTime || now);
                
                // Use faster interpolation for more responsive movement
                const lerpFactor = Math.min(0.4, deltaTime / 16); // Adaptive based on frame rate
                
                // Predict position based on velocity for smoother movement
                let predictedX = this.targetX;
                let predictedY = this.targetY;
                
                if (this.targetVx !== undefined && this.targetVy !== undefined && timeSinceUpdate < 100) {
                    // Use velocity for prediction only if update is recent
                    predictedX += this.targetVx * (timeSinceUpdate / 16);
                    predictedY += this.targetVy * (timeSinceUpdate / 16);
                }
                
                // Smooth interpolation to predicted position
                this.x += (predictedX - this.x) * lerpFactor;
                this.y += (predictedY - this.y) * lerpFactor;
                
                // Update velocity for visual smoothness
                if (this.targetVx !== undefined && this.targetVy !== undefined) {
                    this.vx += (this.targetVx - this.vx) * lerpFactor;
                    this.vy += (this.targetVy - this.vy) * lerpFactor;
                }
                
                if (this.targetAngle !== undefined) {
                    // Handle angle interpolation (considering wrapping)
                    let angleDiff = this.targetAngle - this.angle;
                    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                    this.angle += angleDiff * lerpFactor;
                }
            }
        }
        
        // Keep player in bounds
        this.x = Math.max(this.size, Math.min(mapBounds.width - this.size, this.x));
        this.y = Math.max(this.size, Math.min(mapBounds.height - this.size, this.y));
        
        // Update reload
        if (this.isReloading) {
            const reloadProgress = (Date.now() - this.reloadStartTime) / this.reloadTime;
            if (reloadProgress >= 1) {
                this.completeReload();
            }
        }
        
        // Update auto-reload
        if (this.isAutoReloadPending) {
            const autoReloadProgress = (Date.now() - this.autoReloadStartTime) / this.autoReloadTime;
            if (autoReloadProgress >= 1) {
                this.completeAutoReload();
            }
        }
        
        // Update AI shoot cooldown
        if (!this.isMainPlayer && this.aiShootCooldown > 0) {
            this.aiShootCooldown -= deltaTime;
        }
    }
    
    updateAI(deltaTime, otherPlayers, mapBounds) {
        const now = Date.now();
        
        // Find nearest enemy (main player prioritized)
        let nearestEnemy = null;
        let nearestDistance = Infinity;
        
        otherPlayers.forEach(player => {
            if (player !== this && player.health > 0) {
                const distance = this.getDistanceTo(player);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestEnemy = player;
                    if (player.isMainPlayer) {
                        nearestDistance *= 0.5; // Prioritize main player
                    }
                }
            }
        });
        
        this.aiTarget = nearestEnemy;
        
        // Movement AI
        if (now - this.aiLastDirectionChange > 2000) {
            this.aiDirection = Math.random() * Math.PI * 2;
            this.aiLastDirectionChange = now;
        }
        
        // Move towards target or random direction
        if (this.aiTarget && nearestDistance < 200) {
            const angle = Math.atan2(this.aiTarget.y - this.y, this.aiTarget.x - this.x);
            this.vx += Math.cos(angle) * 0.5;
            this.vy += Math.sin(angle) * 0.5;
            this.angle = angle;
        } else {
            this.vx += Math.cos(this.aiDirection) * 0.3;
            this.vy += Math.sin(this.aiDirection) * 0.3;
        }
        
        // Shooting AI
        if (this.aiTarget && nearestDistance < 150 && this.aiShootCooldown <= 0) {
            if (this.canShoot()) {
                this.shoot();
                this.aiShootCooldown = 300 + Math.random() * 500; // Random delay
            }
        }
        
        // Reload AI
        if (this.ammo <= 5 && !this.isReloading && this.reserveAmmo > 0) {
            this.reload();
        }
    }
    
    move(dx, dy) {
        if (this.health <= 0) return;
        
        // If no input, apply friction faster to stop movement
        if (dx === 0 && dy === 0) {
            this.vx *= 0.8;
            this.vy *= 0.8;
            return;
        }
        
        // Apply movement input with responsive acceleration
        const acceleration = 0.4;
        this.vx += dx * this.speed * acceleration;
        this.vy += dy * this.speed * acceleration;
        
        // Limit velocity
        const maxVel = this.speed;
        const vel = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (vel > maxVel) {
            this.vx = (this.vx / vel) * maxVel;
            this.vy = (this.vy / vel) * maxVel;
        }
    }
    
    setAngle(angle) {
        this.angle = angle;
    }
    
    resetMovement() {
        this.vx = 0;
        this.vy = 0;
    }
    
    canShoot() {
        const now = Date.now();
        return !this.isReloading && 
               this.ammo > 0 && 
               this.health > 0 && 
               (now - this.lastShotTime) >= this.fireRate;
    }
    
    shoot() {
        if (!this.canShoot()) return null;
        
        this.ammo--;
        this.lastShotTime = Date.now();
        
        // Play gunshot sound for main player
        if (this.isMainPlayer && window.audioManager) {
            window.audioManager.playGunshot();
        }
        
        // Check if ammo is now 0 and start auto-reload timer
        if (this.ammo === 0 && this.reserveAmmo > 0 && !this.isReloading && !this.isAutoReloadPending) {
            this.startAutoReload();
        }
        
        // Create bullet with proper network-compatible format
        const bullet = {
            x: this.x + Math.cos(this.angle) * (this.size + 5),
            y: this.y + Math.sin(this.angle) * (this.size + 5),
            vx: Math.cos(this.angle) * 15,
            vy: Math.sin(this.angle) * 15,
            ownerId: this.id,
            damage: 25,
            life: 1000, // milliseconds
            id: Date.now() + Math.random()
        };
        
        return bullet;
    }
    
    reload() {
        if (this.isReloading || this.isAutoReloadPending || this.reserveAmmo <= 0 || this.ammo >= this.maxAmmo) return;
        
        this.isReloading = true;
        this.reloadStartTime = Date.now();
        
        // Play reload sound for main player
        if (this.isMainPlayer && window.audioManager) {
            window.audioManager.playReload();
        }
    }
    
    completeReload() {
        const ammoNeeded = this.maxAmmo - this.ammo;
        const ammoToReload = Math.min(ammoNeeded, this.reserveAmmo);
        
        this.ammo += ammoToReload;
        this.reserveAmmo -= ammoToReload;
        this.isReloading = false;
    }
    
    startAutoReload() {
        if (this.reserveAmmo <= 0 || this.isReloading || this.isAutoReloadPending) return;
        
        this.isAutoReloadPending = true;
        this.autoReloadStartTime = Date.now();
        
        // Play reload sound immediately when auto-reload starts
        if (this.isMainPlayer && window.audioManager) {
            window.audioManager.playReload();
        }
        
        console.log('Auto-reloading... will complete in 3 seconds');
    }
    
    completeAutoReload() {
        if (this.ammo === 0 && this.reserveAmmo > 0) {
            const ammoNeeded = this.maxAmmo - this.ammo;
            const ammoToReload = Math.min(ammoNeeded, this.reserveAmmo);
            
            this.ammo += ammoToReload;
            this.reserveAmmo -= ammoToReload;
            
            console.log('Auto-reload completed!');
        }
        this.cancelAutoReload();
    }
    
    cancelAutoReload() {
        this.isAutoReloadPending = false;
        this.autoReloadStartTime = 0;
    }
    
    takeDamage(damage, attacker) {
        if (this.health <= 0) return false;
        
        this.health -= damage;
        
        // Play hit sound for main player when taking damage
        if (this.isMainPlayer && window.audioManager) {
            window.audioManager.playHit();
        }
        
        if (this.health <= 0) {
            this.health = 0;
            this.deaths++;
            
            if (attacker) {
                attacker.kills++;
                attacker.score += 100;
            }
            
            return true; // Player died
        }
        
        return false; // Player still alive
    }
    
    respawn(x, y) {
        this.health = this.maxHealth;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.ammo = this.maxAmmo;
        this.reserveAmmo = 120;
        this.isReloading = false;
        
        // Reset auto-reload state
        this.cancelAutoReload();
    }
    
    getDistanceTo(otherPlayer) {
        const dx = this.x - otherPlayer.x;
        const dy = this.y - otherPlayer.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    draw(ctx, camera) {
        if (this.health <= 0) return;
        
        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;
        
        // Draw 8-bit style player
        this.draw8BitPlayer(ctx, screenX, screenY);
        
        // Draw player name
        ctx.fillStyle = '#fff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(this.name, screenX, screenY - this.size - 5);
        ctx.fillText(this.name, screenX, screenY - this.size - 5);
        
        // Draw health bar
        const barWidth = this.size * 2;
        const barHeight = 4;
        const healthPercent = this.health / this.maxHealth;
        
        ctx.fillStyle = '#000';
        ctx.fillRect(screenX - barWidth/2 - 1, screenY + this.size + 4, barWidth + 2, barHeight + 2);
        ctx.fillStyle = '#333';
        ctx.fillRect(screenX - barWidth/2, screenY + this.size + 5, barWidth, barHeight);
        
        ctx.fillStyle = healthPercent > 0.5 ? '#2ecc71' : healthPercent > 0.25 ? '#f39c12' : '#e74c3c';
        ctx.fillRect(screenX - barWidth/2, screenY + this.size + 5, barWidth * healthPercent, barHeight);
        
        // Draw reload indicator
        if (this.isReloading) {
            const reloadProgress = (Date.now() - this.reloadStartTime) / this.reloadTime;
            ctx.fillStyle = '#f39c12';
            ctx.fillRect(screenX - barWidth/2, screenY + this.size + 12, barWidth * reloadProgress, 2);
        }
        
        // Draw auto-reload progress indicator
        if (this.isAutoReloadPending) {
            const autoReloadProgress = (Date.now() - this.autoReloadStartTime) / this.autoReloadTime;
            
            // Draw as reload progress bar (same style as manual reload but different color)
            ctx.fillStyle = '#e74c3c'; // Red color to distinguish from manual reload
            ctx.fillRect(screenX - barWidth/2, screenY + this.size + 12, barWidth * autoReloadProgress, 2);
            
            // Show "AUTO RELOAD" text for main player
            if (this.isMainPlayer) {
                ctx.fillStyle = '#e74c3c';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.strokeText('AUTO RELOAD', screenX, screenY + this.size + 25);
                ctx.fillText('AUTO RELOAD', screenX, screenY + this.size + 25);
            }
        }
    }
    
    draw8BitPlayer(ctx, x, y) {
        const pixelSize = 2;
        const playerSize = this.size;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.angle);
        
        // Player body (8-bit style)
        const bodyColor = this.color;
        const darkColor = this.darkenColor(bodyColor, 0.3);
        const lightColor = this.lightenColor(bodyColor, 0.3);
        
        // Draw body pixels
        this.drawPixel(ctx, -6, -8, pixelSize, bodyColor);
        this.drawPixel(ctx, -4, -8, pixelSize, bodyColor);
        this.drawPixel(ctx, -2, -8, pixelSize, bodyColor);
        this.drawPixel(ctx, 0, -8, pixelSize, bodyColor);
        this.drawPixel(ctx, 2, -8, pixelSize, bodyColor);
        this.drawPixel(ctx, 4, -8, pixelSize, bodyColor);
        
        // Head
        this.drawPixel(ctx, -4, -10, pixelSize, '#fdbcb4');
        this.drawPixel(ctx, -2, -10, pixelSize, '#fdbcb4');
        this.drawPixel(ctx, 0, -10, pixelSize, '#fdbcb4');
        this.drawPixel(ctx, 2, -10, pixelSize, '#fdbcb4');
        
        // Eyes
        this.drawPixel(ctx, -2, -10, pixelSize, '#000');
        this.drawPixel(ctx, 2, -10, pixelSize, '#000');
        
        // Body details
        this.drawPixel(ctx, -6, -6, pixelSize, darkColor);
        this.drawPixel(ctx, -4, -6, pixelSize, bodyColor);
        this.drawPixel(ctx, -2, -6, pixelSize, lightColor);
        this.drawPixel(ctx, 0, -6, pixelSize, bodyColor);
        this.drawPixel(ctx, 2, -6, pixelSize, lightColor);
        this.drawPixel(ctx, 4, -6, pixelSize, darkColor);
        
        // Arms
        this.drawPixel(ctx, -8, -4, pixelSize, '#fdbcb4');
        this.drawPixel(ctx, 6, -4, pixelSize, '#fdbcb4');
        
        // Legs
        this.drawPixel(ctx, -3, 0, pixelSize, '#4a4a4a');
        this.drawPixel(ctx, -1, 0, pixelSize, '#4a4a4a');
        this.drawPixel(ctx, 1, 0, pixelSize, '#4a4a4a');
        this.drawPixel(ctx, 3, 0, pixelSize, '#4a4a4a');
        
        this.drawPixel(ctx, -3, 2, pixelSize, '#4a4a4a');
        this.drawPixel(ctx, 3, 2, pixelSize, '#4a4a4a');
        
        // Feet
        this.drawPixel(ctx, -4, 4, pixelSize, '#2c2c2c');
        this.drawPixel(ctx, -2, 4, pixelSize, '#2c2c2c');
        this.drawPixel(ctx, 2, 4, pixelSize, '#2c2c2c');
        this.drawPixel(ctx, 4, 4, pixelSize, '#2c2c2c');
        
        // AK47 weapon
        if (this.weapon === 'AK47') {
            this.drawAK47(ctx, pixelSize);
        }
        
        ctx.restore();
    }
    
    drawAK47(ctx, pixelSize) {
        const weaponColor = '#4a4a4a';
        const metalColor = '#666';
        
        // Gun barrel
        this.drawPixel(ctx, 8, -2, pixelSize, weaponColor);
        this.drawPixel(ctx, 10, -2, pixelSize, weaponColor);
        this.drawPixel(ctx, 12, -2, pixelSize, weaponColor);
        this.drawPixel(ctx, 14, -2, pixelSize, weaponColor);
        
        // Gun body
        this.drawPixel(ctx, 6, -4, pixelSize, metalColor);
        this.drawPixel(ctx, 8, -4, pixelSize, metalColor);
        this.drawPixel(ctx, 6, -2, pixelSize, metalColor);
        this.drawPixel(ctx, 6, 0, pixelSize, metalColor);
        
        // Grip
        this.drawPixel(ctx, 4, 0, pixelSize, '#8B4513');
        this.drawPixel(ctx, 4, 2, pixelSize, '#8B4513');
        
        // Muzzle flash (when shooting)
        const timeSinceShot = Date.now() - this.lastShotTime;
        if (timeSinceShot < 100) {
            this.drawPixel(ctx, 16, -2, pixelSize, '#ffff00');
            this.drawPixel(ctx, 18, -2, pixelSize, '#ff6600');
            this.drawPixel(ctx, 16, -4, pixelSize, '#ff6600');
            this.drawPixel(ctx, 16, 0, pixelSize, '#ff6600');
        }
    }
    
    drawPixel(ctx, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);
    }
    
    darkenColor(color, amount) {
        const hex = color.replace('#', '');
        const num = parseInt(hex, 16);
        const r = Math.max(0, Math.floor((num >> 16) * (1 - amount)));
        const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - amount)));
        const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - amount)));
        return `rgb(${r}, ${g}, ${b})`;
    }
    
    lightenColor(color, amount) {
        const hex = color.replace('#', '');
        const num = parseInt(hex, 16);
        const r = Math.min(255, Math.floor((num >> 16) * (1 + amount)));
        const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) * (1 + amount)));
        const b = Math.min(255, Math.floor((num & 0x0000FF) * (1 + amount)));
        return `rgb(${r}, ${g}, ${b})`;
    }
} 