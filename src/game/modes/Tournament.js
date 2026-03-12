/**
 * 命运塔 - 全球锦标赛系统
 * Tower of Fate Tournament System
 * 
 * 196个国家/地区排名赛
 * 赛季制、实时积分榜、限定奖励
 */

const EventEmitter = require('events');

class Tournament extends EventEmitter {
    constructor(config) {
        super();
        this.id = config.id || `tour_${Date.now()}`;
        this.name = config.name;
        this.type = config.type || 'global'; // global, regional, seasonal
        this.startTime = config.startTime;
        this.endTime = config.endTime;
        this.region = config.region || 'global';
        this.country = config.country || null;
        
        this.config = {
            minPlayers: config.minPlayers || 100,
            maxPlayers: config.maxPlayers || 10000,
            entryFee: config.entryFee || 0, // 报名费（游戏币）
            prizePool: config.prizePool || { fate: 1000000, nfts: [] },
            format: config.format || 'swiss', // swiss, elimination, round_robin
            rounds: config.rounds || 7,
            timeLimit: config.timeLimit || 300, // 每局时间限制（秒）
            ...config
        };
        
        this.state = 'registering'; // registering, ongoing, completed, cancelled
        this.participants = new Map();
        this.matches = new Map();
        this.standings = [];
        this.currentRound = 0;
        this.rewards = config.rewards || this.generateDefaultRewards();
    }

    generateDefaultRewards() {
        return {
            gold: {
                rank: 1,
                title: '冠军',
                rewards: {
                    fate: 300000,
                    postcards: ['gold_champion'],
                    nfts: ['tower_legendary_001'],
                    badges: ['world_champion']
                }
            },
            silver: {
                rank: 2,
                title: '亚军',
                rewards: {
                    fate: 150000,
                    postcards: ['silver_runner_up'],
                    nfts: ['tower_epic_001'],
                    badges: ['world_runner_up']
                }
            },
            bronze: {
                rank: 3,
                title: '季军',
                rewards: {
                    fate: 75000,
                    postcards: ['bronze_third'],
                    nfts: ['tower_rare_001'],
                    badges: ['world_third']
                }
            },
            top10: {
                rankRange: [4, 10],
                title: '十强',
                rewards: {
                    fate: 30000,
                    postcards: ['top10_master'],
                    badges: ['world_top10']
                }
            },
            top100: {
                rankRange: [11, 100],
                title: '百强',
                rewards: {
                    fate: 5000,
                    postcards: ['top100_elite'],
                    badges: ['world_top100']
                }
            },
            participant: {
                rankRange: [101, Infinity],
                title: '参与奖',
                rewards: {
                    fate: 500,
                    badges: ['tournament_participant']
                }
            }
        };
    }

    registerPlayer(playerId, playerInfo) {
        if (this.state !== 'registering') {
            throw new Error('报名已截止');
        }
        
        if (this.participants.has(playerId)) {
            throw new Error('已报名该赛事');
        }
        
        if (this.participants.size >= this.config.maxPlayers) {
            throw new Error('报名人数已满');
        }
        
        const participant = {
            playerId,
            name: playerInfo.name,
            country: playerInfo.country,
            region: playerInfo.region,
            avatar: playerInfo.avatar,
            rating: playerInfo.rating || 1000,
            registeredAt: new Date(),
            status: 'registered', // registered, playing, eliminated, completed
            stats: {
                wins: 0,
                losses: 0,
                draws: 0,
                score: 0,
                buchholz: 0, // 对手分（瑞士制）
                sonneborn: 0 // 胜对手分
            },
            matches: []
        };
        
        this.participants.set(playerId, participant);
        
        this.emit('player_registered', {
            tournamentId: this.id,
            player: participant
        });
        
        return participant;
    }

    unregisterPlayer(playerId) {
        if (this.state !== 'registering') {
            throw new Error('无法取消报名');
        }
        
        const removed = this.participants.delete(playerId);
        
        if (removed) {
            this.emit('player_unregistered', {
                tournamentId: this.id,
                playerId
            });
        }
        
        return removed;
    }

    start() {
        if (this.participants.size < this.config.minPlayers) {
            throw new Error(`报名人数不足，至少需要 ${this.config.minPlayers} 人`);
        }
        
        this.state = 'ongoing';
        this.currentRound = 1;
        
        // 生成第一轮对阵
        this.generateRound();
        
        this.emit('tournament_started', {
            tournamentId: this.id,
            totalPlayers: this.participants.size,
            rounds: this.config.rounds
        });
        
        return true;
    }

    generateRound() {
        const players = Array.from(this.participants.values())
            .filter(p => p.status !== 'eliminated')
            .sort((a, b) => {
                // 先按积分排序，积分相同按对手分排序
                if (b.stats.score !== a.stats.score) {
                    return b.stats.score - a.stats.score;
                }
                return b.stats.buchholz - a.stats.buchholz;
            });

        const matches = [];
        const used = new Set();

        // 瑞士制配对算法（简化版）
        for (let i = 0; i < players.length; i++) {
            if (used.has(players[i].playerId)) continue;
            
            let opponent = null;
            
            // 找积分相近且未交手过的对手
            for (let j = i + 1; j < players.length; j++) {
                if (used.has(players[j].playerId)) continue;
                
                // 检查是否已经交手过
                const alreadyPlayed = players[i].matches.some(m => 
                    m.opponentId === players[j].playerId
                );
                
                if (!alreadyPlayed) {
                    opponent = players[j];
                    break;
                }
            }
            
            if (opponent) {
                const match = this.createMatch(players[i], opponent);
                matches.push(match);
                used.add(players[i].playerId);
                used.add(opponent.playerId);
            } else {
                // 轮空
                players[i].stats.score += 1; // 轮空得1分
                players[i].matches.push({
                    round: this.currentRound,
                    opponentId: null,
                    result: 'bye',
                    score: 1
                });
            }
        }
        
        return matches;
    }

    createMatch(player1, player2) {
        const matchId = `match_${this.id}_r${this.currentRound}_${player1.playerId}_${player2.playerId}`;
        
        const match = {
            id: matchId,
            tournamentId: this.id,
            round: this.currentRound,
            player1: {
                id: player1.playerId,
                name: player1.name,
                rating: player1.rating
            },
            player2: {
                id: player2.playerId,
                name: player2.name,
                rating: player2.rating
            },
            status: 'pending', // pending, ongoing, completed
            result: null,
            startTime: null,
            endTime: null,
            gameId: null
        };
        
        this.matches.set(matchId, match);
        
        return match;
    }

    submitMatchResult(matchId, result) {
        const match = this.matches.get(matchId);
        if (!match) {
            throw new Error('比赛不存在');
        }
        
        if (match.status === 'completed') {
            throw new Error('比赛已完成');
        }
        
        match.result = result;
        match.status = 'completed';
        match.endTime = new Date();
        
        // 更新选手统计
        const player1 = this.participants.get(match.player1.id);
        const player2 = this.participants.get(match.player2.id);
        
        if (result.winner === match.player1.id) {
            player1.stats.wins++;
            player1.stats.score += 2; // 胜利得2分
            player2.stats.losses++;
        } else if (result.winner === match.player2.id) {
            player2.stats.wins++;
            player2.stats.score += 2;
            player1.stats.losses++;
        } else {
            // 平局
            player1.stats.draws++;
            player2.stats.draws++;
            player1.stats.score += 1;
            player2.stats.score += 1;
        }
        
        player1.matches.push({
            round: this.currentRound,
            opponentId: match.player2.id,
            result: result.winner === match.player1.id ? 'win' : 
                    result.winner === null ? 'draw' : 'loss',
            score: result.winner === match.player1.id ? 2 : 
                   result.winner === null ? 1 : 0
        });
        
        player2.matches.push({
            round: this.currentRound,
            opponentId: match.player1.id,
            result: result.winner === match.player2.id ? 'win' : 
                    result.winner === null ? 'draw' : 'loss',
            score: result.winner === match.player2.id ? 2 : 
                   result.winner === null ? 1 : 0
        });
        
        // 检查是否所有比赛都完成了
        const roundMatches = Array.from(this.matches.values())
            .filter(m => m.round === this.currentRound);
        const allCompleted = roundMatches.every(m => m.status === 'completed');
        
        if (allCompleted) {
            this.completeRound();
        }
        
        this.emit('match_completed', {
            tournamentId: this.id,
            matchId,
            result
        });
        
        return match;
    }

    completeRound() {
        // 计算对手分
        this.calculateBuchholz();
        
        if (this.currentRound >= this.config.rounds) {
            this.completeTournament();
        } else {
            this.currentRound++;
            this.generateRound();
            
            this.emit('round_completed', {
                tournamentId: this.id,
                round: this.currentRound - 1,
                nextRound: this.currentRound
            });
        }
    }

    calculateBuchholz() {
        // 计算每个选手的对手分（所有对手的积分之和）
        for (const player of this.participants.values()) {
            let buchholz = 0;
            for (const match of player.matches) {
                if (match.opponentId) {
                    const opponent = this.participants.get(match.opponentId);
                    if (opponent) {
                        buchholz += opponent.stats.score;
                    }
                }
            }
            player.stats.buchholz = buchholz;
        }
    }

    completeTournament() {
        this.state = 'completed';
        this.endTime = new Date();
        
        // 最终排名
        this.standings = Array.from(this.participants.values())
            .sort((a, b) => {
                if (b.stats.score !== a.stats.score) {
                    return b.stats.score - a.stats.score;
                }
                if (b.stats.buchholz !== a.stats.buchholz) {
                    return b.stats.buchholz - a.stats.buchholz;
                }
                return b.stats.wins - a.stats.wins;
            })
            .map((p, index) => ({
                rank: index + 1,
                playerId: p.playerId,
                name: p.name,
                country: p.country,
                stats: p.stats,
                rewards: this.calculateRewards(index + 1)
            }));
        
        this.emit('tournament_completed', {
            tournamentId: this.id,
            standings: this.standings.slice(0, 100),
            top3: this.standings.slice(0, 3)
        });
    }

    calculateRewards(rank) {
        if (rank === 1) return this.rewards.gold;
        if (rank === 2) return this.rewards.silver;
        if (rank === 3) return this.rewards.bronze;
        if (rank <= 10) return this.rewards.top10;
        if (rank <= 100) return this.rewards.top100;
        return this.rewards.participant;
    }

    getStandings(page = 1, pageSize = 50) {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return {
            total: this.standings.length,
            page,
            pageSize,
            standings: this.standings.slice(start, end)
        };
    }

    getPlayerStanding(playerId) {
        const index = this.standings.findIndex(s => s.playerId === playerId);
        if (index >= 0) {
            const standing = this.standings[index];
            // 附近排名
            const nearbyStart = Math.max(0, index - 2);
            const nearbyEnd = Math.min(this.standings.length, index + 3);
            
            return {
                ...standing,
                nearby: this.standings.slice(nearbyStart, nearbyEnd)
            };
        }
        return null;
    }

    getInfo() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            state: this.state,
            region: this.region,
            country: this.country,
            config: this.config,
            participants: this.participants.size,
            currentRound: this.currentRound,
            startTime: this.startTime,
            endTime: this.endTime,
            rewards: this.rewards
        };
    }
}

// 锦标赛管理器
class TournamentManager {
    constructor() {
        this.tournaments = new Map();
        this.countryList = this.loadCountryList();
        this.seasonSchedule = this.generateSeasonSchedule();
    }

    loadCountryList() {
        // 196个国家/地区
        return [
            { code: 'CN', name: '中国', nameEn: 'China', region: 'Asia' },
            { code: 'US', name: '美国', nameEn: 'United States', region: 'North America' },
            { code: 'JP', name: '日本', nameEn: 'Japan', region: 'Asia' },
            { code: 'DE', name: '德国', nameEn: 'Germany', region: 'Europe' },
            { code: 'GB', name: '英国', nameEn: 'United Kingdom', region: 'Europe' },
            { code: 'FR', name: '法国', nameEn: 'France', region: 'Europe' },
            { code: 'IN', name: '印度', nameEn: 'India', region: 'Asia' },
            { code: 'IT', name: '意大利', nameEn: 'Italy', region: 'Europe' },
            { code: 'BR', name: '巴西', nameEn: 'Brazil', region: 'South America' },
            { code: 'CA', name: '加拿大', nameEn: 'Canada', region: 'North America' },
            { code: 'RU', name: '俄罗斯', nameEn: 'Russia', region: 'Europe' },
            { code: 'KR', name: '韩国', nameEn: 'South Korea', region: 'Asia' },
            { code: 'AU', name: '澳大利亚', nameEn: 'Australia', region: 'Oceania' },
            { code: 'ES', name: '西班牙', nameEn: 'Spain', region: 'Europe' },
            { code: 'MX', name: '墨西哥', nameEn: 'Mexico', region: 'North America' },
            { code: 'ID', name: '印度尼西亚', nameEn: 'Indonesia', region: 'Asia' },
            { code: 'NL', name: '荷兰', nameEn: 'Netherlands', region: 'Europe' },
            { code: 'SA', name: '沙特阿拉伯', nameEn: 'Saudi Arabia', region: 'Asia' },
            { code: 'TR', name: '土耳其', nameEn: 'Turkey', region: 'Europe' },
            { code: 'TW', name: '中国台湾', nameEn: 'Taiwan', region: 'Asia' },
            // ... 更多国家
        ];
    }

    generateSeasonSchedule() {
        const now = new Date();
        const year = now.getFullYear();
        
        return {
            season: `${year} S1`,
            startDate: new Date(year, 0, 1),
            endDate: new Date(year, 5, 30),
            nextSeason: `${year} S2`,
            majorTournaments: [
                {
                    name: '全球总决赛',
                    date: new Date(year, 11, 15),
                    prizePool: { fate: 10000000, usd: 100000 }
                },
                {
                    name: '亚洲锦标赛',
                    date: new Date(year, 3, 15),
                    region: 'Asia'
                },
                {
                    name: '欧洲锦标赛',
                    date: new Date(year, 5, 15),
                    region: 'Europe'
                },
                {
                    name: '美洲锦标赛',
                    date: new Date(year, 7, 15),
                    region: 'Americas'
                }
            ]
        };
    }

    createTournament(config) {
        const tournament = new Tournament(config);
        this.tournaments.set(tournament.id, tournament);
        
        return tournament;
    }

    getTournament(id) {
        return this.tournaments.get(id);
    }

    getActiveTournaments() {
        return Array.from(this.tournaments.values())
            .filter(t => t.state === 'registering' || t.state === 'ongoing')
            .map(t => t.getInfo());
    }

    getTournamentsByCountry(countryCode) {
        return Array.from(this.tournaments.values())
            .filter(t => t.country === countryCode || t.region === 'global')
            .map(t => t.getInfo());
    }

    getCountries() {
        return this.countryList;
    }

    getSeasonInfo() {
        return this.seasonSchedule;
    }
}

module.exports = {
    Tournament,
    TournamentManager
};
