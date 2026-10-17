// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { SITE_URL } from './src/consts';

export default defineConfig({
	site: process.env.SITE_URL ?? SITE_URL,
	base: process.env.BASE_PATH ?? '/',
	integrations: [mdx(), sitemap()],
	// Windows + Node 24 下 localhost 可能只绑定到 IPv6 ::1，浏览器走 127.0.0.1 就会「无法访问」。
	// 显式绑定回环 IPv4；需要手机/局域网调试时用 `npm run dev -- --host 0.0.0.0` 覆盖。
	server: {
		host: '127.0.0.1',
	},
	vite: {
		plugins: [tailwindcss()],
	},
	prefetch: true,
	markdown: {
		shikiConfig: {
			themes: {
				light: 'github-light',
				dark: 'github-dark',
			},
			defaultColor: false,
		},
	},
});
