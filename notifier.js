import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Send Telegram alert
export const sendTelegramAlert = async (data) => {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram credentials not set');
    return;
  }
  
  try {
    const { sensorData, prediction, timestamp } = data;
    const time = new Date(timestamp).toLocaleString('id-ID');
    
    const message = `
🚨 *PERINGATAN BANJIR* 🚨

*Waktu:* ${time}
*Status:* ${prediction.status}
*Sensor:* ${sensorData.sensor_id}

*Data Sensor:*
• H Kanan: ${sensorData.h_kanan} cm
• H Kiri: ${sensorData.h_kiri} cm
• Q Kanan: ${sensorData.q_kanan} L/s
• Q Kiri: ${sensorData.q_kiri} L/s

*Rekomendasi:*
${prediction.recommendation || 'Segera evakuasi dan periksa pintu air!'}

_Sistem Monitoring Banjir Otomatis_
    `;
    
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
    
    console.log('📱 Telegram alert sent');
    
  } catch (error) {
    console.error('❌ Failed to send Telegram:', error.message);
  }
};