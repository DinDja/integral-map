const PAGES_URL = 'https://conectabahia.pages.dev/api/refresh';

export default {
  async scheduled(event, env, ctx) {
    console.log('[Cron] Iniciando refresh agendado do cache SharePoint...');
    try {
      const res = await fetch(PAGES_URL, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        console.log(`[Cron] Refresh concluído (HTTP ${res.status})`);
      } else {
        console.error(`[Cron] Refresh falhou (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error('[Cron] Erro no refresh:', err.message);
    }
  },
};
