/**
 * 命运塔 - AI玩家系统
 * Tower of Fate AI Player System
 * 
 * 18个系统AI玩家，每个都有独特的性格和策略
 * 支持牌面计算、概率分析、自适应难度
 */

const { Card, SUITS, RANKS } = require('../game/core/Card');

class AIPersonality {
    constructor(name, config) {
        this.name = name;
        this.riskTolerance = config.riskTolerance || 0.5; // 0-1，越高越激进
        this.aggression = config.aggression || 0.5; // 攻击性
        this.bluffFrequency = config.bluffFrequency || 0.2; // 虚张声势频率
        this.adaptability = config.adaptability || 0.5; // 适应能力
        this.description = config.description || '';
    }
}

// 18个AI角色的性格配置
const AI_PERSONALITIES = {
    alpha: new AIPersonality('Alpha', {
        riskTolerance: 0.9,
        aggression: 0.9,
        bluffFrequency: 0.4,
        adaptability: 0.6,
        description: '激进的进攻者，喜欢高风险高回报'
    }),
    beta: new AIPersonality('Beta', {
        riskTolerance: 0.2,
        aggression: 0.2,
        bluffFrequency: 0.1,
        adaptability: 0.4,
        description: '保守的防守者，稳扎稳打'
    }),
    gamma: new AIPersonality('Gamma', {
        riskTolerance: 0.5,
        aggression: 0.5,
        bluffFrequency: 0.2,
        adaptability: 0.8,
        description: '均衡型选手，能根据局势调整策略'
    }),
    delta: new AIPersonality('Delta', {
        riskTolerance: 0.7,
        aggression: 0.6,
        bluffFrequency: 0.5,
        adaptability: 0.7,
        description: '狡猾的心理战专家，擅长虚张声势'
    }),
    epsilon: new AIPersonality('Epsilon', {
        riskTolerance: 0.3,
        aggression: 0.7,
        bluffFrequency: 0.3,
        adaptability: 0.5,
        description: '计算型选手，每一步都经过精确计算'
    }),
    zeta: new AIPersonality('Zeta', {
        riskTolerance: 0.6,
        aggression: 0.4,
        bluffFrequency: 0.3,
        adaptability: 0.6,
        description: '机会主义者，等待最佳时机'
    }),
    eta: new AIPersonality('Eta', {
        riskTolerance: 0.8,
        aggression: 0.8,
        bluffFrequency: 0.2,
        adaptability: 0.4,
        description: '狂暴的攻击者，从不防守'
    }),
    theta: new AIPersonality('Theta', {
        riskTolerance: 0.1,
        aggression: 0.1,
        bluffFrequency: 0.05,
        adaptability: 0.3,
        description: '极度保守，只打必胜的仗'
    }),
    iota: new AIPersonality('Iota', {
        riskTolerance: 0.4,
        aggression: 0.5,
        bluffFrequency: 0.25,
        adaptability: 0.9,
        description: '快速学习者，能迅速适应对手风格'
    }),
    kappa: new AIPersonality('Kappa', {
        riskTolerance: 0.7,
        aggression: 0.3,
        bluffFrequency: 0.4,
        adaptability: 0.5,
        description: '陷阱大师，诱导对手犯错'
    }),
    lambda: new AIPersonality('Lambda', {
        riskTolerance: 0.5,
        aggression: 0.8,
        bluffFrequency: 0.15,
        adaptability: 0.6,
        description: '冲锋型选手，不断施加压力'
    }),
    mu: new AIPersonality('Mu', {
        riskTolerance: 0.6,
        aggression: 0.6,
        bluffFrequency: 0.3,
        adaptability: 0.7,
        description: '全能型战士，无明显弱点'
    }),
    nu: new AIPersonality('Nu', {
        riskTolerance: 0.3,
        aggression: 0.4,
        bluffFrequency: 0.35,
        adaptability: 0.8,
        description: '伪装专家，让对手无法判断实力'
    }),
    xi: new AIPersonality('Xi', {
        riskTolerance: 0.8,
        aggression: 0.5,
        bluffFrequency: 0.2,
        adaptability: 0.4,
        description: '冒险家，享受不确定性的刺激'
    }),
    omicron: new AIPersonality('Omicron', {
        riskTolerance: 0.4,
        aggression: 0.3,
        bluffFrequency: 0.2,
        adaptability: 0.5,
        description: '耐心的猎人，等待致命一击'
    }),
    pi: new AIPersonality('Pi', {
        riskTolerance: 0.5,
        aggression: 0.7,
        bluffFrequency: 0.25,
        adaptability: 0.6,
        description: '数学天才，概率计算精准'
    }),
    rho: new AIPersonality('Rho', {
        riskTolerance: 0.6,
        aggression: 0.4,
        bluffFrequency: 0.3,
        adaptability: 0.5,
        description: '战术家，每一步都有深意'
    }),
    sigma: new AIPersonality('Sigma', {
        riskTolerance: 0.5,
        aggression: 0.5,
        bluffFrequency: 0.2,
        adaptability: 0.5,
        description: '标准型AI，平衡所有属性'
    })
};

class CardCounter {
    constructor(numDecks = 4) {
        this.numDecks = numDecks;
        this.reset();
    }

    reset() {
        // 追踪每种牌的数量
        this.remaining = {};
        for (const rank of RANKS) {
            this.remaining[rank] = this.numDecks * 4;
        }
        for (const suit of SUITS) {
            this.remaining[suit] = this.numDecks * 13;
        }
        this.totalRemaining = this.numDecks * 52;
    }

    seeCard(card) {
        if (this.remaining[card.rank] !== undefined) {
            this.remaining[card.rank]--;
        }
        if (this.remaining[card.suit] !== undefined) {
            this.remaining[card.suit]--;
        }
        this.totalRemaining--;
    }

    seeCards(cards) {
        for (const card of cards) {
            this.seeCard(card);
        }
    }

    // 计算某张牌或某类牌出现的概率
    getProbability(cardOrRank, suit = null) {
        if (suit) {
            // 特定牌的概率
            const rank = cardOrRank;
            return this.remaining[rank] / this.totalRemaining;
        } else if (SUITS.includes(cardOrRank)) {
            // 某个花色的概率
            return this.remaining[cardOrRank] / this.totalRemaining;
        } else {
            // 某个点数的概率
            return this.remaining[cardOrRank] / this.totalRemaining;
        }
    }

    // 计算匹配某张牌的概率
    getMatchProbability(topCard) {
        const rankProb = this.getProbability(topCard.rank);
        const suitProb = this.getProbability(topCard.suit);
        // 使用容斥原理
        return rankProb + suitProb - (rankProb * suitProb);
    }
}

class AIPlayer {
    constructor(id, personalityKey = 'sigma') {
        this.id = id;
        this.personality = AI_PERSONALITIES[personalityKey] || AI_PERSONALITIES.sigma;
        this.cardCounter = new CardCounter();
        this.memory = {
            opponentPositions: {},
            opponentPlayStyles: {},
            gameHistory: []
        };
        this.difficulty = 'normal';
    }

    setDifficulty(difficulty) {
        this.difficulty = difficulty;
        // 根据难度调整性格参数
        const multipliers = {
            easy: 0.5,
            normal: 1.0,
            hard: 1.2,
            expert: 1.5
        };
        const m = multipliers[difficulty] || 1.0;
        this.effectiveSkill = {
            cardCounting: Math.min(1, 0.3 * m),
            probability: Math.min(1, 0.5 * m),
            strategy: Math.min(1, 0.7 * m)
        };
    }

    updateGameState(gameState, myPlayerId) {
        this.gameState = gameState;
        this.myPlayerId = myPlayerId;
        
        const me = gameState.players.find(p => p.id === myPlayerId);
        this.myHand = me?.hand || [];
        this.myPosition = me?.position || 0;
        this.myLevel = me?.level || 0;
        this.topCard = gameState.topCard ? Card.fromJSON(gameState.topCard) : null;
        
        // 更新牌面计算
        if (this.topCard) {
            this.cardCounter.seeCard(this.topCard);
        }
        
        // 记忆对手信息
        for (const player of gameState.players) {
            if (player.id !== myPlayerId) {
                this.memory.opponentPositions[player.id] = {
                    position: player.position,
                    level: player.level,
                    handCount: player.handCount
                };
            }
        }
    }

    makeDecision() {
        // 获取可出的牌
        const playableCards = this.getPlayableCards();
        
        if (playableCards.length === 0) {
            return { action: 'draw', reason: 'no_playable_cards' };
        }

        if (playableCards.length === 1) {
            return { 
                action: 'play', 
                cardId: playableCards[0].id,
                reason: 'only_option'
            };
        }

        // 多牌可选，使用策略选择
        return this.selectBestCard(playableCards);
    }

    getPlayableCards() {
        if (!this.topCard) return this.myHand;
        return this.myHand.filter(card => 
            card.suit === this.topCard.suit || card.rank === this.topCard.rank
        );
    }

    selectBestCard(cards) {
        // 评估每张牌的得分
        const scoredCards = cards.map(card => ({
            card,
            score: this.evaluateCard(card)
        }));
        
        scoredCards.sort((a, b) => b.score - a.score);
        
        // 根据性格添加随机性
        const randomFactor = 1 - this.effectiveSkill.strategy;
        const topChoices = scoredCards.slice(0, Math.max(1, Math.floor(cards.length * 0.5)));
        
        if (Math.random() < randomFactor && topChoices.length > 1) {
            // 随机选择前几个中的一个（模拟错误）
            const randomIndex = Math.floor(Math.random() * topChoices.length);
            return {
                action: 'play',
                cardId: topChoices[randomIndex].card.id,
                reason: 'random_choice'
            };
        }
        
        return {
            action: 'play',
            cardId: scoredCards[0].card.id,
            reason: 'optimal_choice',
            expectedScore: scoredCards[0].score
        };
    }

    evaluateCard(card) {
        let score = 0;
        
        // 基础分值：牌面点数
        score += card.value * 2;
        
        // 距离塔顶的距离
        const stepsToTop = (13 - this.myLevel) * 10 - (this.myPosition % 10);
        
        // 如果这张牌能直接到达或超过塔顶，高分
        if (card.value >= stepsToTop) {
            score += 100;
        }
        
        // 评估怒气风险
        const guard = this.gameState.tower?.guards?.find(g => g.level === this.myLevel + Math.floor((this.myPosition % 10 + card.value) / 10) + 1);
        if (guard && !guard.defeated) {
            const rageRisk = guard.rageCards.some(rage => 
                rage.includes(card.suit) || rage.includes(card.rank)
            );
            if (rageRisk) {
                // 根据性格决定如何处理怒气
                if (this.personality.riskTolerance > 0.7) {
                    score += 20; // 激进派无视风险
                } else if (this.personality.riskTolerance < 0.3) {
                    score -= 50; // 保守派避开风险
                } else {
                    score -= 20;
                }
            }
        }
        
        // 考虑对手位置 - 如果有人快赢了，更激进
        const maxOpponentLevel = Math.max(
            ...Object.values(this.memory.opponentPositions).map(p => p.level),
            0
        );
        if (maxOpponentLevel >= 11) {
            score += this.personality.aggression * 30;
        }
        
        // 牌面计算 - 如果某种牌快没了，保留那种花色的牌
        if (this.effectiveSkill.cardCounting > 0.5) {
            const suitRemaining = this.cardCounter.remaining[card.suit];
            const rankRemaining = this.cardCounter.remaining[card.rank];
            
            if (suitRemaining < 5) {
                score += 10; // 稀缺花色加分
            }
            if (rankRemaining < 3) {
                score += 15; // 稀缺点数加分
            }
        }
        
        // 保留大牌在手
        if (card.value >= 10 && stepsToTop > card.value) {
            score -= 5; // 暂时用不上时，稍微降低大牌优先级
        }
        
        return score;
    }

    // 模拟 "思考" 时间
    async think() {
        const baseTime = 1000;
        const randomTime = Math.random() * 2000;
        const difficultyTime = this.difficulty === 'expert' ? 500 : 0;
        
        await new Promise(resolve => 
            setTimeout(resolve, baseTime + randomTime + difficultyTime)
        );
    }

    getInfo() {
        return {
            id: this.id,
            personality: this.personality.name,
            description: this.personality.description,
            difficulty: this.difficulty,
            stats: {
                riskTolerance: this.personality.riskTolerance,
                aggression: this.personality.aggression,
                adaptability: this.personality.adaptability
            }
        };
    }
}

// AI 管理器
class AIManager {
    constructor() {
        this.aiPlayers = new Map();
        this.availablePersonalities = Object.keys(AI_PERSONALITIES);
    }

    createAI(personalityKey = null) {
        const id = 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        
        if (!personalityKey) {
            // 随机选择性格
            personalityKey = this.availablePersonalities[
                Math.floor(Math.random() * this.availablePersonalities.length)
            ];
        }
        
        const ai = new AIPlayer(id, personalityKey);
        this.aiPlayers.set(id, ai);
        
        return {
            id,
            ai,
            info: ai.getInfo()
        };
    }

    removeAI(id) {
        return this.aiPlayers.delete(id);
    }

    getAI(id) {
        return this.aiPlayers.get(id);
    }

    getAllAIs() {
        return Array.from(this.aiPlayers.values()).map(ai => ai.getInfo());
    }

    // 创建特定数量的AI
    createAIs(count, difficulty = 'normal') {
        const ais = [];
        for (let i = 0; i < count; i++) {
            const ai = this.createAI();
            ai.ai.setDifficulty(difficulty);
            ais.push(ai);
        }
        return ais;
    }
}

module.exports = {
    AIPlayer,
    AIManager,
    CardCounter,
    AI_PERSONALITIES,
    AIPersonality
};
