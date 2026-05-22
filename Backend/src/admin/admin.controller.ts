import { Router, Request, Response } from 'express';
import { logger } from "../common/services/logger";
import { AdminService } from './admin.service';
import { checkAuthToken, CustomRequest } from '../common/middleware/authToken';
import { checkRoleAuth } from '../common/middleware/checkRole';

const router = Router();
const adminService = new AdminService();

/**
 * Helper to parse date range from query params
 */
const parseDateRange = (req: Request) => {
    const { startDate, endDate } = req.query;

    if (startDate && endDate) {
        return {
            startDate: new Date(startDate as string),
            endDate: new Date(endDate as string)
        };
    }

    return undefined;
};

/**
 * GET /api/admin/metrics/overview
 * Get comprehensive dashboard overview
 */
router.get(
    '/metrics/overview',
    checkAuthToken,
    checkRoleAuth('admin'),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const overview = await adminService.getOverview(dateRange);

            res.json({
                success: true,
                data: overview
            });
        } catch (error: any) {
            logger.error('Admin overview error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching admin overview',
                error: error.message
            });
        }
    }
);

/**
 * GET /api/admin/metrics/subscriptions
 * Get subscription analytics
 */
router.get(
    '/metrics/subscriptions',
    checkAuthToken,
    checkRoleAuth('admin'),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const metrics = await adminService.getSubscriptionMetrics(dateRange);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('Subscription metrics error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching subscription metrics',
                error: error.message
            });
        }
    }
);

/**
 * GET /api/admin/metrics/marketplace
 * Get marketplace sales data
 */
router.get(
    '/metrics/marketplace',
    checkAuthToken,
    checkRoleAuth('admin'),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const metrics = await adminService.getMarketplaceMetrics(dateRange);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('Marketplace metrics error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching marketplace metrics',
                error: error.message
            });
        }
    }
);

/**
 * GET /api/admin/metrics/commissions
 * Get commission breakdown
 */
router.get(
    '/metrics/commissions',
    checkAuthToken,
    checkRoleAuth('admin'),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const limit = parseInt(req.query.limit as string) || 10;
            const metrics = await adminService.getCommissionMetrics(dateRange, limit);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('Commission metrics error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching commission metrics',
                error: error.message
            });
        }
    }
);

/**
 * GET /api/admin/metrics/users
 * Get user growth metrics
 */
router.get(
    '/metrics/users',
    checkAuthToken,
    checkRoleAuth('admin'),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const metrics = await adminService.getUserMetrics(dateRange);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('User metrics error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching user metrics',
                error: error.message
            });
        }
    }
);

/**
 * GET /api/admin/metrics/events
 * Get event metrics
 */
router.get(
    '/metrics/events',
    checkAuthToken,
    checkRoleAuth('admin'),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const metrics = await adminService.getEventMetrics(dateRange);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('Event metrics error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching event metrics',
                error: error.message
            });
        }
    }
);

/**
 * GET /api/admin/metrics/revenue-trend
 * Get revenue trend data for charts
 * Query params: period (day|week|month), last (number)
 */
router.get(
    '/metrics/revenue-trend',
    checkAuthToken,
    checkRoleAuth('admin'),
    async (req: CustomRequest, res: Response) => {
        try {
            const period = (req.query.period as 'day' | 'week' | 'month') || 'day';
            const last = parseInt(req.query.last as string) || 30;

            const trendData = await adminService.getRevenueTrendData(period, last);

            res.json({
                success: true,
                data: trendData
            });
        } catch (error: any) {
            logger.error('Revenue trend error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching revenue trend',
                error: error.message
            });
        }
    }
);

/**
 * GET /api/admin/metrics/top-organizers
 * Get top revenue-generating organizers
 */
router.get(
    '/metrics/top-organizers',
    checkAuthToken,
    checkRoleAuth('admin'),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const limit = parseInt(req.query.limit as string) || 10;

            const metrics = await adminService.getCommissionMetrics(dateRange, limit);

            res.json({
                success: true,
                data: metrics.topOrganizers
            });
        } catch (error: any) {
            logger.error('Top organizers error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching top organizers',
                error: error.message
            });
        }
    }
);

/**
 * GET /api/admin/metrics/extras
 * Get extras/vouchers metrics
 */
router.get(
    '/metrics/extras',
    checkAuthToken,
    checkRoleAuth('admin'),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const metrics = await adminService.getExtrasMetrics(dateRange);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('Extras metrics error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching extras metrics',
                error: error.message
            });
        }
    }
);

/**
 * GET /api/admin/metrics/top-events
 * Get best-performing events
 */
router.get(
    '/metrics/top-events',
    checkAuthToken,
    checkRoleAuth('admin'),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const limit = parseInt(req.query.limit as string) || 10;

            const topEvents = await adminService.getTopEvents(limit, dateRange);

            res.json({
                success: true,
                data: topEvents
            });
        } catch (error: any) {
            logger.error('Top events error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching top events',
                error: error.message
            });
        }
    }
);

export { router as adminRouter };
