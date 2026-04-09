import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import visitsRouter from "./visits";
import templatesRouter from "./templates";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(visitsRouter);
router.use(templatesRouter);
router.use(notificationsRouter);

export default router;
