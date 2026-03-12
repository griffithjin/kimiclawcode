/**
 * Web4.0 多链支付系统
 * Multi-Chain Payment System
 * 
 * 支持：USDT(TRC20)、BNB(BEP20)、ETH(ERC20)、SOL、BTC(Taproot)、OKB
 */

const TronWeb = require('tronweb');
const { ethers } = require('ethers');
const solanaWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const axios = require('axios');
const crypto = require('crypto');

class PaymentWallet {
    constructor() {
        this.addresses = {
            usdt: 'TUKf5QXj8nvNhsqy2va8gCnRoG77wKVwwC',      // TRC20
            bnb: '0x6b107f2a17f218df01367f94c4a77758ba9cb4df',   // BEP20
            eth: '0x6b107f2a17f218df01367f94c4a77758ba9cb4df',   // ERC20
            sol: 'BYQsmcAq16BQ1K7CUphfuQJephJrDNbm3NVXtsLG6tyN',  // Solana
            btc: 'bc1pnjg9z5el0xt3uzm82symufy3lm56x82vg75dv7xm4eqvvec6j45sx9xzs0' // Taproot
        };
        
        this.networks = {
            tron: {
                name: 'TRON',
                chainId: null,
                rpc: 'https://api.trongrid.io',
                explorer: 'https://tronscan.org/#/transaction/'
            },
            bsc: {
                name: 'BSC',
                chainId: 56,
                rpc: 'https://bsc-dataseed.binance.org',
                explorer: 'https://bscscan.com/tx/'
            },
            ethereum: {
                name: 'Ethereum',
                chainId: 1,
                rpc: 'https://mainnet.infura.io/v3/YOUR_KEY',
                explorer: 'https://etherscan.io/tx/'
            },
            solana: {
                name: 'Solana',
                chainId: null,
                rpc: 'https://api.mainnet-beta.solana.com',
                explorer: 'https://solscan.io/tx/'
            },
            bitcoin: {
                name: 'Bitcoin',
                chainId: null,
                rpc: null, // 使用区块浏览器API
                explorer: 'https://mempool.space/tx/'
            }
        };
        
        this.tokens = {
            usdt: {
                symbol: 'USDT',
                name: 'Tether USD',
                decimals: 6,
                contract: {
                    tron: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
                    bsc: '0x55d398326f99059fF775485246999027B3197955',
                    ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
                }
            },
            bnb: {
                symbol: 'BNB',
                name: 'BNB',
                decimals: 18,
                isNative: true
            },
            eth: {
                symbol: 'ETH',
                name: 'Ethereum',
                decimals: 18,
                isNative: true
            },
            sol: {
                symbol: 'SOL',
                name: 'Solana',
                decimals: 9,
                isNative: true
            },
            btc: {
                symbol: 'BTC',
                name: 'Bitcoin',
                decimals: 8,
                isNative: true
            },
            okb: {
                symbol: 'OKB',
                name: 'OKB',
                decimals: 18,
                contract: {
                    ethereum: '0x75231F58b43240C9718Dd58b4967c5114342a86c'
                }
            }
        };
        
        // 初始化 TronWeb
        this.tronWeb = new TronWeb({
            fullHost: this.networks.tron.rpc,
            headers: { "TRON-PRO-API-KEY": process.env.TRON_API_KEY }
        });
        
        // 初始化 providers
        this.providers = {
            bsc: new ethers.JsonRpcProvider(this.networks.bsc.rpc),
            ethereum: new ethers.JsonRpcProvider(this.networks.ethereum.rpc),
            solana: new solanaWeb3.Connection(this.networks.solana.rpc)
        };
    }

    /**
     * 生成充值订单
     */
    async createDepositOrder(userId, currency, amount) {
        const orderId = `DEP_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        const order = {
            orderId,
            userId,
            type: 'deposit',
            currency: currency.toLowerCase(),
            amount: parseFloat(amount),
            address: this.addresses[currency.toLowerCase()],
            status: 'pending',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟过期
            network: this.getNetwork(currency),
            confirmations: 0,
            requiredConfirmations: this.getRequiredConfirmations(currency),
            txHash: null
        };
        
        return order;
    }

    /**
     * 检查 TRON USDT 交易
     */
    async checkTronTransaction(txHash) {
        try {
            const tx = await this.tronWeb.trx.getTransaction(txHash);
            const txInfo = await this.tronWeb.trx.getTransactionInfo(txHash);
            
            if (!tx || !txInfo) return null;
            
            // 解析合约调用
            const contractAddress = tx.raw_data.contract[0].parameter.value.contract_address;
            const usdtContract = this.tokens.usdt.contract.tron;
            
            if (contractAddress !== usdtContract) {
                return { valid: false, reason: 'not_usdt_transfer' };
            }
            
            const block = await this.tronWeb.trx.getBlock(txInfo.blockNumber);
            const confirmations = (await this.tronWeb.trx.getCurrentBlock()).block_header.raw_data.number - txInfo.blockNumber;
            
            return {
                valid: true,
                from: tx.raw_data.contract[0].parameter.value.owner_address,
                to: tx.raw_data.contract[0].parameter.value.to_address,
                amount: tx.raw_data.contract[0].parameter.value.amount / 1e6,
                confirmations,
                timestamp: block.block_header.raw_data.timestamp
            };
        } catch (error) {
            console.error('Error checking TRON tx:', error);
            return null;
        }
    }

    /**
     * 检查 BSC/BEP20 交易
     */
    async checkBscTransaction(txHash) {
        try {
            const tx = await this.providers.bsc.getTransaction(txHash);
            const receipt = await this.providers.bsc.getTransactionReceipt(txHash);
            
            if (!tx || !receipt) return null;
            
            const currentBlock = await this.providers.bsc.getBlockNumber();
            const confirmations = currentBlock - receipt.blockNumber;
            
            // 解析转账金额（简化处理）
            const amount = ethers.formatEther(tx.value);
            
            return {
                valid: receipt.status === 1,
                from: tx.from,
                to: tx.to,
                amount: parseFloat(amount),
                confirmations,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('Error checking BSC tx:', error);
            return null;
        }
    }

    /**
     * 检查 Solana 交易
     */
    async checkSolanaTransaction(txHash) {
        try {
            const tx = await this.providers.solana.getTransaction(txHash, {
                maxSupportedTransactionVersion: 0
            });
            
            if (!tx) return null;
            
            const confirmations = tx.slot ? (await this.providers.solana.getSlot()) - tx.slot : 0;
            
            // 解析转账
            let amount = 0;
            if (tx.meta && tx.meta.postBalances && tx.meta.preBalances) {
                const accountKeys = tx.transaction.message.getAccountKeys();
                const toIndex = accountKeys.findIndex(
                    key => key.toBase58() === this.addresses.sol
                );
                if (toIndex >= 0) {
                    amount = (tx.meta.postBalances[toIndex] - tx.meta.preBalances[toIndex]) / 1e9;
                }
            }
            
            return {
                valid: tx.meta.err === null,
                from: tx.transaction.message.accountKeys[0].toBase58(),
                to: this.addresses.sol,
                amount,
                confirmations,
                timestamp: tx.blockTime * 1000
            };
        } catch (error) {
            console.error('Error checking Solana tx:', error);
            return null;
        }
    }

    /**
     * 检查比特币交易 (使用 mempool.space API)
     */
    async checkBitcoinTransaction(txHash) {
        try {
            const response = await axios.get(`https://mempool.space/api/tx/${txHash}`);
            const tx = response.data;
            
            if (!tx) return null;
            
            // 查找输出到我们的地址
            const ourOutput = tx.vout.find(vout => 
                vout.scriptpubkey_address === this.addresses.btc
            );
            
            if (!ourOutput) {
                return { valid: false, reason: 'not_to_our_address' };
            }
            
            return {
                valid: tx.status.confirmed,
                from: tx.vin[0].prevout.scriptpubkey_address,
                to: this.addresses.btc,
                amount: ourOutput.value / 1e8, // 转换为 BTC
                confirmations: tx.status.confirmed ? 
                    (await axios.get('https://mempool.space/api/blocks/tip/height')).data - tx.status.block_height + 1 : 0,
                timestamp: tx.status.confirmed ? tx.status.block_time * 1000 : Date.now()
            };
        } catch (error) {
            console.error('Error checking Bitcoin tx:', error);
            return null;
        }
    }

    /**
     * 验证充值订单
     */
    async verifyDeposit(order, txHash) {
        let result = null;
        
        switch (order.currency) {
            case 'usdt':
                result = await this.checkTronTransaction(txHash);
                break;
            case 'bnb':
                result = await this.checkBscTransaction(txHash);
                break;
            case 'eth':
                result = await this.checkBscTransaction(txHash); // 简化，使用相同逻辑
                break;
            case 'sol':
                result = await this.checkSolanaTransaction(txHash);
                break;
            case 'btc':
                result = await this.checkBitcoinTransaction(txHash);
                break;
            default:
                throw new Error('Unsupported currency');
        }
        
        if (!result || !result.valid) {
            return { valid: false, reason: result?.reason || 'transaction_not_found' };
        }
        
        // 验证金额和地址
        const tolerance = 0.001; // 允许0.1%的误差（手续费）
        if (Math.abs(result.amount - order.amount) / order.amount > tolerance) {
            return { valid: false, reason: 'amount_mismatch', expected: order.amount, received: result.amount };
        }
        
        if (result.to.toLowerCase() !== order.address.toLowerCase()) {
            return { valid: false, reason: 'address_mismatch' };
        }
        
        return {
            valid: true,
            orderId: order.orderId,
            txHash,
            amount: result.amount,
            confirmations: result.confirmations,
            status: result.confirmations >= order.requiredConfirmations ? 'confirmed' : 'pending'
        };
    }

    getNetwork(currency) {
        const map = {
            usdt: 'tron',
            bnb: 'bsc',
            eth: 'ethereum',
            sol: 'solana',
            btc: 'bitcoin',
            okb: 'ethereum'
        };
        return map[currency.toLowerCase()];
    }

    getRequiredConfirmations(currency) {
        const map = {
            usdt: 19,     // TRON 推荐确认数
            bnb: 15,      // BSC
            eth: 12,      // Ethereum
            sol: 32,      // Solana
            btc: 3,       // Bitcoin (Taproot)
            okb: 12
        };
        return map[currency.toLowerCase()] || 12;
    }

    /**
     * 获取汇率（使用 CoinGecko API）
     */
    async getExchangeRates() {
        try {
            const response = await axios.get(
                'https://api.coingecko.com/api/v3/simple/price?ids=tether,binancecoin,ethereum,solana,bitcoin&vs_currencies=usd'
            );
            
            return {
                usdt: response.data.tether.usd,
                bnb: response.data.binancecoin.usd,
                eth: response.data.ethereum.usd,
                sol: response.data.solana.usd,
                btc: response.data.bitcoin.usd
            };
        } catch (error) {
            console.error('Error fetching rates:', error);
            return {
                usdt: 1,
                bnb: 600,
                eth: 3500,
                sol: 150,
                btc: 95000
            };
        }
    }

    /**
     * 转换为游戏币 ($FATE)
     */
    async convertToGameToken(amount, currency) {
        const rates = await this.getExchangeRates();
        const currencyRate = rates[currency.toLowerCase()];
        
        if (!currencyRate) {
            throw new Error('Unsupported currency for conversion');
        }
        
        // 1 USD = 100 $FATE
        const usdValue = amount * currencyRate;
        return Math.floor(usdValue * 100);
    }
}

module.exports = PaymentWallet;
