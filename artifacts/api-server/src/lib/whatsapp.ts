import { logger } from "./logger";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const RAW_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "+14155238886";

// Always ensure the from number has the whatsapp: prefix, regardless of how the secret was stored
const TWILIO_WHATSAPP_NUMBER = RAW_WHATSAPP_NUMBER.startsWith("whatsapp:")
  ? RAW_WHATSAPP_NUMBER
  : `whatsapp:${RAW_WHATSAPP_NUMBER}`;

export async function sendWhatsApp(to: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    logger.warn("Twilio credentials not configured — WhatsApp message not sent");
    return { success: false, error: "WhatsApp not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER." };
  }

  try {
    const twilio = await import("twilio");
    const client = twilio.default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    // Strip everything except digits and leading +
    const digitsOnly = to.replace(/[^\d+]/g, "").replace(/^\+?/, "+");
    const toFormatted = `whatsapp:${digitsOnly}`;

    logger.info({ from: TWILIO_WHATSAPP_NUMBER, to: toFormatted }, "Sending WhatsApp message");

    await client.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: toFormatted,
      body: message,
    });

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Failed to send WhatsApp message");
    return { success: false, error: errorMessage };
  }
}
