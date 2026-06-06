import { logger } from "./logger";

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

export async function sendWhatsApp(to: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!MAKE_WEBHOOK_URL) {
    logger.warn("MAKE_WEBHOOK_URL not configured — WhatsApp message not sent");
    return { success: false, error: "WhatsApp not configured. Please set MAKE_WEBHOOK_URL." };
  }

  // Normalise phone number to E.164 format
  const digitsOnly = to.replace(/[^\d]/g, "");
  const phone = digitsOnly.startsWith("0")
    ? "+" + digitsOnly.slice(1)
    : "+" + digitsOnly;

  try {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "Make.com webhook returned error");
      return { success: false, error: `Webhook error ${response.status}: ${body}` };
    }

    logger.info({ phone }, "WhatsApp message sent via Make.com");
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Failed to call Make.com webhook");
    return { success: false, error: errorMessage };
  }
}
