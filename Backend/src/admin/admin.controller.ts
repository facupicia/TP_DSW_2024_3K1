import { Router, Request, Response } from 'express';
import { adminMetricsSchema } from '../schemas/schema.admin';
import { schemaValidation } from '../common/middleware/schemaValidacion';
import { logger } from "../common/services/logger";
import { AdminService } from './admin.service';
import { checkAuthToken, CustomRequest } from '../common/middleware/authToken';
import { checkRoleAuth } from '../common/middleware/checkRole';
import AppDataSource from '../db';
import {RefundRequest} from '../payment/refund-request.entity';
import {enqueueOutbox} from '../queue/outbox.service';

const router = Router();
const adminService = new AdminService();

router.get('/operations', checkAuthToken, checkRoleAuth('admin'), async(req,res,next)=>{
    try {
        const queue = await AppDataSource.query(`SELECT kind,COUNT(*) FILTER(WHERE "failedAt" IS NULL)::integer AS pending,
            COUNT(*) FILTER(WHERE attempts>0 AND "failedAt" IS NULL)::integer AS retrying,
            COUNT(*) FILTER(WHERE "failedAt" IS NOT NULL)::integer AS failed,
            MIN("createdAt") FILTER(WHERE "failedAt" IS NULL) AS "oldestCreatedAt"
            FROM outbox_job WHERE "processedAt" IS NULL GROUP BY kind`);
        const failedRefunds=await AppDataSource.getRepository(RefundRequest).find({where:{status:'failed'},order:{createdAt:'ASC'},take:50});
        res.json({queue,failedRefunds});
    } catch(error){next(error);}
});

router.post('/refunds/:id/retry',checkAuthToken,checkRoleAuth('admin'),async(req,res,next)=>{
    try {
        if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({message:'ID inválido'});
        const scheduled=await AppDataSource.transaction(async manager=>{
            const request=await manager.findOne(RefundRequest,{where:{id:req.params.id},lock:{mode:'pessimistic_write'}});
            if (!request || request.status!=='failed') return false;
            const [job]=await manager.query(`SELECT "lockedUntil" FROM outbox_job WHERE key=$1 FOR UPDATE`,['refund-'+request.paymentLogId]);
            if(job?.lockedUntil && new Date(job.lockedUntil)>new Date()) return false;
            await manager.update(RefundRequest,request.id,{status:'pending',lastError:null});
            await enqueueOutbox(manager,'refund-'+request.paymentLogId,'refund',{refundRequestId:request.id});
            await manager.query(`UPDATE outbox_job SET "processedAt"=NULL, "failedAt"=NULL, "availableAt"=NOW(), attempts=0,
                "lastError"=NULL,payload=$2::jsonb WHERE key=$1`,['refund-'+request.paymentLogId,JSON.stringify({refundRequestId:request.id})]);
            return true;
        });
        res.status(scheduled?202:409).json({scheduled});
    } catch(error){next(error);}
});

/**
 * Helper to parse date range from query params
 */
const parseDateRange = (req: Request) => {
    const { startDate, endDate } = req.query;

    if (startDate && endDate) {
        const rawEnd = String(endDate);
        const parsedEnd = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd)
            ? new Date(`${rawEnd}T23:59:59.999Z`)
            : new Date(rawEnd);
        return {
            startDate: new Date(startDate as string),
            endDate: parsedEnd
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
    schemaValidation(adminMetricsSchema),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const overview = await adminService.getOverview(dateRange);

            res.json({
                success: true,
                data: overview
            });
        } catch (error: any) {
            logger.error('Admin overview error:', { message: error?.message, stack: error?.stack });
            res.status(500).json({
                success: false,
                message: 'Error fetching admin overview'
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
    schemaValidation(adminMetricsSchema),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const metrics = await adminService.getSubscriptionMetrics(dateRange);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('Subscription metrics error:', { message: error?.message, stack: error?.stack });
            res.status(500).json({
                success: false,
                message: 'Error fetching subscription metrics'
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
    schemaValidation(adminMetricsSchema),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const metrics = await adminService.getMarketplaceMetrics(dateRange);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('Marketplace metrics error:', { message: error?.message, stack: error?.stack });
            res.status(500).json({
                success: false,
                message: 'Error fetching marketplace metrics'
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
    schemaValidation(adminMetricsSchema),
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
            logger.error('Commission metrics error:', { message: error?.message, stack: error?.stack });
            res.status(500).json({
                success: false,
                message: 'Error fetching commission metrics'
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
    schemaValidation(adminMetricsSchema),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const metrics = await adminService.getUserMetrics(dateRange);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('User metrics error:', { message: error?.message, stack: error?.stack });
            res.status(500).json({
                success: false,
                message: 'Error fetching user metrics'
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
    schemaValidation(adminMetricsSchema),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const metrics = await adminService.getEventMetrics(dateRange);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('Event metrics error:', { message: error?.message, stack: error?.stack });
            res.status(500).json({
                success: false,
                message: 'Error fetching event metrics'
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
    schemaValidation(adminMetricsSchema),
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
            logger.error('Revenue trend error:', { message: error?.message, stack: error?.stack });
            res.status(500).json({
                success: false,
                message: 'Error fetching revenue trend'
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
    schemaValidation(adminMetricsSchema),
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
            logger.error('Top organizers error:', { message: error?.message, stack: error?.stack });
            res.status(500).json({
                success: false,
                message: 'Error fetching top organizers'
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
    schemaValidation(adminMetricsSchema),
    async (req: CustomRequest, res: Response) => {
        try {
            const dateRange = parseDateRange(req);
            const metrics = await adminService.getExtrasMetrics(dateRange);

            res.json({
                success: true,
                data: metrics
            });
        } catch (error: any) {
            logger.error('Extras metrics error:', { message: error?.message, stack: error?.stack });
            res.status(500).json({
                success: false,
                message: 'Error fetching extras metrics'
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
    schemaValidation(adminMetricsSchema),
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
            logger.error('Top events error:', { message: error?.message, stack: error?.stack });
            res.status(500).json({
                success: false,
                message: 'Error fetching top events'
            });
        }
    }
);

export { router as adminRouter };
