import WebSocket from "ws";
import { logInfo, logError } from "../Utils/logger.js";

/**
 * OrderBook - Mantém um order book local sincronizado com a Backpack Exchange
 * 
 * Baseado na documentação: https://docs.backpack.exchange/#tag/Streams/Public/Depth
 * 
 * Funcionamento:
 * 1. Obtém snapshot inicial via REST API
 * 2. Se conecta ao WebSocket e recebe atualizações incrementais
 * 3. Valida sequência de updates (U deve ser u+1 do anterior)
 * 4. Mantém order book sincronizado localmente
 */
class OrderBook {
    constructor(symbol, options = {}) {
        this.symbol = symbol;

        // Order book structure
        this.bids = new Map(); // Map<price, quantity>
        this.asks = new Map(); // Map<price, quantity>

        // Update sequence tracking
        this.lastUpdateId = null;
        this.isInitialized = false;

        // WebSocket
        this.ws = null;
        this.isConnected = false;

        // Configuration
        this.wsUrl = process.env.WS_URL || "wss://ws.backpack.exchange";
        this.restApiUrl = process.env.REST_API_URL || "https://api.backpack.exchange";

        // Stream type: 'realtime', '200ms', '600ms', '1000ms'
        this.streamType = options.streamType || 'realtime';

        // Auto-reconnect
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
        this.reconnectDelay = options.reconnectDelay || 1000;

        // Callbacks
        this.onUpdate = options.onUpdate || null; // Called when order book updates
        this.onError = options.onError || null;
        this.onReady = options.onReady || null; // Called when order book is ready

        // Buffer for updates received before initialization
        this.updateBuffer = [];
        this.maxBufferSize = 1000;

        // Cache para performance (evita sort a cada chamada)
        this._sortedBidsCache = null;
        this._sortedAsksCache = null;
    }

    /**
     * Inicia o order book
     * 1. Busca snapshot inicial
     * 2. Conecta ao WebSocket
     * 3. Aplica updates buffered
     */
    async start() {
        try {
            console.log(`Starting OrderBook for ${this.symbol}`);
            logInfo(`Starting OrderBook for ${this.symbol}`);

            // Step 1: Connect to WebSocket
            await this._connectWebSocket();

            // Step 2: Get initial snapshot
            await this._fetchSnapshot();

            // Step 3: Process buffered updates
            this._processBufferedUpdates();

            this.isInitialized = true;

            if (this.onReady) {
                this.onReady(this.getOrderBook());
            }

            console.log(`OrderBook for ${this.symbol} is ready`);
            logInfo(`OrderBook for ${this.symbol} is ready`);
        } catch (error) {
            console.error("Failed to start OrderBook", error);
            logError("Failed to start OrderBook", error);
            if (this.onError) {
                this.onError(error);
            }
            throw error;
        }
    }

    /**
     * Busca snapshot inicial do order book via REST API
     */
    async _fetchSnapshot() {
        try {
            const url = `${this.restApiUrl}/api/v1/depth?symbol=${this.symbol}`;

            console.log(`Fetching initial OrderBook snapshot from ${url}`);
            logInfo(`Fetching initial OrderBook snapshot from ${url}`);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to fetch OrderBook snapshot: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Clear existing data
            this.bids.clear();
            this.asks.clear();

            // Process bids
            if (data.bids && Array.isArray(data.bids)) {
                for (const [price, quantity] of data.bids) {
                    const p = parseFloat(price);
                    const q = parseFloat(quantity);
                    if (q > 0) {
                        this.bids.set(p, q);
                    }
                }
            }

            // Process asks
            if (data.asks && Array.isArray(data.asks)) {
                for (const [price, quantity] of data.asks) {
                    const p = parseFloat(price);
                    const q = parseFloat(quantity);
                    if (q > 0) {
                        this.asks.set(p, q);
                    }
                }
            }

            // Store last update ID
            this.lastUpdateId = data.lastUpdateId ? parseInt(data.lastUpdateId, 10) : null;

            console.log(`OrderBook snapshot loaded: ${this.bids.size} bids, ${this.asks.size} asks, lastUpdateId: ${this.lastUpdateId}`);
            logInfo(`OrderBook snapshot loaded: ${this.bids.size} bids, ${this.asks.size} asks, lastUpdateId: ${this.lastUpdateId}`);

        } catch (error) {
            console.error("Failed to fetch OrderBook snapshot", error);
            logError("Failed to fetch OrderBook snapshot", error);
            throw error;
        }
    }

    /**
     * Conecta ao WebSocket para receber updates incrementais
     */
    async _connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsUrl);

                this.ws.on("open", () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;

                    // Subscribe to depth updates
                    const streamName = this._getStreamName();
                    const subscribeMsg = {
                        method: "SUBSCRIBE",
                        params: [streamName]
                    };

                    this.ws.send(JSON.stringify(subscribeMsg));

                    console.log(`OrderBook WebSocket connected, subscribed to ${streamName}`);
                    logInfo(`OrderBook WebSocket connected, subscribed to ${streamName}`);
                    resolve();
                });

                this.ws.on("message", (raw) => {
                    this._handleWebSocketMessage(raw);
                });

                this.ws.on("error", (err) => {
                    console.error("OrderBook WebSocket error", err);
                    logError("OrderBook WebSocket error", err);
                    if (this.onError) {
                        this.onError(err);
                    }
                });

                this.ws.on("close", () => {
                    this.isConnected = false;
                    console.log("OrderBook WebSocket disconnected");
                    logInfo("OrderBook WebSocket disconnected");
                    this._handleReconnect();
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Retorna o nome do stream baseado no tipo configurado
     */
    _getStreamName() {
        switch (this.streamType) {
            case '200ms':
                return `depth.200ms.${this.symbol}`;
            case '600ms':
                return `depth.600ms.${this.symbol}`;
            case '1000ms':
                return `depth.1000ms.${this.symbol}`;
            default:
                return `depth.${this.symbol}`;
        }
    }

    /**
     * Processa mensagens do WebSocket
     */
    _handleWebSocketMessage(raw) {
        try {
            const msg = JSON.parse(raw);

            // Ignore subscription confirmations and other non-data messages
            if (!msg.stream || !msg.data) {
                return;
            }

            // Only process depth events
            if (msg.data.e !== "depth") {
                return;
            }

            const data = msg.data;

            // Buffer updates if not yet initialized
            if (!this.isInitialized) {
                if (this.updateBuffer.length < this.maxBufferSize) {
                    this.updateBuffer.push(data);
                }
                return;
            }

            // Apply update
            this._applyDepthUpdate(data);

        } catch (error) {
            console.error("OrderBook Error processing WebSocket message", error);
            logError("Error processing WebSocket message", error);
        }
    }

    /**
     * Aplica um update incremental ao order book
     * 
     * Formato do update:
     * {
     *   "e": "depth",
     *   "E": 1694687965941000,
     *   "s": "SOL_USDC",
     *   "a": [["18.70", "0.000"]],
     *   "b": [["18.67", "0.832"], ["18.68", "0.000"]],
     *   "U": 94978271,
     *   "u": 94978271,
     *   "T": 1694687965940999
     * }
     */
    _applyDepthUpdate(data) {
        try {
            const firstUpdateId = parseInt(data.U, 10);
            const lastUpdateId = parseInt(data.u, 10);

            // Validate sequence
            if (this.lastUpdateId !== null) {
                // U should be lastUpdateId + 1
                if (firstUpdateId !== this.lastUpdateId + 1) {
                    const msg = `Order book out of sync! Expected U=${this.lastUpdateId + 1}, got U=${firstUpdateId}. Re-syncing...`;
                    console.error(msg);
                    logError(msg);
                    // Re-fetch snapshot and reconnect
                    this._resync();
                    return;
                }
            }

            // Update asks
            if (data.a && Array.isArray(data.a)) {
                for (const [price, quantity] of data.a) {
                    const p = parseFloat(price);
                    const q = parseFloat(quantity);

                    if (q === 0) {
                        // Remove price level
                        this.asks.delete(p);
                    } else {
                        // Update price level
                        this.asks.set(p, q);
                    }
                }
            }

            // Update bids
            if (data.b && Array.isArray(data.b)) {
                for (const [price, quantity] of data.b) {
                    const p = parseFloat(price);
                    const q = parseFloat(quantity);

                    if (q === 0) {
                        // Remove price level
                        this.bids.delete(p);
                    } else {
                        // Update price level
                        this.bids.set(p, q);
                    }
                }
            }

            // Update last update ID
            this.lastUpdateId = lastUpdateId;

            // Invalidar cache (houve mudança no book)
            this._sortedBidsCache = null;
            this._sortedAsksCache = null;

            // Trigger callback
            if (this.onUpdate) {
                this.onUpdate({
                    symbol: data.s,
                    timestamp: data.E,
                    engineTimestamp: data.T,
                    firstUpdateId,
                    lastUpdateId
                });
            }

        } catch (error) {
            console.error("Error applying depth update", error);
            logError("Error applying depth update", error);
        }
    }

    /**
     * Processa updates que foram buffered antes da inicialização
     */
    _processBufferedUpdates() {
        if (this.updateBuffer.length === 0) {
            return;
        }

        console.log(`Processing ${this.updateBuffer.length} buffered updates`);
        logInfo(`Processing ${this.updateBuffer.length} buffered updates`);

        // Filter updates that are valid based on lastUpdateId from snapshot
        const validUpdates = this.updateBuffer.filter(update => {
            // Only process updates where u > lastUpdateId
            return parseInt(update.u, 10) > this.lastUpdateId;
        });

        // Sort by first update ID
        validUpdates.sort((a, b) => a.U - b.U);

        // Apply updates
        for (const update of validUpdates) {
            this._applyDepthUpdate(update);
        }

        // Clear buffer
        this.updateBuffer = [];

        console.log(`Applied ${validUpdates.length} buffered updates`);
        logInfo(`Applied ${validUpdates.length} buffered updates`);
    }

    /**
     * Re-sincroniza o order book (busca novo snapshot)
     */
    async _resync() {
        try {
            console.log("Re-syncing order book...");
            logInfo("Re-syncing order book...");

            // Close existing WebSocket
            if (this.ws) {
                this.ws.removeAllListeners();
                this.ws.close();
                this.ws = null;
            }

            // Reset state
            this.isInitialized = false;
            this.updateBuffer = [];

            // Re-start
            await this.start();

        } catch (error) {
            console.error("Failed to re-sync order book", error);
            logError("Failed to re-sync order book", error);
        }
    }

    /**
     * Trata reconexão automática
     */
    _handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;

            const msg = `OrderBook WebSocket disconnected. Reconnecting in ${delay / 1000}s... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`;
            console.log(msg);
            logInfo(msg);

            setTimeout(() => this._resync(), delay);
        } else {
            console.log("Max reconnection attempts reached");
            logError("Max reconnection attempts reached");
        }
    }

    /**
     * Retorna bids ordenados (com cache para performance)
     * @private
     */
    _getSortedBids() {
        if (!this._sortedBidsCache) {
            this._sortedBidsCache = Array.from(this.bids.entries())
                .sort((a, b) => b[0] - a[0]); // Descending (highest first)
        }
        return this._sortedBidsCache;
    }

    /**
     * Retorna asks ordenados (com cache para performance)
     * @private
     */
    _getSortedAsks() {
        if (!this._sortedAsksCache) {
            this._sortedAsksCache = Array.from(this.asks.entries())
                .sort((a, b) => a[0] - b[0]); // Ascending (lowest first)
        }
        return this._sortedAsksCache;
    }

    /**
     * Retorna o order book atual ordenado
     */
    getOrderBook(depth = null) {
        const sortedBids = this._getSortedBids().slice(0, depth || undefined);
        const sortedAsks = this._getSortedAsks().slice(0, depth || undefined);

        return {
            symbol: this.symbol,
            bids: sortedBids.map(([price, quantity]) => [price, quantity]),
            asks: sortedAsks.map(([price, quantity]) => [price, quantity]),
            timestamp: Date.now(),
            lastUpdateId: this.lastUpdateId
        };
    }

    /**
     * Retorna o melhor bid (maior preço de compra)
     */
    getBestBid() {
        if (this.bids.size === 0) return null;
        const sorted = this._getSortedBids();
        return { price: sorted[0][0], quantity: sorted[0][1] };
    }

    /**
     * Retorna o melhor ask (menor preço de venda)
     */
    getBestAsk() {
        if (this.asks.size === 0) return null;
        const sorted = this._getSortedAsks();
        return { price: sorted[0][0], quantity: sorted[0][1] };
    }

    /**
     * Retorna o spread (diferença entre melhor ask e melhor bid)
     */
    getSpread() {
        const bestBid = this.getBestBid();
        const bestAsk = this.getBestAsk();

        if (!bestBid || !bestAsk) return null;

        return {
            absolute: bestAsk.price - bestBid.price,
            percentage: ((bestAsk.price - bestBid.price) / bestBid.price) * 100
        };
    }

    /**
     * Retorna o mid price (preço médio entre bid e ask)
     */
    getMidPrice() {
        const bestBid = this.getBestBid();
        const bestAsk = this.getBestAsk();

        if (!bestBid || !bestAsk) return null;

        return (bestBid.price + bestAsk.price) / 2;
    }

    /**
     * Calcula o preço médio de execução para uma determinada quantidade
     * 
     * @param {number} quantity - Quantidade a ser executada
     * @param {string} side - "buy" ou "sell"
     * @returns {Object|null} - { averagePrice, totalCost, levels } ou null se não houver liquidez
     * 
     * Exemplo:
     * - Quero comprar 10 contratos
     * - Asks: [[100, 5], [101, 3], [102, 5]]
     * - Execução: 5@100 + 3@101 + 2@102
     * - Preço médio: (500 + 303 + 204) / 10 = 100.7
     */
    getAverageExecutionPrice(quantity, side) {
        if (quantity <= 0) return null;

        // Usar cache ao invés de ordenar novamente
        const sortedLevels = side.toLowerCase() === "buy"
            ? this._getSortedAsks()   // Compra: usa asks (menores preços primeiro)
            : this._getSortedBids();  // Venda: usa bids (maiores preços primeiro)

        if (sortedLevels.length === 0) return null;

        let remainingQty = quantity;
        let totalCost = 0;
        const levelsUsed = [];

        // Percorrer níveis até preencher a ordem
        for (const [price, availableQty] of sortedLevels) {
            if (remainingQty <= 0) break;

            const qtyAtThisLevel = Math.min(remainingQty, availableQty);
            const costAtThisLevel = qtyAtThisLevel * price;

            totalCost += costAtThisLevel;
            remainingQty -= qtyAtThisLevel;

            levelsUsed.push({
                price,
                quantity: qtyAtThisLevel,
                cost: costAtThisLevel
            });
        }

        // Se não houver liquidez suficiente
        if (remainingQty > 0) {
            return {
                averagePrice: totalCost / (quantity - remainingQty),
                totalCost,
                executedQuantity: quantity - remainingQty,
                missingQuantity: remainingQty,
                levels: levelsUsed,
                partialFill: true
            };
        }

        // Liquidez suficiente
        return {
            averagePrice: totalCost / quantity,
            totalCost,
            executedQuantity: quantity,
            missingQuantity: 0,
            levels: levelsUsed,
            partialFill: false
        };
    }

    /**
     * Calcula o PnL (Profit and Loss) de uma posição se fosse fechada agora
     * 
     * @param {number} entryPrice - Preço de entrada da posição
     * @param {number} quantity - Quantidade da posição
     * @param {string} side - "long" ou "short" (lado da posição ABERTA)
     * @returns {Object|null} - { pnl, pnlPercentage, exitPrice, exitDetails } ou null
     * 
     * Exemplo:
     * - Posição LONG: comprou 10 @ $100
     * - Book atual: bestBid = $105
     * - Para fechar: vender 10 @ $105 (média)
     * - PnL = (105 - 100) * 10 = $50 (+5%)
     */
    calculatePnL(entryPrice, quantity, side) {
        if (quantity <= 0 || entryPrice <= 0) return null;

        const isLong = side.toLowerCase() === "long";

        // Para fechar: Long vende (usa bids), Short compra (usa asks)
        const exitSide = isLong ? "sell" : "buy";
        const exitDetails = this.getAverageExecutionPrice(quantity, exitSide);

        if (!exitDetails || exitDetails.partialFill) {
            return null;
            // Não há liquidez suficiente ou fill parcial
            /*return {
                pnl: null,
                pnlPercentage: null,
                exitPrice: exitDetails?.averagePrice || null,
                exitDetails,
                error: exitDetails?.partialFill
                    ? `Liquidez insuficiente: apenas ${exitDetails.executedQuantity}/${quantity} preenchido`
                    : "Sem liquidez no book"
            };*/
        }

        const exitPrice = exitDetails.averagePrice;

        // Calcular PnL
        // Long: PnL = (exitPrice - entryPrice) * quantity
        // Short: PnL = (entryPrice - exitPrice) * quantity
        const pnl = isLong
            ? (exitPrice - entryPrice) * quantity
            : (entryPrice - exitPrice) * quantity;

        const pnlPercentage = (pnl / (entryPrice * quantity)) * 100;

        return pnl;

        /*return {
            pnl,
            pnlPercentage,
            entryPrice,
            exitPrice,
            quantity,
            side,
            exitDetails,
            slippage: {
                absolute: Math.abs(exitPrice - (isLong ? this.getBestBid()?.price : this.getBestAsk()?.price)),
                percentage: ((exitPrice - (isLong ? this.getBestBid()?.price : this.getBestAsk()?.price)) / exitPrice) * 100
            }
        };*/
    }

    /**
     * Para o order book e fecha a conexão WebSocket
     */
    stop() {
        logInfo(`Stopping OrderBook for ${this.symbol}`);

        if (this.ws) {
            this.ws.removeAllListeners(); // Evitar callbacks durante shutdown
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.isInitialized = false;
        this.bids.clear();
        this.asks.clear();
        this.updateBuffer = [];
    }
}

export default OrderBook;
