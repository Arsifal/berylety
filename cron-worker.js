const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

// Берем переменные окружения (токены должны лежать в .env)
const SUPABASE_URL = process.env.SUPABASE_URL;
// ВАЖНО: здесь нужен SERVICE_ROLE_KEY, чтобы обойти RLS и видеть напоминания всех пользователей!
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// Функция отправки сообщения
async function sendTelegram(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
}

// Основная логика
async function processReminders() {
  const now = new Date().toISOString();

  // 1. Ищем просроченные напоминания (at <= now) и еще не отправленные (sent_at is null)
  const { data: dueReminders, error: remError } = await sb
    .from('reminders')
    .select('id, user_id, text, at')
    .lte('at', now)
    .is('sent_at', null)
    .eq('dismissed', false)
    .limit(20); // Берем пачками по 20 штук, чтобы не нагружать сервер

  if (remError) {
    console.error('Ошибка чтения напоминаний:', remError);
    return;
  }

  if (!dueReminders || dueReminders.length === 0) {
    return; // Нет новых напоминаний, спим дальше
  }

  console.log(`Найдено ${dueReminders.length} новых напоминаний. Отправляю...`);

  // 2. Для каждого напоминания находим chat_id пользователя
  for (const rem of dueReminders) {
    const { data: link } = await sb
      .from('telegram_links')
      .select('chat_id')
      .eq('user_id', rem.user_id)
      .single();

    if (link && link.chat_id) {
      // 3. Отправляем сообщение
      const timeStr = new Date(rem.at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      const message = `🔔 <b>Напоминание</b>\n\n${rem.text || 'Без текста'}\n\n🕒 <i>${timeStr}</i>`;
      
      try {
        await sendTelegram(link.chat_id, message);
        console.log(`Отправлено напоминание ${rem.id}`);
      } catch (e) {
        console.error('Ошибка отправки в ТГ:', e);
      }
    }

    // 4. В ЛЮБОМ СЛУЧАЕ ставим sent_at, чтобы не спамить этим напоминанием каждую минуту
    // (даже если пользователь отключил ТГ, мы просто помечаем его как обработанное)
    await sb.from('reminders').update({ sent_at: now }).eq('id', rem.id);
  }
}

// Запускаем проверку каждую минуту
cron.schedule('* * * * *', () => {
  processReminders().catch(console.error);
});

console.log('Доставщик напоминаний запущен...');
