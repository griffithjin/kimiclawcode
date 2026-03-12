# 命运塔·首登者 Tower of Fate V1.3.12

<p align="center">
  <img src="public/assets/logo.png" alt="Tower of Fate Logo" width="200"/>
</p>

<p align="center">
  <strong>Web4.0 下一代去中心化卡牌对战游戏平台</strong>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> •
  <a href="#游戏特色">游戏特色</a> •
  <a href="#支付系统">支付系统</a> •
  <a href="#锦标赛">锦标赛</a> •
  <a href="#部署指南">部署指南</a>
</p>

---

## 📊 核心数据

| 指标 | 数值 |
|------|------|
| **牌组** | 4副扑克牌 (208张) |
| **守卫** | 13个层级守卫 + 怒气牌机制 |
| **AI玩家** | 18个智能系统玩家 |
| **锦标赛** | 196个国家/地区 |
| **加密货币** | USDT/BNB/ETH/SOL/BTC/OKB |
| **区块链** | TRON/BSC/ETH/SOL/BTC |

---

## 🎮 游戏特色

### 核心玩法
- **208张牌**: 4副完整扑克牌，策略深度无限
- **13层塔楼**: 每层有独特守卫，阻挡玩家登顶
- **怒气系统**: 守卫怒气牌会击退玩家，增加策略性
- **首位登顶**: 率先到达塔顶的玩家获胜

### 游戏模式
| 模式 | 说明 | 人数 |
|------|------|------|
| **单人乱斗** | 4人自由对战 | 4P |
| **团队竞技** | 1v2, 2v2, 2v3, 3v3 | 3-6P |
| **连闯模式** | 使用半副牌(104张)速战速决 | 2-4P |
| **锦标赛** | 全球排名赛，赢取限定奖励 | 千人同赛 |

---

## 💰 支付系统

### 支持的加密货币

| 币种 | 网络 | 合约地址/钱包 |
|------|------|--------------|
| **USDT** | TRC20 | `TUKf5QXj8nvNhsqy2va8gCnRoG77wKVwwC` |
| **BNB** | BEP20 | `0x6b107f2a17f218df01367f94c4a77758ba9cb4df` |
| **ETH** | ERC20 | `0x6b107f2a17f218df01367f94c4a77758ba9cb4df` |
| **SOL** | Solana | `BYQsmcAq16BQ1K7CUphfuQJephJrDNbm3NVXtsLG6tyN` |
| **BTC** | Taproot | `bc1pnjg9z5el0xt3uzm82symufy3lm56x82vg75dv7xm4eqvvec6j45sx9xzs0` |
| **OKB** | OKTC | 支持中 |

### Web4.0 钱包集成
- 🔐 多链钱包一键连接
- ⚡ 实时到账确认
- 🛡️ 智能合约托管
- 💎 NFT 塔楼资产交易

---

## 🏆 锦标赛系统

### 全球排名赛
- **196个国家/地区**同步竞技
- **赛季制**排名体系
- **实时积分榜**

### 奖励机制
| 排名 | 奖励 |
|------|------|
| 🥇 冠军 | 黄金明信片 + 限定NFT塔楼 |
| 🥈 亚军 | 白银明信片 + 稀有道具 |
| 🥉 季军 | 青铜明信片 + 游戏代币 |
| Top 100 | 赛季限定奖励 |

---

## 🤖 AI玩家系统

### 18位智能对手
每个AI都有独特的性格和策略：

| AI名称 | 性格 | 特长 |
|--------|------|------|
| **Alpha** | 激进 | 高风险高回报 |
| **Beta** | 保守 | 稳扎稳打 |
| **Gamma** | 均衡 | 适应性强 |
| **Delta** | 狡猾 | 心理战术 |
| ... | ... | ... |

### 智能算法
- 🧮 实时牌面计算
- 📊 概率分析引擎
- 🎯 自适应难度调整
- 🔄 机器学习进化

---

## 🚀 快速开始

### 环境要求
```bash
Node.js >= 18.0.0
npm >= 9.0.0
Redis >= 6.0
PostgreSQL >= 14.0
```

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/griffithjin/kimiclawcode.git
cd kimiclawcode

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入配置

# 4. 初始化数据库
npm run db:migrate
npm run db:seed

# 5. 启动开发服务器
npm run dev

# 6. 访问游戏
open http://localhost:3000
```

---

## 🐳 Docker 部署

### 快速部署
```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 生产部署
```bash
# 使用部署脚本
./scripts/deploy-production.sh
```

---

## 📁 项目结构

```
kimiclawcode/
├── src/
│   ├── game/           # 游戏核心逻辑
│   ├── blockchain/     # 区块链交互
│   ├── ai/             # AI玩家系统
│   ├── api/            # API接口
│   └── admin/          # 后台管理
├── public/             # 静态资源
│   ├── assets/         # 图片、音频
│   ├── cards/          # 卡牌资源
│   └── towers/         # 塔楼资源
├── contracts/          # 智能合约
├── tests/              # 测试用例
├── docs/               # 文档
├── scripts/            # 部署脚本
└── deploy/             # 部署配置
```

---

## 🔐 安全配置

- ✅ JWT Token 认证
- ✅ 双因素认证(2FA)
- ✅ 请求频率限制
- ✅ SQL注入防护
- ✅ XSS攻击防护
- ✅ 智能合约审计

---

## 📈 性能指标

| 指标 | 目标 |
|------|------|
| 延迟 | < 50ms |
| 并发 | 10,000+ |
| 可用性 | 99.99% |
| 交易确认 | < 3s |

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

---

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)

---

<p align="center">
  <strong>命运由你掌控 | Fate is in Your Hands</strong>
</p>

<p align="center">
  <sub>Built with ❤️ by Kimiclaw Team</sub>
</p>
