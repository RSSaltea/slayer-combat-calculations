// RuneScape does not allow browser-origin requests. These development-only
// proxies keep the browser on localhost while Vite fetches the API upstream.
export default {
  server: {
    proxy: {
      '/api/hiscores': {
        target: 'https://r.jina.ai',
        changeOrigin: true,
        rewrite: (path) => '/https://secure.runescape.com/m=hiscore/index_lite.ws' + (path.includes('?') ? path.slice(path.indexOf('?')) : ''),
      },
      '/api/quests': {
        target: 'https://r.jina.ai',
        changeOrigin: true,
        rewrite: (path) => '/https://apps.runescape.com/runemetrics/quests' + (path.includes('?') ? path.slice(path.indexOf('?')) : ''),
      },
    },
  },
};
