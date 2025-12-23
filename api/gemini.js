import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: 'edge', // FAST: Use Edge Runtime
};

// Helper for streaming OpenAI-compatible APIs (Groq, OpenRouter, etc)
async function* streamOpenAICompatible(url, apiKey, model, messages) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://formatmaster.ai',
      'X-Title': 'FormatMaster AI',
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true
    })
  });

  if (response.status === 429) {
    throw new Error("Limit jalur ini sudah habis, silakan pindah ke jalur lain (misal: OpenRouter)!");
  }

  if (!response.ok) {
    const err = await response.text();
    // Special handling for Groq decommissioned models
    if (err.includes("model_decommissioned")) {
        throw new Error("Model AI ini sudah pensiun. Developer sedang mengupdate sistem...");
    }
    throw new Error(`Provider Error (${response.status}): ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim() === 'data: [DONE]') return;
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.slice(6));
          const text = json.choices[0]?.delta?.content || '';
          if (text) yield text;
        } catch (e) {
          // ignore
        }
      }
    }
  }
}

// Helper for Non-Streaming (Legacy/Blocking) calls
async function fetchOpenAICompatibleBlock(url, apiKey, model, messages) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://formatmaster.ai',
      'X-Title': 'FormatMaster AI',
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 4096
    })
  });

  if (response.status === 429) throw new Error("Limit jalur ini habis!");
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Error ${response.status}: ${err}`);
  }
  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { contents, config, provider = 'GOOGLE', stream = false } = await req.json();

    // --- STREAMING HANDLER ---
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            // GOOGLE STREAMING WITH FALLBACK
            if (provider === 'GOOGLE' || provider === 'GOOGLE_EXP') {
              const apiKey = process.env.API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
              if (!apiKey) throw new Error("API Key Google missing");
              const ai = new GoogleGenAI({ apiKey });
              
              // MODEL LIST TO TRY
              let modelsToTry = [];
              if (provider === 'GOOGLE_EXP') {
                 // Try Thinking first, then Standard 2.0, then 1.5
                 modelsToTry = ['gemini-2.0-flash-thinking-exp-01-21', 'gemini-2.0-flash', 'gemini-1.5-flash'];
              } else {
                 // Try 2.0 Flash first (New Standard), then 1.5 Flash (Old Faithful)
                 modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash'];
              }

              let success = false;
              let lastError = null;

              for (const model of modelsToTry) {
                try {
                  const result = await ai.models.generateContentStream({
                    model: model,
                    contents: contents,
                    config: config
                  });

                  for await (const chunk of result.stream) {
                    const text = chunk.text();
                    if (text) {
                      controller.enqueue(encoder.encode(text));
                      success = true; // Mark as success once we get data
                    }
                  }
                  
                  if (success) break; // If finished successfully, stop trying other models

                } catch (e) {
                  console.warn(`Model ${model} failed, trying next... Error: ${e.message}`);
                  lastError = e;
                  // If we already sent partial data (success=true), we can't really retry cleanly in this simple stream
                  // So we only retry if we haven't sent ANYTHING yet.
                  if (success) break; 
                }
              }

              if (!success && lastError) throw lastError;

            } else {
              // OTHER PROVIDERS
              let iterator;
              const userPrompt = typeof contents === 'string' ? contents : contents.parts?.[0]?.text || JSON.stringify(contents);
              const messages = [
                { role: "system", content: config?.systemInstruction || "You are a helpful assistant." },
                { role: "user", content: userPrompt }
              ];

              // UPDATED MODELS HERE
              if (provider === 'GROQ') {
                 // Llama 3.3 70B (Replaces 3.1)
                 iterator = streamOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, 'llama-3.3-70b-versatile', messages);
              } else if (provider === 'OPENROUTER') {
                 // Use Google Flash Lite Free via OpenRouter (Often more stable than Mistral Free)
                 iterator = streamOpenAICompatible('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, 'google/gemini-2.0-flash-lite-preview-02-05:free', messages);
              } else if (provider === 'TOGETHER') {
                 // Llama 3.3 70B Turbo
                 iterator = streamOpenAICompatible('https://api.together.xyz/v1/chat/completions', process.env.TOGETHER_API_KEY, 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', messages);
              } else if (provider === 'OLLAMA') {
                 // ... existing ollama logic ...
                 const baseUrl = process.env.OLLAMA_BASE_URL;
                 const response = await fetch(`${baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'llama3', messages, stream: true })
                 });
                 if (!response.ok) throw new Error("Ollama Error");
                 const blockText = await fetchOpenAICompatibleBlock(`${baseUrl}/api/chat`, '', 'llama3', messages); 
                 controller.enqueue(encoder.encode(blockText));
                 controller.close();
                 return; 
              }

              if (iterator) {
                for await (const textChunk of iterator) {
                  controller.enqueue(encoder.encode(textChunk));
                }
              }
            }
            controller.close();
          } catch (e) {
            console.error("Streaming Error:", e);
            controller.error(e);
          }
        }
      });

      return new Response(readable, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // --- BLOCKING HANDLER ---
    let resultText = "";
    
    if (provider === 'GOOGLE' || provider === 'GOOGLE_EXP') {
      const apiKey = process.env.API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      
      let modelsToTry = [];
      if (provider === 'GOOGLE_EXP') {
         modelsToTry = ['gemini-2.0-flash-thinking-exp-01-21', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      } else {
         modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash'];
      }

      let lastError = null;
      for (const model of modelsToTry) {
        try {
           const response = await ai.models.generateContent({
            model: model,
            contents: contents,
            config: config
          });
          resultText = response.text;
          break; // Success
        } catch (e) {
          console.warn(`Model ${model} failed (blocking), trying next...`);
          lastError = e;
        }
      }
      if (!resultText && lastError) throw lastError;

    } else {
      const userPrompt = typeof contents === 'string' ? contents : contents.parts?.[0]?.text || JSON.stringify(contents);
      const messages = [
        { role: "system", content: config?.systemInstruction || "You are a helpful assistant." },
        { role: "user", content: userPrompt }
      ];

      if (provider === 'GROQ') {
        resultText = await fetchOpenAICompatibleBlock('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, 'llama-3.3-70b-versatile', messages);
      } else if (provider === 'OPENROUTER') {
        resultText = await fetchOpenAICompatibleBlock('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, 'google/gemini-2.0-flash-lite-preview-02-05:free', messages);
      } else if (provider === 'TOGETHER') {
        resultText = await fetchOpenAICompatibleBlock('https://api.together.xyz/v1/chat/completions', process.env.TOGETHER_API_KEY, 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', messages);
      } else if (provider === 'OLLAMA') {
         const baseUrl = process.env.OLLAMA_BASE_URL;
         const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama3', messages, stream: false })
         });
         const data = await response.json();
         resultText = data.message?.content || "";
      }
    }

    return new Response(JSON.stringify({ text: resultText, provider }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    console.error("API Error:", error);
    const msg = error.message || "Internal Server Error";
    const status = (msg.includes("Limit") || msg.includes("429")) ? 429 : 500;
    return new Response(JSON.stringify({ error: msg }), { 
      status, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
}