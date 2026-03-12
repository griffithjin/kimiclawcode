/**
 * 命运塔 - 卡牌系统
 * Tower of Fate Card System
 * 
 * 使用4副扑克牌，共208张牌
 * 包含13个守卫，每个守卫守护一层
 */

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

class Card {
    constructor(suit, rank, deckId = 1) {
        this.suit = suit;
        this.rank = rank;
        this.deckId = deckId;
        this.id = `${suit}${rank}_D${deckId}`;
        this.value = this.calculateValue();
        this.isRed = (suit === '♥' || suit === '♦');
        this.isBlack = (suit === '♠' || suit === '♣');
    }

    calculateValue() {
        if (this.rank === 'A') return 1;
        if (this.rank === 'J') return 11;
        if (this.rank === 'Q') return 12;
        if (this.rank === 'K') return 13;
        return parseInt(this.rank);
    }

    getDisplayName() {
        return `${this.suit}${this.rank}`;
    }

    getColor() {
        return this.isRed ? 'red' : 'black';
    }

    matches(otherCard) {
        return this.suit === otherCard.suit || this.rank === otherCard.rank;
    }

    toJSON() {
        return {
            id: this.id,
            suit: this.suit,
            rank: this.rank,
            deckId: this.deckId,
            value: this.value,
            isRed: this.isRed,
            displayName: this.getDisplayName()
        };
    }

    static fromJSON(json) {
        return new Card(json.suit, json.rank, json.deckId);
    }
}

class Deck {
    constructor(numDecks = 4) {
        this.numDecks = numDecks;
        this.cards = [];
        this.discarded = [];
        this.init();
    }

    init() {
        this.cards = [];
        for (let d = 1; d <= this.numDecks; d++) {
            for (const suit of SUITS) {
                for (const rank of RANKS) {
                    this.cards.push(new Card(suit, rank, d));
                }
            }
        }
        this.shuffle();
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw(count = 1) {
        if (this.cards.length < count) {
            this.reshuffle();
        }
        return this.cards.splice(0, count);
    }

    reshuffle() {
        this.cards = [...this.discarded];
        this.discarded = [];
        this.shuffle();
    }

    discard(cards) {
        if (!Array.isArray(cards)) cards = [cards];
        this.discarded.push(...cards);
    }

    remaining() {
        return this.cards.length;
    }

    getStats() {
        const stats = {};
        for (const rank of RANKS) {
            stats[rank] = {
                total: this.numDecks * 4,
                remaining: this.cards.filter(c => c.rank === rank).length,
                discarded: this.discarded.filter(c => c.rank === rank).length
            };
        }
        return stats;
    }
}

class Guard {
    constructor(level, name, difficulty = 'normal') {
        this.level = level;
        this.name = name;
        this.difficulty = difficulty;
        this.rageCards = this.generateRageCards();
        this.position = level * 10;
        this.defeated = false;
    }

    generateRageCards() {
        // 每个守卫有3张怒气牌
        const rageCards = [];
        const suits = SUITS.slice();
        const ranks = ['J', 'Q', 'K'];
        
        for (let i = 0; i < 3; i++) {
            const suit = suits[i % suits.length];
            const rank = ranks[i % ranks.length];
            rageCards.push(new Card(suit, rank, 0));
        }
        return rageCards;
    }

    checkRage(card) {
        return this.rageCards.some(rage => 
            rage.suit === card.suit || rage.rank === card.rank
        );
    }

    getInfo() {
        return {
            level: this.level,
            name: this.name,
            difficulty: this.difficulty,
            rageCards: this.rageCards.map(c => c.getDisplayName()),
            position: this.position,
            defeated: this.defeated
        };
    }
}

class Tower {
    constructor() {
        this.levels = 13;
        this.guards = this.createGuards();
        this.currentTopLevel = 0;
    }

    createGuards() {
        const guardNames = [
            '铁卫·塔盾', '影卫·暗杀', '炎卫·烈焰', '冰卫·霜冻',
            '雷卫·风暴', '风卫·疾行', '岩卫·坚壁', '水卫·潮汐',
            '光卫·圣盾', '暗卫·深渊', '龙卫·咆哮', '神卫·审判',
            '命运守卫·终焉'
        ];
        
        const difficulties = [
            'easy', 'easy', 'normal', 'normal',
            'normal', 'hard', 'hard', 'hard',
            'expert', 'expert', 'master', 'master', 'legendary'
        ];

        return guardNames.map((name, index) => 
            new Guard(index + 1, name, difficulties[index])
        );
    }

    getGuard(level) {
        return this.guards[level - 1];
    }

    checkVictory(playerLevel) {
        return playerLevel >= this.levels;
    }

    getProgress() {
        return {
            total: this.levels,
            current: this.currentTopLevel,
            guards: this.guards.map(g => g.getInfo())
        };
    }
}

module.exports = {
    Card,
    Deck,
    Guard,
    Tower,
    SUITS,
    RANKS
};
