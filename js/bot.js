// Bot AI class extending Player
class Bot extends Player {
    constructor(name, x, y, difficulty = 'medium') {
        super(name, x, y, false, false);
        this.isBot = true;
        this.difficulty = difficulty;
        this.botId = 'bot_' + Math.random().toString(36).substr(2, 9);
        
        // AI State Management
        this.aiState = 'patrol'; // patrol, hunt, combat, flee, reload
        this.stateTimer = 0;
        this.stateDuration = 0;
        
        // Target and Combat
        this.currentTarget = null;
        this.lastSeenTargetPos = null;
        this.lastSeenTargetTime = 0;
        this.combatRange = 120;
        this.fleeRange = 80;
        this.detectionRange = 180;
        
        // Movement and Pathfinding
        this.waypoints = [];
        this.currentWaypoint = 0;
        this.stuckTimer = 0;
        this.lastPosition = { x: x, y: y };
        this.movementNoise = 0;
        this.strafeDirection = 1;
        this.strafeTimer = 0;
        
        // Weapon Handling
        this.aimAccuracy = this.getDifficultyAccuracy();
        this.reactionTime = this.getDifficultyReactionTime();
        this.burstFireCount = 0;
        this.burstFireMax = Math.floor(Math.random() * 3) + 2;
        this.burstCooldown = 0;
        
        // Collision Avoidance
        this.avoidanceVector = { x: 0, y: 0 };
        this.lastCollisionTime = 0;
        this.collisionCooldown = 500;
        
        // Human-like Behavior
        this.idleTimer = 0;
        this.idleAction = 'none';
        this.panicLevel = 0;
        this.aggressionLevel = Math.random() * 0.5 + 0.3;
        
        // Performance optimization
        this.updateFrequency = 16; // Update every 16ms (~60fps)
        this.lastUpdateTime = 0;
        
        this.generatePatrolWaypoints();
    }
    
    getDifficultyAccuracy() {
        switch(this.difficulty) {
            case 'easy': return 0.6 + Math.random() * 0.2;
            case 'medium': return 0.75 + Math.random() * 0.15;
            case 'hard': return 0.85 + Math.random() * 0.1;
            default: return 0.75;
        }
    }
    
    getDifficultyReactionTime() {
        switch(this.difficulty) {
            case 'easy': return 800 + Math.random() * 400;
            case 'medium': return 400 + Math.random() * 300;
            case 'hard': return 200 + Math.random() * 200;
            default: return 400;
        }
    }
    
    update(deltaTime, otherPlayers, mapBounds, obstacles = []) {
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateFrequency) {
            return;
        }
        this.lastUpdateTime = now;
        
        // Update timers
        this.stateTimer += deltaTime;
        this.stuckTimer += deltaTime;
        this.strafeTimer += deltaTime;
        this.burstCooldown = Math.max(0, this.burstCooldown - deltaTime);
        this.panicLevel = Math.max(0, this.panicLevel - deltaTime * 0.001);
        
        // Check if stuck and need to find new path
        this.checkIfStuck();
        
        // Update AI state machine
        this.updateAIState(otherPlayers, mapBounds);
        
        // Execute current state behavior
        this.executeAIBehavior(otherPlayers, mapBounds, obstacles);
        
        // Apply movement with collision avoidance
        this.applyMovementWithCollisionAvoidance(obstacles, otherPlayers);
        
        // Update position
        this.x += this.vx;
        this.y += this.vy;
        
        // Apply friction
        this.vx *= 0.88;
        this.vy *= 0.88;
        
        // Stop very small movements
        if (Math.abs(this.vx) < 0.05) this.vx = 0;
        if (Math.abs(this.vy) < 0.05) this.vy = 0;
        
        // Keep in bounds
        this.x = Math.max(this.size, Math.min(mapBounds.width - this.size, this.x));
        this.y = Math.max(this.size, Math.min(mapBounds.height - this.size, this.y));
        
        // Update reload state
        if (this.isReloading) {
            const reloadProgress = (Date.now() - this.reloadStartTime) / this.reloadTime;
            if (reloadProgress >= 1) {
                this.completeReload();
            }
        }
        
        this.lastPosition = { x: this.x, y: this.y };
    }
    
    updateAIState(otherPlayers, mapBounds) {
        const nearbyEnemies = this.findNearbyEnemies(otherPlayers);
        const closestEnemy = nearbyEnemies[0];
        
        // State transition logic
        switch(this.aiState) {
            case 'patrol':
                if (closestEnemy && this.getDistanceTo(closestEnemy) < this.detectionRange) {
                    this.changeState('hunt');
                    this.currentTarget = closestEnemy;
                    this.lastSeenTargetPos = { x: closestEnemy.x, y: closestEnemy.y };
                    this.lastSeenTargetTime = Date.now();
                }
                break;
                
            case 'hunt':
                if (!closestEnemy || this.getDistanceTo(closestEnemy) > this.detectionRange * 1.5) {
                    this.changeState('patrol');
                    this.currentTarget = null;
                } else if (this.getDistanceTo(closestEnemy) < this.combatRange) {
                    this.changeState('combat');
                }
                break;
                
            case 'combat':
                if (!closestEnemy || this.getDistanceTo(closestEnemy) > this.combatRange * 1.5) {
                    this.changeState('hunt');
                } else if (this.health < 30 && this.getDistanceTo(closestEnemy) < this.fleeRange) {
                    this.changeState('flee');
                    this.panicLevel = 1000;
                }
                
                // Check if need to reload
                if (this.ammo <= 3 && this.reserveAmmo > 0 && !this.isReloading) {
                    this.changeState('reload');
                }
                break;
                
            case 'flee':
                if (this.health > 60 || (closestEnemy && this.getDistanceTo(closestEnemy) > this.detectionRange)) {
                    this.changeState('patrol');
                }
                break;
                
            case 'reload':
                if (!this.isReloading || this.ammo > 20) {
                    if (closestEnemy && this.getDistanceTo(closestEnemy) < this.combatRange) {
                        this.changeState('combat');
                    } else {
                        this.changeState('patrol');
                    }
                }
                break;
        }
    }
    
    executeAIBehavior(otherPlayers, mapBounds, obstacles) {
        switch(this.aiState) {
            case 'patrol':
                this.patrol(mapBounds, obstacles);
                break;
            case 'hunt':
                this.hunt(obstacles);
                break;
            case 'combat':
                this.combat(obstacles);
                break;
            case 'flee':
                this.flee(obstacles);
                break;
            case 'reload':
                this.reloadBehavior(obstacles);
                break;
        }
    }
    
    patrol(mapBounds, obstacles) {
        if (this.waypoints.length === 0) {
            this.generatePatrolWaypoints();
        }
        
        const currentWP = this.waypoints[this.currentWaypoint];
        if (currentWP) {
            const distance = Math.sqrt(
                Math.pow(currentWP.x - this.x, 2) + 
                Math.pow(currentWP.y - this.y, 2)
            );
            
            if (distance < 30) {
                this.currentWaypoint = (this.currentWaypoint + 1) % this.waypoints.length;
            } else {
                this.moveToward(currentWP.x, currentWP.y, 0.4);
            }
        }
        
        // Add some idle behavior
        if (Math.random() < 0.001) {
            this.idleTimer = 1000 + Math.random() * 2000;
            this.idleAction = Math.random() < 0.5 ? 'look_around' : 'wait';
        }
        
        if (this.idleTimer > 0) {
            this.idleTimer -= 16;
            if (this.idleAction === 'look_around') {
                this.angle += (Math.random() - 0.5) * 0.05;
            }
        }
    }
    
    hunt(obstacles) {
        if (!this.currentTarget) return;
        
        // Update last seen position
        if (this.canSeeTarget(this.currentTarget, obstacles)) {
            this.lastSeenTargetPos = { x: this.currentTarget.x, y: this.currentTarget.y };
            this.lastSeenTargetTime = Date.now();
        }
        
        // Move toward last known position
        if (this.lastSeenTargetPos) {
            const targetPos = this.predictTargetPosition(this.currentTarget);
            this.moveToward(targetPos.x, targetPos.y, 0.6);
            this.lookAt(targetPos.x, targetPos.y);
        }
    }
    
    combat(obstacles) {
        if (!this.currentTarget) return;
        
        const distance = this.getDistanceTo(this.currentTarget);
        const targetPos = this.predictTargetPosition(this.currentTarget);
        
        // Strafe movement for evasion
        if (this.strafeTimer > 200) {
            this.strafeDirection *= -1;
            this.strafeTimer = 0;
        }
        
        const perpAngle = Math.atan2(this.currentTarget.y - this.y, this.currentTarget.x - this.x) + Math.PI / 2;
        const strafeX = this.x + Math.cos(perpAngle) * this.strafeDirection * 20;
        const strafeY = this.y + Math.sin(perpAngle) * this.strafeDirection * 20;
        
        // Combine approach and strafe
        if (distance > this.combatRange * 0.7) {
            this.moveToward(targetPos.x, targetPos.y, 0.3);
        } else if (distance < this.combatRange * 0.4) {
            this.moveToward(targetPos.x, targetPos.y, -0.2); // Back away
        }
        
        this.moveToward(strafeX, strafeY, 0.4);
        
        // Aiming and shooting
        this.lookAt(targetPos.x, targetPos.y);
        
        if (this.canShoot() && this.canSeeTarget(this.currentTarget, obstacles)) {
            const aimError = (1 - this.aimAccuracy) * (this.panicLevel / 1000 + 1);
            const errorAngle = (Math.random() - 0.5) * aimError * 0.3;
            this.angle += errorAngle;
            
            // Burst fire pattern
            if (this.burstCooldown <= 0) {
                this.shoot();
                this.burstFireCount++;
                
                if (this.burstFireCount >= this.burstFireMax) {
                    this.burstFireCount = 0;
                    this.burstFireMax = Math.floor(Math.random() * 4) + 2;
                    this.burstCooldown = 200 + Math.random() * 300;
                }
            }
        }
    }
    
    flee(obstacles) {
        if (!this.currentTarget) {
            this.changeState('patrol');
            return;
        }
        
        // Run away from target
        const fleeAngle = Math.atan2(this.y - this.currentTarget.y, this.x - this.currentTarget.x);
        const fleeX = this.x + Math.cos(fleeAngle) * 100;
        const fleeY = this.y + Math.sin(fleeAngle) * 100;
        
        this.moveToward(fleeX, fleeY, 0.8);
        
        // Look back occasionally while fleeing
        if (Math.random() < 0.1) {
            this.lookAt(this.currentTarget.x, this.currentTarget.y);
        }
    }
    
    reloadBehavior(obstacles) {
        if (!this.isReloading && this.ammo < this.maxAmmo && this.reserveAmmo > 0) {
            this.reload();
        }
        
        // Move to cover while reloading
        if (this.currentTarget) {
            const coverAngle = Math.atan2(this.y - this.currentTarget.y, this.x - this.currentTarget.x);
            const coverX = this.x + Math.cos(coverAngle) * 50;
            const coverY = this.y + Math.sin(coverAngle) * 50;
            this.moveToward(coverX, coverY, 0.3);
        }
    }
    
    // Helper Methods
    
    changeState(newState) {
        this.aiState = newState;
        this.stateTimer = 0;
        
        // State-specific initialization
        switch(newState) {
            case 'combat':
                this.strafeDirection = Math.random() < 0.5 ? 1 : -1;
                this.strafeTimer = 0;
                break;
            case 'patrol':
                if (Math.random() < 0.3) {
                    this.generatePatrolWaypoints();
                }
                break;
        }
    }
    
    findNearbyEnemies(otherPlayers) {
        const enemies = [];
        
        otherPlayers.forEach(player => {
            if (player !== this && player.health > 0) {
                const distance = this.getDistanceTo(player);
                enemies.push({ player, distance });
            }
        });
        
        return enemies
            .sort((a, b) => a.distance - b.distance)
            .map(e => e.player);
    }
    
    canSeeTarget(target, obstacles) {
        if (!target) return false;
        
        // Simple line of sight check
        const steps = 20;
        const dx = (target.x - this.x) / steps;
        const dy = (target.y - this.y) / steps;
        
        for (let i = 1; i <= steps; i++) {
            const checkX = this.x + dx * i;
            const checkY = this.y + dy * i;
            
            // Check collision with obstacles
            for (let obstacle of obstacles) {
                if (this.checkPointInRectangle(checkX, checkY, obstacle.x, obstacle.y, obstacle.width, obstacle.height)) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    predictTargetPosition(target) {
        if (!target) return { x: this.x, y: this.y };
        
        // Predict where target will be based on velocity
        const predictionTime = 200; // ms
        return {
            x: target.x + (target.vx || 0) * (predictionTime / 16),
            y: target.y + (target.vy || 0) * (predictionTime / 16)
        };
    }
    
    moveToward(targetX, targetY, intensity = 1) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 5) {
            this.vx += (dx / distance) * this.speed * intensity;
            this.vy += (dy / distance) * this.speed * intensity;
        }
    }
    
    lookAt(targetX, targetY) {
        this.angle = Math.atan2(targetY - this.y, targetX - this.x);
    }
    
    checkIfStuck() {
        const moved = Math.sqrt(
            Math.pow(this.x - this.lastPosition.x, 2) + 
            Math.pow(this.y - this.lastPosition.y, 2)
        );
        
        if (moved < 1 && (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1)) {
            this.stuckTimer += 16;
            if (this.stuckTimer > 1000) {
                // Generate new waypoints to get unstuck
                this.generatePatrolWaypoints();
                this.stuckTimer = 0;
            }
        } else {
            this.stuckTimer = 0;
        }
    }
    
    applyMovementWithCollisionAvoidance(obstacles, otherPlayers) {
        // Reset avoidance vector
        this.avoidanceVector = { x: 0, y: 0 };
        
        // Avoid obstacles
        obstacles.forEach(obstacle => {
            const distance = this.getDistanceToObstacle(obstacle);
            if (distance < 40) {
                const avoidX = this.x - (obstacle.x + obstacle.width / 2);
                const avoidY = this.y - (obstacle.y + obstacle.height / 2);
                const avoidLength = Math.sqrt(avoidX * avoidX + avoidY * avoidY);
                
                if (avoidLength > 0) {
                    const force = (40 - distance) / 40;
                    this.avoidanceVector.x += (avoidX / avoidLength) * force * 2;
                    this.avoidanceVector.y += (avoidY / avoidLength) * force * 2;
                }
            }
        });
        
        // Avoid other players
        otherPlayers.forEach(player => {
            if (player !== this) {
                const distance = this.getDistanceTo(player);
                if (distance < 30) {
                    const avoidX = this.x - player.x;
                    const avoidY = this.y - player.y;
                    const avoidLength = Math.sqrt(avoidX * avoidX + avoidY * avoidY);
                    
                    if (avoidLength > 0) {
                        const force = (30 - distance) / 30;
                        this.avoidanceVector.x += (avoidX / avoidLength) * force;
                        this.avoidanceVector.y += (avoidY / avoidLength) * force;
                    }
                }
            }
        });
        
        // Apply avoidance
        this.vx += this.avoidanceVector.x;
        this.vy += this.avoidanceVector.y;
    }
    
    getDistanceToObstacle(obstacle) {
        const centerX = obstacle.x + obstacle.width / 2;
        const centerY = obstacle.y + obstacle.height / 2;
        
        return Math.sqrt(
            Math.pow(this.x - centerX, 2) + 
            Math.pow(this.y - centerY, 2)
        );
    }
    
    generatePatrolWaypoints() {
        this.waypoints = [];
        const numWaypoints = 3 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < numWaypoints; i++) {
            this.waypoints.push({
                x: 50 + Math.random() * 1100,
                y: 50 + Math.random() * 700
            });
        }
        
        this.currentWaypoint = 0;
    }
    
    checkPointInRectangle(pointX, pointY, rectX, rectY, rectWidth, rectHeight) {
        return pointX >= rectX && 
               pointX <= rectX + rectWidth && 
               pointY >= rectY && 
               pointY <= rectY + rectHeight;
    }
    
    // Override shoot method to add bot-specific behavior
    shoot() {
        if (this.canShoot()) {
            super.shoot();
            
            // Add some reaction delay for more human-like behavior
            const delay = this.reactionTime + (Math.random() - 0.5) * 100;
            setTimeout(() => {
                // Slight movement after shooting for realism
                this.vx += (Math.random() - 0.5) * 0.5;
                this.vy += (Math.random() - 0.5) * 0.5;
            }, delay);
        }
    }
} 