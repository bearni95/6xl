import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		globals: true,
		environment: 'happy-dom',
		setupFiles: ['./test/setup.ts'],
		include: ['test/**/*.{test,spec}.{js,ts}'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules/', 'test/', '**/*.d.ts', '**/*.config.*', '**/mockData', 'dist/']
		}
	},
	resolve: {
		// The browser build of Svelte, so a component test mounts a component rather than
		// asking the server build to.
		conditions: ['browser'],
		alias: {
			$lib: resolve(__dirname, './src/lib'),
			$components: resolve(__dirname, './src/components'),
			$services: resolve(__dirname, './src/services'),
			// types/utils/adapters now live in the @3xl/shared workspace package.
			$adapters: resolve(__dirname, '../shared/src/adapters'),
			$types: resolve(__dirname, '../shared/src/types'),
			$utils: resolve(__dirname, '../shared/src/utils'),
			$sharedComponents: resolve(__dirname, '../shared/src/components'),
			$app: resolve(__dirname, './test/mocks/$app'),
			// SvelteKit's own env module, which only exists inside a SvelteKit build: a component
			// test that reaches the Supabase client needs it to resolve to an empty environment.
			'$env/dynamic/public': resolve(__dirname, './test/mocks/$env/dynamic/public.ts')
		}
	}
});
