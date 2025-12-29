import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import { sendTelegramAlert } from './telegram.js';

// Inisialisasi Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// FUNGSI WIB
const getWIBTime = () => {
  const now = new Date();
  return new Date(now.getTime() + (7 * 60 * 60 * 1000));
};

const formatWIB = (date) => {
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const getWIBDateString = (date) => {
  const wibDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));
  const year = wibDate.getFullYear();
  const month = String(wibDate.getMonth() + 1).padStart(2, '0');
  const day = String(wibDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Generate daily summary - FULL WIB
export const generateDailySummary = async () => {
  const wibNow = getWIBTime();
  
  try {
    console.log(`\n📊 ==========================================`);
    console.log(`📊 DAILY SUMMARY - ${formatWIB(wibNow)}`);
    console.log(`📊 ==========================================`);
    
    // Tanggal KEMARIN dalam WIB
    const yesterdayWIB = new Date(wibNow);
    yesterdayWIB.setDate(yesterdayWIB.getDate() - 1);
    const yesterdayStr = getWIBDateString(yesterdayWIB);
    
    console.log(`📅 Processing data for: ${yesterdayStr} (WIB)`);
    console.log(`📅 Yesterday WIB date: ${formatWIB(yesterdayWIB)}`);
    
    // Karena semua data disimpan dalam WIB, query langsung dengan tanggal
    const { data: sensorData, error: fetchError } = await supabase
      .from('sensor_logs')
      .select('*')
      .gte('created_at', `${yesterdayStr}T00:00:00.000Z`)
      .lt('created_at', `${yesterdayStr}T23:59:59.999Z`)
      .order('created_at', { ascending: true });
    
    if (fetchError) {
      console.error(`❌ Database error:`, fetchError.message);
      return;
    }
    
    if (!sensorData || sensorData.length === 0) {
      console.log(`📭 No data found for ${yesterdayStr}`);
      
      const emptySummary = {
        tanggal: yesterdayStr,
        avg_h_kanan: 0,
        avg_h_kiri: 0,
        avg_q_kanan: 0,
        avg_q_kiri: 0,
        count: 0,
        status: "AMAN",
        prediction: 0,
        last_status: "AMAN",
        last_prediction: 0,
        created_at: wibNow.toISOString()
      };
      
      const { error: upsertError } = await supabase
        .from('daily_summary')
        .upsert(emptySummary, { onConflict: 'tanggal' });
      
      if (!upsertError) {
        console.log(`✅ Empty summary saved for ${yesterdayStr}`);
      }
      return;
    }
    
    console.log(`📊 Found ${sensorData.length} records for ${yesterdayStr}`);
    
    // Tampilkan sample waktu
    if (sensorData.length > 0) {
      const firstRecord = new Date(sensorData[0].created_at);
      const lastRecord = new Date(sensorData[sensorData.length - 1].created_at);
      console.log(`⏰ First: ${formatWIB(firstRecord)}`);
      console.log(`⏰ Last:  ${formatWIB(lastRecord)}`);
    }
    
    // Calculate statistics
    let total_h_kanan = 0;
    let total_h_kiri = 0;
    let total_q_kanan = 0;
    let total_q_kiri = 0;
    let max_h_kanan = 0;
    let max_h_kiri = 0;
    let floodCount = 0;
    
    sensorData.forEach(record => {
      const h_kanan = parseFloat(record.h_kanan);
      const h_kiri = parseFloat(record.h_kiri);
      
      total_h_kanan += h_kanan;
      total_h_kiri += h_kiri;
      total_q_kanan += parseFloat(record.q_kanan);
      total_q_kiri += parseFloat(record.q_kiri);
      
      if (h_kanan > max_h_kanan) max_h_kanan = h_kanan;
      if (h_kiri > max_h_kiri) max_h_kiri = h_kiri;
      
      if (h_kanan > 150 || h_kiri > 150) {
        floodCount++;
      }
    });
    
    const count = sensorData.length;
    const avg_h_kanan = total_h_kanan / count;
    const avg_h_kiri = total_h_kiri / count;
    const avg_q_kanan = total_q_kanan / count;
    const avg_q_kiri = total_q_kiri / count;
    
    // Determine status
    let status = "AMAN";
    let prediction = 0;
    
    if (max_h_kanan > 180 || max_h_kiri > 180) {
      status = "BAHAYA";
      prediction = 1;
    } else if (max_h_kanan > 150 || max_h_kiri > 150) {
      status = "BANJIR";
      prediction = 1;
    } else if (avg_h_kanan > 120 || avg_h_kiri > 120) {
      status = "WASPADA";
      prediction = 0;
    }
    
    const floodPercentage = (floodCount / count) * 100;
    
    const summary = {
      tanggal: yesterdayStr,
      avg_h_kanan: parseFloat(avg_h_kanan.toFixed(2)),
      avg_h_kiri: parseFloat(avg_h_kiri.toFixed(2)),
      avg_q_kanan: parseFloat(avg_q_kanan.toFixed(2)),
      avg_q_kiri: parseFloat(avg_q_kiri.toFixed(2)),
      count: count,
      status: status,
      prediction: prediction,
      last_status: status,
      last_prediction: prediction,
      created_at: wibNow.toISOString()
    };
    
    console.log(`\n📈 STATISTICS:`);
    console.log(`   Avg Height Right: ${summary.avg_h_kanan.toFixed(1)} cm`);
    console.log(`   Avg Height Left:  ${summary.avg_h_kiri.toFixed(1)} cm`);
    console.log(`   Max Height Right: ${max_h_kanan.toFixed(1)} cm`);
    console.log(`   Max Height Left:  ${max_h_kiri.toFixed(1)} cm`);
    console.log(`   Total Records:    ${count}`);
    console.log(`   Flood Events:     ${floodCount} (${floodPercentage.toFixed(1)}%)`);
    console.log(`   Status:           ${status}`);
    console.log(`   Prediction:       ${prediction}`);
    
    // Save to database
    const { error: saveError } = await supabase
      .from('daily_summary')
      .upsert(summary, { onConflict: 'tanggal' });
    
    if (saveError) {
      console.error(`❌ Error saving summary:`, saveError.message);
      return;
    }
    
    console.log(`\n✅ SUCCESS: Daily summary saved for ${yesterdayStr}`);
    
    // Send Telegram alert if flood/danger
    if (status === "BANJIR" || status === "BAHAYA") {
      console.log(`📱 Sending Telegram alert...`);
      
      const alertMessage = `📊 **LAPORAN HARIAN BANJIR**\n\n`
        + `📅 **Tanggal:** ${yesterdayStr}\n`
        + `⚠️ **Status:** ${status}\n\n`
        + `📈 **Statistik:**\n`
        + `   • Rata-rata Kanan: ${summary.avg_h_kanan.toFixed(1)} cm\n`
        + `   • Rata-rata Kiri:  ${summary.avg_h_kiri.toFixed(1)} cm\n`
        + `   • Maksimum Kanan: ${max_h_kanan.toFixed(1)} cm\n`
        + `   • Maksimum Kiri:  ${max_h_kiri.toFixed(1)} cm\n`
        + `   • Total Data: ${count}\n`
        + `   • Kejadian Banjir: ${floodCount}x\n\n`
        + (status === "BAHAYA" 
          ? `🚨 **PERINGATAN TINGGI!**\nKondisi sangat berbahaya!` 
          : `⚠️ **WASPADA BANJIR!**\nHati-hati dengan kondisi air.`);
      
      try {
        await sendTelegramAlert({
          h_kanan: summary.avg_h_kanan,
          h_kiri: summary.avg_h_kiri,
          prediction: {
            status: status,
            confidence: Math.min(100, Math.round(floodPercentage)),
            recommendation: alertMessage
          },
          timestamp: wibNow.toISOString()
        });
        console.log(`✅ Telegram alert sent`);
      } catch (telegramError) {
        console.warn(`⚠️ Failed to send Telegram:`, telegramError.message);
      }
    }
    
    console.log(`📊 ==========================================\n`);
    
  } catch (error) {
    console.error(`❌ ERROR in generateDailySummary:`, error.message);
  }
};

// Cleanup old data - 30 days in WIB
export const cleanupOldData = async () => {
  const wibNow = getWIBTime();
  
  try {
    console.log(`\n🧹 ==========================================`);
    console.log(`🧹 CLEANUP OLD DATA - ${formatWIB(wibNow)}`);
    console.log(`🧹 ==========================================`);
    
    // 30 hari yang lalu dalam WIB
    const thirtyDaysAgoWIB = new Date(wibNow);
    thirtyDaysAgoWIB.setDate(thirtyDaysAgoWIB.getDate() - 30);
    
    console.log(`🗑️ Deleting records older than: ${formatWIB(thirtyDaysAgoWIB)}`);
    
    const { count, error } = await supabase
      .from('sensor_logs')
      .delete()
      .lt('created_at', thirtyDaysAgoWIB.toISOString())
      .select('*', { count: 'exact' });
    
    if (error) {
      console.error(`❌ Cleanup error:`, error.message);
      return;
    }
    
    console.log(`✅ Deleted ${count} old records`);
    console.log(`🧹 ==========================================\n`);
    
  } catch (error) {
    console.error(`❌ Cleanup failed:`, error.message);
  }
};

// Schedule tasks - FULL WIB
export const scheduleDailySummary = () => {
  const wibNow = getWIBTime();
  
  console.log(`\n⏰ ==========================================`);
  console.log(`⏰ SCHEDULER INIT - ${formatWIB(wibNow)}`);
  console.log(`⏰ ==========================================`);
  
  // Schedule 1: Daily summary at 00:05 WIB
  cron.schedule('5 0 * * *', () => {
    const triggerTime = getWIBTime();
    console.log(`\n⏰ DAILY SUMMARY TRIGGERED - ${formatWIB(triggerTime)}`);
    generateDailySummary();
  }, {
    timezone: "Asia/Jakarta",
    scheduled: true
  });
  
  console.log(`✅ Daily summary: 00:05 WIB`);
  
  // Schedule 2: Cleanup at 01:00 WIB
  cron.schedule('0 1 * * *', () => {
    const triggerTime = getWIBTime();
    console.log(`\n⏰ CLEANUP TRIGGERED - ${formatWIB(triggerTime)}`);
    cleanupOldData();
  }, {
    timezone: "Asia/Jakarta",
    scheduled: true
  });
  
  console.log(`✅ Cleanup: 01:00 WIB`);
  
  // Test saat startup
  setTimeout(() => {
    console.log(`\n🔧 Running initial test...`);
    generateDailySummary();
  }, 3000);
  
  console.log(`\n⏰ All schedulers initialized`);
  console.log(`⏰ Timezone: WIB (Asia/Jakarta)`);
  console.log(`⏰ ==========================================\n`);
};

// Test function untuk manual trigger
export const testScheduler = async () => {
  console.log(`\n🧪 TESTING SCHEDULER MANUALLY`);
  await generateDailySummary();
};
