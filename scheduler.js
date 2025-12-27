import { supabase } from './db.js';
import cron from 'node-cron';
import { sendTelegramAlert } from './telegram.js';

// Generate daily summary
export const generateDailySummary = async () => {
  try {
    console.log('\n📊 Generating daily summary...');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Get yesterday's data
    const { data: sensorData, error: fetchError } = await supabase
      .from('sensor_logs')
      .select('*')
      .gte('created_at', `${yesterdayStr}T00:00:00`)
      .lte('created_at', `${yesterdayStr}T23:59:59`);
    
    if (fetchError) {
      console.error('❌ Error fetching data:', fetchError.message);
      return;
    }
    
    if (!sensorData || sensorData.length === 0) {
      console.log('📭 No data for yesterday');
      return;
    }
    
    console.log(`📊 Processing ${sensorData.length} records for ${yesterdayStr}`);
    
    // Calculate averages
    const totals = sensorData.reduce((acc, curr) => ({
      h_kanan: acc.h_kanan + curr.h_kanan,
      h_kiri: acc.h_kiri + curr.h_kiri,
      q_kanan: acc.q_kanan + curr.q_kanan,
      q_kiri: acc.q_kiri + curr.q_kiri,
      count: acc.count + 1
    }), { h_kanan: 0, h_kiri: 0, q_kanan: 0, q_kiri: 0, count: 0 });
    
    const summary = {
      tanggal: yesterdayStr,
      avg_h_kanan: totals.h_kanan / totals.count,
      avg_h_kiri: totals.h_kiri / totals.count,
      avg_q_kanan: totals.q_kanan / totals.count,
      avg_q_kiri: totals.q_kiri / totals.count,
      count: totals.count,
      status: (totals.h_kanan / totals.count > 150 || totals.h_kiri / totals.count > 150) ? "BANJIR" : "AMAN",
      created_at: new Date().toISOString()
    };
    
    // Save to database
    const { error: upsertError } = await supabase
      .from('daily_summary')
      .upsert(summary, { onConflict: 'tanggal' });
    
    if (upsertError) {
      console.error('❌ Error saving summary:', upsertError.message);
      return;
    }
    
    console.log(`✅ Daily summary saved for ${yesterdayStr}`);
    
    // Kirim notifikasi jika kemarin banjir
    if (summary.status === "BANJIR") {
      console.log("📱 Sending daily flood summary alert...");
      await sendTelegramAlert({
        h_kanan: summary.avg_h_kanan,
        h_kiri: summary.avg_h_kiri,
        q_kanan: summary.avg_q_kanan,
        q_kiri: summary.avg_q_kiri,
        prediction: {
          status: "SUMMARY_BANJIR",
          confidence: 100,
          recommendation: `Rata-rata ketinggian air kemarin mencapai ${Math.round(summary.avg_h_kanan)} cm. Waspada!`
        },
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Failed to generate daily summary:', error.message);
  }
};

// Cleanup old sensor data (keep only 7 days)
export const cleanupOldData = async () => {
  try {
    console.log('\n🧹 Cleaning up old data...');
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { error, count } = await supabase
      .from('sensor_logs')
      .delete()
      .lt('created_at', sevenDaysAgo.toISOString())
      .select('*', { count: 'exact' });
    
    if (error) {
      console.error('❌ Error cleaning up:', error.message);
      return;
    }
    
    console.log(`🗑️ Deleted ${count} old records (older than 7 days)`);
    
  } catch (error) {
    console.error('❌ Failed to cleanup old data:', error.message);
  }
};

// Schedule tasks
export const scheduleDailySummary = () => {
  // Run at 23:59 daily
  cron.schedule('59 23 * * *', generateDailySummary, {
    timezone: "Asia/Jakarta"
  });
  
  // Cleanup at 00:30 daily
  cron.schedule('30 0 * * *', cleanupOldData, {
    timezone: "Asia/Jakarta"
  });
  
  // Test schedule every hour (for debugging)
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Scheduler is running...', new Date().toLocaleString('id-ID'));
  });
  
  console.log('⏰ Schedulers activated (daily summary & cleanup)');
};