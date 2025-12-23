import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    // SECURITY UPDATE: We removed the 'define' block that was exposing process.env.API_KEY.
    // The client now communicates with the /api/gemini proxy, so it doesn't need the key.
    define: {},
  };
});