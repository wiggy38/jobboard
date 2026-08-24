import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		include: ['@tumaa/shared'],
	},
	build: {
		commonjsOptions: {
			// @tumaa/shared est compilé en CommonJS (consommé tel quel par
			// apps/bot, apps/api, apps/scraper) mais résolu ici via un symlink
			// pnpm hors de node_modules — Rollup ne le transforme donc pas en
			// ESM par défaut, ce qui casse le bundle client ("exports is not
			// defined").
			include: [/packages\/shared/, /node_modules/],
		},
	},
	server: {
		port: 5173,
		proxy: {
			'/api': {
				target: 'http://localhost:2999',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ''),
			},
		},
	},
});
