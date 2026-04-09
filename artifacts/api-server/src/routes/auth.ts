import { Router, type IRouter } from "express";
import { LoginBody } from "@workspace/api-zod";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
    email: string;
  }
}

const ADMIN_EMAIL = "saiadmin@twadmin.com";
const ADMIN_PASSWORD = "5A18A8A";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { email, password } = parsed.data;

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.authenticated = true;
  req.session.email = email;

  res.json({ email, isAuthenticated: true });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ success: true, message: "Logged out" });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.authenticated) {
    res.status(401).json({ error: "Not authenticated", isAuthenticated: false });
    return;
  }
  res.json({ email: req.session.email, isAuthenticated: true });
});

export function requireAuth(req: Parameters<typeof router.use>[0] extends (...args: infer A) => unknown ? A[0] : never, res: Parameters<typeof router.use>[0] extends (...args: infer A) => unknown ? A[1] : never, next: Parameters<typeof router.use>[0] extends (...args: infer A) => unknown ? A[2] : never): void {
  if (!(req as unknown as { session: { authenticated?: boolean } }).session.authenticated) {
    (res as unknown as { status: (c: number) => { json: (d: unknown) => void } }).status(401).json({ error: "Not authenticated" });
    return;
  }
  (next as () => void)();
}

export default router;
