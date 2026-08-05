/**
 * Game State System
 * Manages game state, scoring, and persistence
 */

export class GameState {
    constructor() {
        // Score and progress
        this.score = 0;
        this.deliveries = 0;
        this.interceptions = 0;

        // Current game state
        this.selectedRoute = 'express';
        this.currentLevel = 1;
        this.experience = 0;

        // Unlockables
        this.unlockedTrampolines = [];
        this.unlockedPackageTypes = [];
        this.unlockedSkins = ['default'];

        // Statistics
        this.stats = {
            totalDistance: 0,
            maxAltitude: 0,
            bounces: 0,
            playTime: 0,
            packagesDelivered: 0,
            packagesIntercepted: 0
        };

        // Achievements
        this.achievements = {
            firstDelivery: false,
            speedDemon: false,
            highFlyer: false,
            globeTrotter: false,
            packageMaster: false,
            nightOwl: false,
            auroraWatcher: false,
            issVisitor: false
        };

        // Settings
        this.settings = {
            musicVolume: 0.7,
            sfxVolume: 0.8,
            cameraShake: true,
            particleQuality: 'high',
            showTutorial: true
        };

        // Callbacks
        this.onScoreChange = null;
        this.onAchievementUnlock = null;
        this.onLevelUp = null;

        // Load saved state
        this.loadState();
    }

    addScore(points) {
        this.score += points;
        this.experience += points;

        // Check for level up
        const experienceForLevel = this.getExperienceForLevel(this.currentLevel);
        if (this.experience >= experienceForLevel) {
            this.levelUp();
        }

        if (this.onScoreChange) {
            this.onScoreChange(this.score);
        }

        this.saveState();
    }

    getExperienceForLevel(level) {
        return Math.floor(1000 * Math.pow(1.5, level - 1));
    }

    levelUp() {
        this.currentLevel++;
        this.experience = 0;

        // Unlock rewards
        this.unlockReward();

        if (this.onLevelUp) {
            this.onLevelUp(this.currentLevel);
        }
    }

    unlockReward() {
        // Unlock new content based on level
        const rewards = [
            { level: 2, type: 'skin', id: 'neon' },
            { level: 3, type: 'trampoline', id: 'ICN' },
            { level: 4, type: 'packageType', id: 'quantum' },
            { level: 5, type: 'skin', id: 'galaxy' },
            { level: 6, type: 'trampoline', id: 'CPT' },
            { level: 7, type: 'packageType', id: 'stardust' },
            { level: 8, type: 'skin', id: 'aurora' },
            { level: 9, type: 'trampoline', id: 'SVO' },
            { level: 10, type: 'packageType', id: 'dream' },
        ];

        const reward = rewards.find(r => r.level === this.currentLevel);
        if (reward) {
            switch (reward.type) {
                case 'skin':
                    this.unlockedSkins.push(reward.id);
                    break;
                case 'trampoline':
                    this.unlockedTrampolines.push(reward.id);
                    break;
                case 'packageType':
                    this.unlockedPackageTypes.push(reward.id);
                    break;
            }
        }
    }

    updateStats(statName, value) {
        if (this.stats[statName] !== undefined) {
            if (statName === 'maxAltitude') {
                this.stats[statName] = Math.max(this.stats[statName], value);
            } else {
                this.stats[statName] += value;
            }

            // Check achievements
            this.checkAchievements();
        }
    }

    checkAchievements() {
        const newAchievements = [];

        // First Delivery
        if (!this.achievements.firstDelivery && this.stats.packagesDelivered >= 1) {
            this.achievements.firstDelivery = true;
            newAchievements.push({
                id: 'firstDelivery',
                name: 'First Steps',
                description: 'Complete your first delivery'
            });
        }

        // Speed Demon - deliver 10 packages
        if (!this.achievements.speedDemon && this.stats.packagesDelivered >= 10) {
            this.achievements.speedDemon = true;
            newAchievements.push({
                id: 'speedDemon',
                name: 'Speed Demon',
                description: 'Deliver 10 packages'
            });
        }

        // High Flyer - reach 500km altitude
        if (!this.achievements.highFlyer && this.stats.maxAltitude >= 500) {
            this.achievements.highFlyer = true;
            newAchievements.push({
                id: 'highFlyer',
                name: 'High Flyer',
                description: 'Reach 500km altitude'
            });
        }

        // Globe Trotter - travel 10000km total
        if (!this.achievements.globeTrotter && this.stats.totalDistance >= 10000) {
            this.achievements.globeTrotter = true;
            newAchievements.push({
                id: 'globeTrotter',
                name: 'Globe Trotter',
                description: 'Travel a total of 10,000km'
            });
        }

        // Package Master - deliver 50 packages
        if (!this.achievements.packageMaster && this.stats.packagesDelivered >= 50) {
            this.achievements.packageMaster = true;
            newAchievements.push({
                id: 'packageMaster',
                name: 'Package Master',
                description: 'Deliver 50 packages'
            });
        }

        // Trigger callbacks for new achievements
        newAchievements.forEach(achievement => {
            if (this.onAchievementUnlock) {
                this.onAchievementUnlock(achievement);
            }
        });

        this.saveState();
    }

    triggerInteraction(position) {
        // Called when player presses interact button
        // Game systems will check this position for interactables
        return position;
    }

    saveState() {
        const state = {
            score: this.score,
            deliveries: this.deliveries,
            interceptions: this.interceptions,
            currentLevel: this.currentLevel,
            experience: this.experience,
            unlockedTrampolines: this.unlockedTrampolines,
            unlockedPackageTypes: this.unlockedPackageTypes,
            unlockedSkins: this.unlockedSkins,
            stats: this.stats,
            achievements: this.achievements,
            settings: this.settings
        };

        try {
            localStorage.setItem('globall_save', JSON.stringify(state));
        } catch (e) {
            console.warn('Failed to save game state:', e);
        }
    }

    loadState() {
        try {
            const saved = localStorage.getItem('globall_save');
            if (saved) {
                const state = JSON.parse(saved);

                this.score = state.score || 0;
                this.deliveries = state.deliveries || 0;
                this.interceptions = state.interceptions || 0;
                this.currentLevel = state.currentLevel || 1;
                this.experience = state.experience || 0;

                if (state.unlockedTrampolines) {
                    this.unlockedTrampolines = state.unlockedTrampolines;
                }
                if (state.unlockedPackageTypes) {
                    this.unlockedPackageTypes = state.unlockedPackageTypes;
                }
                if (state.unlockedSkins) {
                    this.unlockedSkins = state.unlockedSkins;
                }
                if (state.stats) {
                    this.stats = { ...this.stats, ...state.stats };
                }
                if (state.achievements) {
                    this.achievements = { ...this.achievements, ...state.achievements };
                }
                if (state.settings) {
                    this.settings = { ...this.settings, ...state.settings };
                }
            }
        } catch (e) {
            console.warn('Failed to load game state:', e);
        }
    }

    resetState() {
        this.score = 0;
        this.deliveries = 0;
        this.interceptions = 0;
        this.currentLevel = 1;
        this.experience = 0;
        this.unlockedTrampolines = [];
        this.unlockedPackageTypes = [];
        this.unlockedSkins = ['default'];
        this.stats = {
            totalDistance: 0,
            maxAltitude: 0,
            bounces: 0,
            playTime: 0,
            packagesDelivered: 0,
            packagesIntercepted: 0
        };
        this.achievements = {
            firstDelivery: false,
            speedDemon: false,
            highFlyer: false,
            globeTrotter: false,
            packageMaster: false,
            nightOwl: false,
            auroraWatcher: false,
            issVisitor: false
        };

        localStorage.removeItem('globall_save');
    }

    getProgress() {
        const experienceForLevel = this.getExperienceForLevel(this.currentLevel);
        return {
            level: this.currentLevel,
            experience: this.experience,
            experienceNeeded: experienceForLevel,
            progress: this.experience / experienceForLevel
        };
    }

    getAchievementCount() {
        return Object.values(this.achievements).filter(v => v).length;
    }

    getTotalAchievements() {
        return Object.keys(this.achievements).length;
    }
}
