/**
 * SvelteKit's `$env/dynamic/public`, which only exists inside a SvelteKit build.
 *
 * A component test that mounts anything reaching the Supabase client pulls this in, and what
 * it wants back is an empty environment: the client degrades gracefully when the
 * `PUBLIC_SUPABASE_*` vars are unset (see CLAUDE.md), so an empty bag is a test that runs
 * against no project at all rather than one quietly pointed at a real one.
 */
export const env: Record<string, string | undefined> = {};
