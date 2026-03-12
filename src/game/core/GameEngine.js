/**
 * 命运塔 - 游戏引擎
 * Tower of Fate Game Engine
 * 
 * 核心游戏逻辑：出牌、移动、守卫判定、胜负判定
 */

const { Card, Deck, Tower } = require('./Card');
const EventEmitter = require('events');

class Player {
    constructor(id, name, isAI = false) {
        this.id = id;
        this.name = name;
        this.isAI = isAI;
        this.hand = [];
        this.position = 0;
        this.level = 0;
        this.score = 0;
        this.isConnected = true;
        this.isReady = false;
        this.turnTime = 30000; // 30秒回合时间
        this.stats = {
            cardsPlayed: 0,
            rageTriggered: 0,
            levelsClimbed: 0,
            guardsDefeated: 0
        };
    }

    addCards(cards) {
        if (!Array.isArray(cards)) cards = [cards];
        this.hand.push(...cards);
    }

    removeCard(cardId) {
        const index = this.hand.findIndex(c => c.id === cardId);
        if (index >= 0) {
            return this.hand.splice(index, 1)[0];
        }
        return null;
    }

    hasCard(cardId) {
        return this.hand.some(c => c.id === cardId);
    }

    canPlayCard(card, topCard) {
        if (!topCard) return true;
        return card.matches(topCard);
    }

    getPlayableCards(topCard) {
        if (!topCard) return this.hand;
        return this.hand.filter(card => card.matches(topCard));
    }

    move(steps) {
        this.position += steps;
        this.level = Math.floor(this.position / 10) + 1;
        this.stats.levelsClimbed = this.level;
    }

    triggerRage() {
        this.position = Math.max(0, this.position - 5);
        this.level = Math.floor(this.position / 10) + 1;
        this.stats.rageTriggered++;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            isAI: this.isAI,
            hand: this.hand.map(c => c.toJSON()),
            handCount: this.hand.length,
            position: this.position,
            level: this.level,
            score: this.score,
            isConnected: this.isConnected,
            isReady: this.isReady,
            stats: this.stats
        };
    }
}

class GameEngine extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            maxPlayers: config.maxPlayers || 4,
            numDecks: config.numDecks || 4,
            winCondition: config.winCondition || 'first_to_top',
            turnTimeout: config.turnTimeout || 30000,
            ragePenalty: config.ragePenalty || 5,
            ...config
        };
        
        this.id = this.generateGameId();
        this.players = new Map();
        this.deck = null;
        this.tower = null;
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.state = 'waiting'; // waiting, ready, playing, paused, ended
        this.turnTimer = null;
        this.round = 1;
        this.winner = null;
        this.startTime = null;
        this.endTime = null;
        this.history = [];
    }

    generateGameId() {
        return 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    addPlayer(id, name, isAI = false) {
        if (this.players.size >= this.config.maxPlayers) {
            throw new Error('游戏人数已满');
        }
        if (this.players.has(id)) {
            throw new Error('玩家已存在');
        }
        
        const player = new Player(id, name, isAI);
        this.players.set(id, player);
        this.emit('player_joined', { gameId: this.id, player: player.toJSON() });
        
        if (this.players.size >= 2) {
            this.state = 'ready';
        }
        
        return player;
    }

    removePlayer(id) {
        const player = this.players.get(id);
        if (player) {
            // 如果游戏进行中，标记为断开而不是删除
            if (this.state === 'playing') {
                player.isConnected = false;
                this.emit('player_disconnected', { gameId: this.id, playerId: id });
                // 如果是当前玩家的回合，切换到下一个
                if (this.getCurrentPlayer().id === id) {
                    this.nextTurn();
                }
            } else {
                this.players.delete(id);
                this.emit('player_left', { gameId: this.id, playerId: id });
            }
            
            if (this.players.size < 2) {
                this.state = 'waiting';
            }
        }
        return player;
    }

    start() {
        if (this.state !== 'ready') {
            throw new Error('游戏尚未准备就绪');
        }
        
        // 初始化
        this.deck = new Deck(this.config.numDecks);
        this.tower = new Tower();
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.round = 1;
        this.state = 'playing';
        this.startTime = Date.now();
        
        // 发牌 - 每人5张
        for (const player of this.players.values()) {
            player.hand = [];
            player.position = 0;
            player.level = 0;
            player.score = 0;
            player.stats = { cardsPlayed: 0, rageTriggered: 0, levelsClimbed: 0, guardsDefeated: 0 };
            player.addCards(this.deck.draw(5));
        }
        
        // 翻开第一张牌
        const firstCard = this.deck.draw(1)[0];
        this.discardPile.push(firstCard);
        
        this.emit('game_started', {
            gameId: this.id,
            players: Array.from(this.players.values()).map(p => p.toJSON()),
            firstCard: firstCard.toJSON(),
            tower: this.tower.getProgress()
        });
        
        this.startTurn();
        return true;
    }

    startTurn() {
        const player = this.getCurrentPlayer();
        if (!player || !player.isConnected) {
            this.nextTurn();
            return;
        }
        
        // 检查玩家手牌，如果没有可出的牌，强制补牌
        const topCard = this.getTopCard();
        const playableCards = player.getPlayableCards(topCard);
        
        if (playableCards.length === 0) {
            // 补两张牌
            const newCards = this.deck.draw(2);
            player.addCards(newCards);
            this.emit('cards_drawn', {
                gameId: this.id,
                playerId: player.id,
                cards: newCards.map(c => c.toJSON()),
                reason: 'no_playable_card'
            });
        }
        
        // 启动回合计时器
        this.turnTimer = setTimeout(() => {
            this.handleTimeout();
        }, this.config.turnTimeout);
        
        this.emit('turn_started', {
            gameId: this.id,
            playerId: player.id,
            playerName: player.name,
            timeout: this.config.turnTimeout,
            round: this.round
        });
    }

    handleTimeout() {
        const player = this.getCurrentPlayer();
        if (!player) return;
        
        // 自动出第一张可出的牌
        const topCard = this.getTopCard();
        const playableCards = player.getPlayableCards(topCard);
        
        if (playableCards.length > 0) {
            this.playCard(player.id, playableCards[0].id);
        } else {
            // 没有可出的牌，跳过回合
            this.emit('turn_skipped', {
                gameId: this.id,
                playerId: player.id,
                reason: 'timeout_no_playable_card'
            });
            this.nextTurn();
        }
    }

    playCard(playerId, cardId, target = null) {
        if (this.state !== 'playing') {
            throw new Error('游戏未在进行中');
        }
        
        const player = this.players.get(playerId);
        if (!player) {
            throw new Error('玩家不存在');
        }
        
        if (this.getCurrentPlayer().id !== playerId) {
            throw new Error('不是你的回合');
        }
        
        const card = player.getPlayableCards(this.getTopCard())
            .find(c => c.id === cardId);
        
        if (!card) {
            throw new Error('不能出这张牌');
        }
        
        // 清除计时器
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }
        
        // 移除手牌并放入弃牌堆
        player.removeCard(cardId);
        this.discardPile.push(card);
        player.stats.cardsPlayed++;
        
        // 计算步数
        const steps = card.value;
        const oldLevel = player.level;
        
        // 移动玩家
        player.move(steps);
        
        // 检查是否遇到守卫
        const guard = this.tower.getGuard(player.level);
        let rageTriggered = false;
        
        if (guard && !guard.defeated && guard.checkRage(card)) {
            player.triggerRage();
            rageTriggered = true;
        }
        
        // 检查是否到达新层级
        if (player.level > oldLevel) {
            if (guard) {
                guard.defeated = true;
                player.stats.guardsDefeated++;
            }
        }
        
        // 记录历史
        this.history.push({
            round: this.round,
            playerId: player.id,
            card: card.toJSON(),
            steps: steps,
            oldPosition: player.position - steps,
            newPosition: player.position,
            rageTriggered: rageTriggered,
            timestamp: Date.now()
        });
        
        this.emit('card_played', {
            gameId: this.id,
            playerId: player.id,
            card: card.toJSON(),
            steps: steps,
            newPosition: player.position,
            newLevel: player.level,
            rageTriggered: rageTriggered,
            currentTopCard: card.toJSON()
        });
        
        // 检查胜利条件
        if (this.tower.checkVictory(player.level)) {
            this.endGame(player);
            return;
        }
        
        // 补牌
        if (player.hand.length < 5) {
            const drawCount = 5 - player.hand.length;
            const newCards = this.deck.draw(drawCount);
            player.addCards(newCards);
            this.emit('cards_drawn', {
                gameId: this.id,
                playerId: player.id,
                cards: newCards.map(c => c.toJSON()),
                reason: 'turn_end'
            });
        }
        
        // 下一回合
        this.nextTurn();
    }

    nextTurn() {
        if (this.state !== 'playing') return;
        
        // 清除计时器
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }
        
        // 找到下一个在线的玩家
        let attempts = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.size;
            if (this.currentPlayerIndex === 0) {
                this.round++;
            }
            attempts++;
        } while (attempts < this.players.size && !this.getCurrentPlayer().isConnected);
        
        // 如果所有玩家都离线，暂停游戏
        if (attempts >= this.players.size) {
            this.pause();
            return;
        }
        
        this.startTurn();
    }

    pause() {
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }
        this.state = 'paused';
        this.emit('game_paused', { gameId: this.id });
    }

    resume() {
        if (this.state === 'paused') {
            this.state = 'playing';
            this.emit('game_resumed', { gameId: this.id });
            this.startTurn();
        }
    }

    endGame(winner) {
        this.state = 'ended';
        this.endTime = Date.now();
        this.winner = winner;
        
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }
        
        // 计算最终得分
        const finalScores = Array.from(this.players.values()).map(p => ({
            playerId: p.id,
            name: p.name,
            score: p.score + (p.position * 10) + (p.stats.guardsDefeated * 100),
            stats: p.stats,
            isWinner: p.id === winner.id
        }));
        
        finalScores.sort((a, b) => b.score - a.score);
        
        this.emit('game_ended', {
            gameId: this.id,
            winner: winner.toJSON(),
            finalScores: finalScores,
            duration: this.endTime - this.startTime,
            totalRounds: this.round,
            history: this.history
        });
    }

    getCurrentPlayer() {
        const players = Array.from(this.players.values());
        return players[this.currentPlayerIndex];
    }

    getTopCard() {
        if (this.discardPile.length === 0) return null;
        return this.discardPile[this.discardPile.length - 1];
    }

    getGameState(playerId = null) {
        const state = {
            gameId: this.id,
            state: this.state,
            round: this.round,
            players: Array.from(this.players.values()).map(p => ({
                ...p.toJSON(),
                // 如果不是该玩家本人，隐藏手牌详情
                hand: p.id === playerId ? p.hand.map(c => c.toJSON()) : 
                      new Array(p.hand.length).fill({ hidden: true })
            })),
            topCard: this.getTopCard()?.toJSON(),
            discardCount: this.discardPile.length,
            deckRemaining: this.deck?.remaining() || 0,
            tower: this.tower?.getProgress(),
            currentPlayerId: this.getCurrentPlayer()?.id,
            winner: this.winner?.toJSON()
        };
        
        return state;
    }

    surrender(playerId) {
        const player = this.players.get(playerId);
        if (!player) return false;
        
        player.isConnected = false;
        
        // 如果只剩一个玩家，该玩家获胜
        const connectedPlayers = Array.from(this.players.values())
            .filter(p => p.isConnected);
        
        if (connectedPlayers.length === 1 && this.state === 'playing') {
            this.endGame(connectedPlayers[0]);
        } else if (connectedPlayers.length === 0) {
            this.endGame(player); // 最后离开的人算输，但结束游戏
        }
        
        return true;
    }
}

module.exports = { GameEngine, Player };
