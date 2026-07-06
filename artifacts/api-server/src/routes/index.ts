import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import visitsRouter from "./visits";
import templatesRouter from "./templates";
import notificationsRouter from "./notifications";
import profileRouter from "./profile";
import storageRouter from "./storage";
import photosRouter from "./photos";
import aiSettingsRouter from "./ai-settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(visitsRouter);
router.use(templatesRouter);
router.use(notificationsRouter);
router.use(profileRouter);
router.use(storageRouter);
router.use(photosRouter);
router.use(aiSettingsRouter);

export default router;
