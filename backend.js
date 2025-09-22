// ========================================
// MAIN SERVER FILE (server.js)
// ========================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { body, validationResult } = require('express-validator');

// Import route modules
const dashboardRoutes = require('./routes/dashboard');
const forecastingRoutes = require('./routes/forecasting');
const routeOptimizationRoutes = require('./routes/routeOptimization');
const segmentationRoutes = require('./routes/segmentation');
const chatbotRoutes = require('./routes/chatbot');

// Import middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Import database connection
const db = require('./database/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Winston logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'scm-backend' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later'
});

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/forecasting', forecastingRoutes);
app.use('/api/route-optimization', routeOptimizationRoutes);
app.use('/api/segmentation', segmentationRoutes);
app.use('/api/chatbot', chatbotRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `The requested endpoint ${req.originalUrl} does not exist`
    });
});

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    logger.info(`SCM Backend server running on port ${PORT}`);
    console.log(`🚀 Server started on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

module.exports = app;

// ========================================
// DATABASE CONNECTION (database/connection.js)
// ========================================

const mongoose = require('mongoose');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/scm_ai_db';

const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        logger.info('MongoDB connected successfully');
    } catch (error) {
        logger.error('Database connection failed:', error);
        process.exit(1);
    }
};

// Handle connection events
mongoose.connection.on('connected', () => {
    logger.info('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    logger.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    logger.info('Mongoose disconnected from MongoDB');
});

connectDB();

module.exports = mongoose;

// ========================================
// DASHBOARD ROUTES (routes/dashboard.js)
// ========================================

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const dashboardService = require('../services/dashboardService');
const authMiddleware = require('../middleware/auth');

// Get dashboard KPIs
router.get('/kpis', authMiddleware, async (req, res) => {
    try {
        const kpis = await dashboardService.getKPIs();
        res.json({
            success: true,
            data: kpis,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch KPIs',
            message: error.message
        });
    }
});

// Get sales and inventory data
router.get('/chart-data', authMiddleware, async (req, res) => {
    try {
        const { period = '12' } = req.query;
        const chartData = await dashboardService.getChartData(parseInt(period));
        
        res.json({
            success: true,
            data: chartData,
            period: period
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chart data',
            message: error.message
        });
    }
});

// Get real-time alerts
router.get('/alerts', authMiddleware, async (req, res) => {
    try {
        const alerts = await dashboardService.getAlerts();
        res.json({
            success: true,
            data: alerts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch alerts',
            message: error.message
        });
    }
});

// Refresh dashboard data
router.post('/refresh', authMiddleware, async (req, res) => {
    try {
        await dashboardService.refreshData();
        const kpis = await dashboardService.getKPIs();
        
        res.json({
            success: true,
            message: 'Dashboard data refreshed successfully',
            data: kpis
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to refresh data',
            message: error.message
        });
    }
});

module.exports = router;

// ========================================
// FORECASTING ROUTES (routes/forecasting.js)
// ========================================

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const forecastingService = require('../services/forecastingService');
const authMiddleware = require('../middleware/auth');

// Generate demand forecast
router.post('/generate',
    authMiddleware,
    [
        body('productCategory').isIn(['electronics', 'clothing', 'food', 'home']),
        body('forecastPeriod').isInt({ min: 1, max: 24 }),
        body('historicalPeriod').isInt({ min: 12, max: 60 }).optional()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { productCategory, forecastPeriod, historicalPeriod = 24 } = req.body;
            
            const forecast = await forecastingService.generateForecast({
                productCategory,
                forecastPeriod,
                historicalPeriod
            });

            res.json({
                success: true,
                data: forecast,
                metadata: {
                    category: productCategory,
                    forecastPeriod,
                    historicalPeriod,
                    generatedAt: new Date().toISOString()
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to generate forecast',
                message: error.message
            });
        }
    }
);

// Get historical demand data
router.get('/historical/:category', authMiddleware, async (req, res) => {
    try {
        const { category } = req.params;
        const { months = 12 } = req.query;
        
        const historicalData = await forecastingService.getHistoricalData(category, parseInt(months));
        
        res.json({
            success: true,
            data: historicalData,
            category,
            months: parseInt(months)
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch historical data',
            message: error.message
        });
    }
});

// Get forecast accuracy metrics
router.get('/accuracy/:forecastId', authMiddleware, async (req, res) => {
    try {
        const { forecastId } = req.params;
        const accuracy = await forecastingService.getForecastAccuracy(forecastId);
        
        res.json({
            success: true,
            data: accuracy
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch accuracy metrics',
            message: error.message
        });
    }
});

// Update forecast model parameters
router.put('/model/parameters',
    authMiddleware,
    [
        body('seasonalityStrength').isFloat({ min: 0, max: 1 }).optional(),
        body('trendStrength').isFloat({ min: 0, max: 1 }).optional(),
        body('noiseReduction').isFloat({ min: 0, max: 1 }).optional()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const parameters = req.body;
            await forecastingService.updateModelParameters(parameters);
            
            res.json({
                success: true,
                message: 'Model parameters updated successfully',
                parameters
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to update parameters',
                message: error.message
            });
        }
    }
);

module.exports = router;

// ========================================
// ROUTE OPTIMIZATION ROUTES (routes/routeOptimization.js)
// ========================================

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const routeOptimizationService = require('../services/routeOptimizationService');
const authMiddleware = require('../middleware/auth');

// Optimize delivery routes
router.post('/optimize',
    authMiddleware,
    [
        body('startLocation').notEmpty().trim(),
        body('destinations').isArray({ min: 2, max: 20 }),
        body('vehicleCapacity').isInt({ min: 1, max: 100 }).optional(),
        body('optimizationGoal').isIn(['time', 'cost', 'fuel', 'balanced']).optional()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const optimizationRequest = {
                startLocation: req.body.startLocation,
                destinations: req.body.destinations,
                vehicleCapacity: req.body.vehicleCapacity || 10,
                optimizationGoal: req.body.optimizationGoal || 'balanced',
                constraints: req.body.constraints || {}
            };

            const optimizedRoute = await routeOptimizationService.optimizeRoute(optimizationRequest);

            res.json({
                success: true,
                data: optimizedRoute,
                requestId: optimizedRoute.id,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to optimize route',
                message: error.message
            });
        }
    }
);

// Get route optimization history
router.get('/history', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const history = await routeOptimizationService.getOptimizationHistory(
            parseInt(page),
            parseInt(limit)
        );
        
        res.json({
            success: true,
            data: history.routes,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: history.total,
                pages: Math.ceil(history.total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch optimization history',
            message: error.message
        });
    }
});

// Get route performance analytics
router.get('/analytics/:routeId', authMiddleware, async (req, res) => {
    try {
        const { routeId } = req.params;
        const analytics = await routeOptimizationService.getRouteAnalytics(routeId);
        
        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch route analytics',
            message: error.message
        });
    }
});

// Calculate distance matrix
router.post('/distance-matrix',
    authMiddleware,
    [
        body('locations').isArray({ min: 2, max: 25 })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { locations } = req.body;
            const distanceMatrix = await routeOptimizationService.calculateDistanceMatrix(locations);
            
            res.json({
                success: true,
                data: {
                    matrix: distanceMatrix,
                    locations
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to calculate distance matrix',
                message: error.message
            });
        }
    }
);

module.exports = router;

// ========================================
// SEGMENTATION ROUTES (routes/segmentation.js)
// ========================================

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const segmentationService = require('../services/segmentationService');
const authMiddleware = require('../middleware/auth');

// Perform customer segmentation
router.post('/analyze',
    authMiddleware,
    [
        body('method').isIn(['rfm', 'behavioral', 'geographic', 'demographic']),
        body('clusterCount').isInt({ min: 2, max: 10 }),
        body('analysisPeriod').isIn(['3months', '6months', '12months', '24months']).optional()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const segmentationRequest = {
                method: req.body.method,
                clusterCount: req.body.clusterCount,
                analysisPeriod: req.body.analysisPeriod || '12months',
                features: req.body.features || []
            };

            const segmentation = await segmentationService.performSegmentation(segmentationRequest);

            res.json({
                success: true,
                data: segmentation,
                metadata: {
                    method: segmentationRequest.method,
                    clusterCount: segmentationRequest.clusterCount,
                    analyzedAt: new Date().toISOString()
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to perform segmentation',
                message: error.message
            });
        }
    }
);

// Get customer segments
router.get('/segments', authMiddleware, async (req, res) => {
    try {
        const segments = await segmentationService.getCustomerSegments();
        res.json({
            success: true,
            data: segments
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer segments',
            message: error.message
        });
    }
});

// Get segment details
router.get('/segments/:segmentId', authMiddleware, async (req, res) => {
    try {
        const { segmentId } = req.params;
        const segmentDetails = await segmentationService.getSegmentDetails(segmentId);
        
        res.json({
            success: true,
            data: segmentDetails
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch segment details',
            message: error.message
        });
    }
});

// Get segmentation insights
router.get('/insights', authMiddleware, async (req, res) => {
    try {
        const { segmentId } = req.query;
        const insights = await segmentationService.getSegmentationInsights(segmentId);
        
        res.json({
            success: true,
            data: insights
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch insights',
            message: error.message
        });
    }
});

module.exports = router;

// ========================================
// CHATBOT ROUTES (routes/chatbot.js)
// ========================================

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const chatbotService = require('../services/chatbotService');
const authMiddleware = require('../middleware/auth');

// Process chat message
router.post('/message',
    authMiddleware,
    [
        body('message').notEmpty().trim().isLength({ max: 500 }),
        body('sessionId').optional().isUUID()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { message, sessionId } = req.body;
            const response = await chatbotService.processMessage({
                message,
                sessionId,
                userId: req.user.id
            });

            res.json({
                success: true,
                data: response
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to process message',
                message: error.message
            });
        }
    }
);

// Get chat history
router.get('/history/:sessionId', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { limit = 50 } = req.query;
        
        const history = await chatbotService.getChatHistory(sessionId, parseInt(limit));
        
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chat history',
            message: error.message
        });
    }
});

// Get available chatbot commands/capabilities
router.get('/capabilities', authMiddleware, async (req, res) => {
    try {
        const capabilities = await chatbotService.getCapabilities();
        res.json({
            success: true,
            data: capabilities
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch capabilities',
            message: error.message
        });
    }
});

// Clear chat session
router.delete('/session/:sessionId', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        await chatbotService.clearSession(sessionId);
        
        res.json({
            success: true,
            message: 'Session cleared successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to clear session',
            message: error.message
        });
    }
});

module.exports = router;

// ========================================
// DASHBOARD SERVICE (services/dashboardService.js)
// ========================================

const mongoose = require('mongoose');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});

class DashboardService {
    async getKPIs() {
        try {
            // Simulate real KPI calculations with sample data
            const kpis = {
                totalSales: {
                    value: 2400000 + Math.random() * 400000,
                    change: (Math.random() - 0.5) * 20,
                    trend: 'up'
                },
                inventoryTurnover: {
                    value: 12 + Math.random() * 3,
                    change: (Math.random() - 0.5) * 2,
                    trend: Math.random() > 0.5 ? 'up' : 'down'
                },
                onTimeDelivery: {
                    value: 92 + Math.random() * 8,
                    change: (Math.random() - 0.5) * 5,
                    trend: 'up'
                },
                activeSuppliers: {
                    value: 150 + Math.floor(Math.random() * 25),
                    change: Math.floor((Math.random() - 0.5) * 10),
                    trend: 'stable'
                },
                costSavings: {
                    value: 340000 + Math.random() * 60000,
                    change: Math.random() * 15,
                    trend: 'up'
                }
            };

            logger.info('KPIs calculated successfully');
            return kpis;
        } catch (error) {
            logger.error('Error calculating KPIs:', error);
            throw new Error('Failed to calculate KPIs');
        }
    }

    async getChartData(period = 12) {
        try {
            const salesData = [];
            const inventoryData = [];
            const deliveryData = [];
            const labels = [];

            const now = new Date();
            for (let i = period - 1; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                labels.push(date.toLocaleString('default', { month: 'short', year: 'numeric' }));
                
                // Generate realistic sample data with trends
                const baseValue = 120000 + (i * 2000);
                const seasonal = Math.sin((i / 12) * 2 * Math.PI) * 20000;
                const noise = (Math.random() - 0.5) * 10000;
                
                salesData.push(Math.max(0, baseValue + seasonal + noise));
                inventoryData.push(75 + Math.sin((i / 6) * 2 * Math.PI) * 15 + (Math.random() - 0.5) * 5);
                deliveryData.push(2.5 - (i * 0.02) + (Math.random() - 0.5) * 0.3);
            }

            const chartData = {
                labels,
                datasets: {
                    sales: salesData,
                    inventory: inventoryData,
                    delivery: deliveryData
                }
            };

            logger.info(`Chart data generated for ${period} months`);
            return chartData;
        } catch (error) {
            logger.error('Error generating chart data:', error);
            throw new Error('Failed to generate chart data');
        }
    }

    async getAlerts() {
        try {
            const alerts = [
                {
                    id: 1,
                    type: 'warning',
                    title: 'Low Inventory Alert',
                    message: 'Product SKU-123 inventory below threshold (15 units remaining)',
                    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
                    priority: 'high'
                },
                {
                    id: 2,
                    type: 'info',
                    title: 'Delivery Update',
                    message: 'Route optimization reduced delivery time by 18% this week',
                    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
                    priority: 'medium'
                },
                {
                    id: 3,
                    type: 'success',
                    title: 'Forecast Accuracy',
                    message: 'Demand forecasting achieved 94% accuracy last month',
                    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    priority: 'low'
                }
            ];

            return alerts;
        } catch (error) {
            logger.error('Error fetching alerts:', error);
            throw new Error('Failed to fetch alerts');
        }
    }

    async refreshData() {
        try {
            // Simulate data refresh process
            logger.info('Starting dashboard data refresh...');
            
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            logger.info('Dashboard data refresh completed');
            return true;
        } catch (error) {
            logger.error('Error refreshing data:', error);
            throw new Error('Failed to refresh dashboard data');
        }
    }
}

module.exports = new DashboardService();

// ========================================
// FORECASTING SERVICE (services/forecastingService.js)
// ========================================

class ForecastingService {
    constructor() {
        this.models = {
            electronics: { seasonality: 0.3, trend: 0.05, noise: 0.1 },
            clothing: { seasonality: 0.6, trend: 0.02, noise: 0.15 },
            food: { seasonality: 0.2, trend: 0.01, noise: 0.05 },
            home: { seasonality: 0.4, trend: 0.03, noise: 0.12 }
        };
    }

    async generateForecast({ productCategory, forecastPeriod, historicalPeriod = 24 }) {
        try {
            const model = this.models[productCategory];
            if (!model) {
                throw new Error(`No model available for category: ${productCategory}`);
            }

            // Generate historical data
            const historicalData = this._generateHistoricalData(model, historicalPeriod);
            
            // Generate forecast
            const forecastData = this._generateForecastData(model, historicalData, forecastPeriod);
            
            // Calculate accuracy metrics
            const accuracy = this._calculateAccuracy(historicalData, model);
            
            const forecastId = this._generateForecastId();
            
            const forecast = {
                id: forecastId,
                category: productCategory,
                historical: {
                    data: historicalData,
                    period: historicalPeriod
                },
                forecast: {
                    data: forecastData,
                    period: forecastPeriod
                },
                accuracy: accuracy,
                confidence: accuracy.overall * 0.9 + Math.random() * 0.1,
                metadata: {
                    model: model,
                    generatedAt: new Date().toISOString()
                }
            };

            logger.info(`Forecast generated for ${productCategory}, ID: ${forecastId}`);
            return forecast;
        } catch (error) {
            logger.error('Error generating forecast:', error);
            throw error;
        }
    }

    async getHistoricalData(category, months) {
        try {
            const model = this.models[category];
            if (!model) {
                throw new Error(`No data available for category: ${category}`);
            }

            const data = this._generateHistoricalData(model, months);
            return {
                category,
                data,
                period: months,
                summary: {
                    average: data.reduce((a, b) => a + b, 0) / data.length,
                    min: Math.min(...data),
                    max: Math.max(...data),
                    trend: this._calculateTrend(data)
                }
            };
        } catch (error) {
            logger.error('Error fetching historical data:', error);
            throw error;
        }
    }

    async getForecastAccuracy(forecastId) {
        try {
            // Simulate retrieving stored forecast and calculating accuracy
            const accuracy = {
                mae: 45.2 + Math.random() * 20,
                mape: 8.5 + Math.random() * 5,
                rmse: 67.8 + Math.random() * 25,
                overall: 0.85 + Math.random() * 0.1
            };

            return accuracy;
        } catch (error) {
            logger.error('Error fetching forecast accuracy:', error);
            throw error;
        }
    }

    async updateModelParameters(parameters) {
        try {
            // In a real implementation, this would update ML model