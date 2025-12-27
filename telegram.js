import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export const sendTelegramAlert = async (data) => {
  console.log("📱 [Telegram] Preparing alert...");
  
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn("⚠️ [Telegram] Credentials not set in .env");
    console.warn("   Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env file");
    return false;
  }

  const h_kanan = data?.h_kanan ?? 0;
  const h_kiri = data?.h_kiri ?? 0;
  const q_kanan = data?.q_kanan ?? 0;
  const q_kiri = data?.q_kiri ?? 0;
  const status = data?.prediction?.status ?? "BANJIR";
  const confidence = data?.prediction?.confidence ?? 90;
  const recommendation = data?.prediction?.recommendation ?? "Segera evakuasi dan periksa pintu air!";
  const time = new Date(data?.timestamp || Date.now()).toLocaleString("id-ID");

  const message = `🚨 *ALERT BANJIR TERDETEKSI!* 🚨

*Waktu:* ${time}
*Status:* ${status}
*Confidence:* ${confidence}%

📊 *DATA SENSOR:*
• Tinggi Air Kanan: ${h_kanan} cm
• Tinggi Air Kiri: ${h_kiri} cm
• Debit Air Kanan: ${q_kanan} L/s
• Debit Air Kiri: ${q_kiri} L/s

⚠️ *TINDAKAN SEGERA:*
${recommendation}

📍 *Sistem Deteksi Banjir Otomatis*`;

  console.log("📱 [Telegram] Sending message to chat:", CHAT_ID);

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown",
        disable_notification: false,
      },
      {
        timeout: 10000 // 10 second timeout
      }
    );

    if (response.data.ok) {
      console.log("✅ [Telegram] Alert sent successfully!");
      return true;
    } else {
      console.error("❌ [Telegram] Failed to send:", response.data.description);
      return false;
    }
    
  } catch (error) {
    console.error("❌ [Telegram] Error:", error.message);
    if (error.response) {
      console.error("   Response:", error.response.data);
    }
    return false;
  }
};