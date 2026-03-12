/**
 * 命运塔 - 游戏服务器
 * Tower of Fate Game Server
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const winston = require('winston');
require('dotenv').config();

const { GameEngine } = require('./game/core/GameEngine');
const { AIManager } = require('./ai/AIPlayer');
const { TournamentManager } = require('./game/modes/Tournament');
const PaymentWallet = require('./blockchain/payments/MultiChainPayment');

// 配置日志
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

class TowerOfFateServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: process.env.CLIENT_URL || "*",
                methods: ["GET", "POST"]
            },
            pingTimeout: 60000,
            pingInterval: 25000
        });
        
        this.games = new Map();
        this.players = new Map();
        this.aiManager = new AIManager();
        this.tournamentManager = new TournamentManager();
        this.paymentWallet = new PaymentWallet();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
    }

    setupMiddleware() {
        // 安全中间件
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                }
            }
        }));
        
        this.app.use(cors());
        this.app.use(compression());
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.static('public'));
        
        // 限流
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15分钟
            max: 100, // 限制100次请求
            message: { error: '请求过于频繁，请稍后再试' }
        });
        this.app.use('/api/', limiter);
    }

    setupRoutes() {
        // 健康检查
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                version: '1.3.12',
                timestamp: new Date().toISOString(),
                games: this.games.size,
                players: this.players.size
            });
        });

        // 获取游戏列表
        this.app.get('/api/games', (req, res) => {
            const gameList = Array.from(this.games.values())
                .filter(g => g.state === 'waiting' || g.state === 'ready')
                .map(g => ({
                    id: g.id,
                    state: g.state,
                    players: g.players.size,
                    maxPlayers: g.config.maxPlayers
                }));
            res.json(gameList);
        });

        // 获取锦标赛列表
        this.app.get('/api/tournaments', (req, res) => {
            const tournaments = this.tournamentManager.getActiveTournaments();
            res.json(tournaments);
        });

        // 获取国家列表
        this.app.get('/api/countries', (req, res) => {
            res.json(this.tournamentManager.getCountries());
        });

        // 获取赛季信息
        this.app.get('/api/season', (req, res) => {
            res.json(this.tournamentManager.getSeasonInfo());
        });

        // 创建充值订单
        this.app.post('/api/payment/deposit', async (req, res) => {
            try {
                const { userId, currency, amount } = req.body;
                const order = await this.paymentWallet.createDepositOrder(userId, currency, amount);
                res.json(order);
            } catch (error) {
                logger.error('Create deposit error:', error);
                res.status(400).json({ error: error.message });
            }
        });

        // 验证充值
        this.app.post('/api/payment/verify', async (req, res) => {
            try {
                const { orderId, txHash } = req.body;
                // 这里应该从数据库获取订单
                const result = await this.paymentWallet.verifyDeposit({ orderId, currency: 'usdt' }, txHash);
                res.json(result);
            } catch (error) {
                logger.error('Verify deposit error:', error);
                res.status(400).json({ error: error.message });
            }
        });

        // 获取支持的货币和汇率
        this.app.get('/api/payment/rates', async (req, res) => {
            try {
                const rates = await this.paymentWallet.getExchangeRates();
                res.json(rates);
            } catch (error) {
                logger.error('Get rates error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // 获取AI列表
        this.app.get('/api/ai/personalities', (req, res) => {
            const { AI_PERSONALITIES } = require('./ai/AIPlayer');
            res.json(Object.entries(AI_PERSONALITIES).map(([key, p]) => ({
                key,
                name: p.name,
                description: p.description,
                stats: {
                    riskTolerance: p.riskTolerance,
                    aggression: p.aggression,
                    adaptability: p.adaptability
                }
            })));
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            logger.info(`Player connected: ${socket.id}`);
            
            // 玩家登录
            socket.on('login', (data, callback) => {
                const player = {
                    id: socket.id,
                    name: data.name || `Player_${socket.id.substr(0, 6)}`,
                    country: data.country,
                    avatar: data.avatar,
                    socket: socket,
                    status: 'online',
                    joinedAt: new Date()
                };
                
                this.players.set(socket.id, player);
                callback({ success: true, playerId: socket.id });
                
                logger.info(`Player logged in: ${player.name}`);
            });

            // 创建游戏
            socket.on('create_game', (config, callback) => {
                try {
                    const game = new GameEngine({
                        maxPlayers: config.maxPlayers || 4,
                        numDecks: config.numDecks || 4,
                        winCondition: config.winCondition || 'first_to_top'
                    });
                    
                    this.games.set(game.id, game);
                    
                    // 监听游戏事件并广播
                    this.setupGameEventHandlers(game);
                    
                    callback({ success: true, gameId: game.id });
                    logger.info(`Game created: ${game.id}`);
                } catch (error) {
                    callback({ success: false, error: error.message });
                }
            });

            // 加入游戏
            socket.on('join_game', (data, callback) => {
                const game = this.games.get(data.gameId);
                if (!game) {
                    callback({ success: false, error: '游戏不存在' });
                    return;
                }
                
                const player = this.players.get(socket.id);
                if (!player) {
                    callback({ success: false, error: '请先登录' });
                    return;
                }
                
                try {
                    game.addPlayer(socket.id, player.name);
                    socket.join(data.gameId);
                    
                    // 通知其他玩家
                    socket.to(data.gameId).emit('player_joined', {
                        playerId: socket.id,
                        name: player.name
                    });
                    
                    callback({ 
                        success: true, 
                        gameState: game.getGameState(socket.id)
                    });
                    
                    logger.info(`Player ${player.name} joined game ${data.gameId}`);
                } catch (error) {
                    callback({ success: false, error: error.message });
                }
            });

            // 添加AI玩家
            socket.on('add_ai', (data, callback) => {
                const game = this.games.get(data.gameId);
                if (!game) {
                    callback({ success: false, error: '游戏不存在' });
                    return;
                }
                
                try {
                    const ai = this.aiManager.createAI(data.personality);
                    game.addPlayer(ai.id, `${ai.info.personality}_${ai.id.substr(-4)}`, true);
                    
                    callback({ success: true, ai: ai.info });
                    logger.info(`AI added to game ${data.gameId}: ${ai.info.personality}`);
                } catch (error) {
                    callback({ success: false, error: error.message });
                }
            });

            // 开始游戏
            socket.on('start_game', (data, callback) => {
                const game = this.games.get(data.gameId);
                if (!game) {
                    callback({ success: false, error: '游戏不存在' });
                    return;
                }
                
                try {
                    game.start();
                    callback({ success: true });
                    logger.info(`Game started: ${data.gameId}`);
                } catch (error) {
                    callback({ success: false, error: error.message });
                }
            });

            // 出牌
            socket.on('play_card', (data, callback) => {
                const game = this.games.get(data.gameId);
                if (!game) {
                    callback({ success: false, error: '游戏不存在' });
                    return;
                }
                
                try {
                    game.playCard(socket.id, data.cardId);
                    callback({ success: true });
                } catch (error) {
                    callback({ success: false, error: error.message });
                }
            });

            // 获取游戏状态
            socket.on('get_game_state', (data, callback) => {
                const game = this.games.get(data.gameId);
                if (!game) {
                    callback({ success: false, error: '游戏不存在' });
                    return;
                }
                
                callback({ success: true, state: game.getGameState(socket.id) });
            });

            // 离开游戏
            socket.on('leave_game', (data, callback) => {
                const game = this.games.get(data.gameId);
                if (game) {
                    game.removePlayer(socket.id);
                    socket.leave(data.gameId);
                    
                    // 如果游戏为空，删除游戏
                    if (game.players.size === 0) {
                        this.games.delete(data.gameId);
                    }
                }
                
                callback({ success: true });
                logger.info(`Player left game ${data.gameId}`);
            });

            // 投降
            socket.on('surrender', (data, callback) => {
                const game = this.games.get(data.gameId);
                if (game) {
                    game.surrender(socket.id);
                }
                callback({ success: true });
            });

            // 断开连接
            socket.on('disconnect', () => {
                logger.info(`Player disconnected: ${socket.id}`);
                
                const player = this.players.get(socket.id);
                if (player) {
                    // 从所有游戏中移除
                    for (const [gameId, game] of this.games) {
                        if (game.players.has(socket.id)) {
                            game.removePlayer(socket.id);
                            
                            if (game.players.size === 0) {
                                this.games.delete(gameId);
                            }
                        }
                    }
                    
                    this.players.delete(socket.id);
                }
            });
        });
    }

    setupGameEventHandlers(game) {
        game.on('game_started', (data) => {
            this.io.to(data.gameId).emit('game_started', data);
        });

        game.on('turn_started', (data) => {
            this.io.to(data.gameId).emit('turn_started', data);
            
            // 如果是AI的回合，自动执行
            const player = game.getCurrentPlayer();
            if (player?.isAI) {
                this.handleAITurn(game, player);
            }
        });

        game.on('card_played', (data) => {
            this.io.to(data.gameId).emit('card_played', data);
        });

        game.on('cards_drawn', (data) => {
            // 只通知该玩家
            const playerSocket = this.players.get(data.playerId)?.socket;
            if (playerSocket) {
                playerSocket.emit('cards_drawn', data);
            }
        });

        game.on('game_ended', (data) => {
            this.io.to(data.gameId).emit('game_ended', data);
        });

        game.on('player_disconnected', (data) => {
            this.io.to(data.gameId).emit('player_disconnected', data);
        });
    }

    async handleAITurn(game, aiPlayer) {
        const ai = this.aiManager.getAI(aiPlayer.id);
        if (!ai) return;
        
        // 模拟思考时间
        await ai.think();
        
        // 更新游戏状态
        ai.updateGameState(game.getGameState(aiPlayer.id), aiPlayer.id);
        
        // 做出决策
        const decision = ai.makeDecision();
        
        if (decision.action === 'play') {
            try {
                game.playCard(aiPlayer.id, decision.cardId);
            } catch (error) {
                logger.error(`AI play error: ${error.message}`);
            }
        }
    }

    start(port = process.env.PORT || 3000) {
        this.server.listen(port, () => {
            logger.info(`Tower of Fate Server V1.3.12 running on port ${port}`);
        });
    }
}

// 启动服务器
const server = new TowerOfFateServer();
server.start();

module.exports = TowerOfFateServer;
