import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: 'edge', // FAST: Use Edge Runtime
};

// Helper for streaming OpenAI-compatible APIs (Groq, OpenRouter, etc)
// Parses SSE (Server-Sent Events) lines "data: {...}" into raw text
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
      stream: true // Enable Streaming
    })
  });

  if (response.status === 429) {
    throw new Error("Limit jalur ini sudah habis, silakan pindah ke jalur lain di menu dropdown!");
  }

  if (!response.ok) {
    const err = await response.text();
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
    buffer = lines.pop(); // Keep the last incomplete line

    for (const line of lines) {
      if (line.trim() === 'data: [DONE]') return;
      if (line.startsWith('data: ')) {
        try {
          const json = JSON.parse(line.slice(6));
          const text = json.choices[0]?.delta?.content || '';
          if (text) yield text;
        } catch (e) {
          // ignore parse errors for partial chunks
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

  if (response.status === 429) throw new Error("Limit jalur ini sudah habis!");
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Error ${response.status}: ${err}`);
  }
  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

export default async function handler(req) {
  // Edge runtime uses standard Request/Response objects
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
    const { modelName, contents, config, provider = 'GOOGLE', stream = false } = await req.json();

    // --- STREAMING HANDLER ---
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            // GOOGLE STREAMING
            if (provider === 'GOOGLE' || provider === 'GOOGLE_EXP') {
              // UPDATED: Check for both standard API_KEY and Vercel Integration GOOGLE_GENERATIVE_AI_API_KEY
              const apiKey = process.env.API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
              
              if (!apiKey) throw new Error("API Key Google missing (API_KEY or GOOGLE_GENERATIVE_AI_API_KEY)");
              const ai = new GoogleGenAI({ apiKey });
              
              // Determine model based on provider selection
              const targetModel = provider === 'GOOGLE_EXP' ? 'gemini-2.0-flash-exp' : 'gemini-1.5-flash';

              // Call Gemini Stream
              const result = await ai.models.generateContentStream({
                model: targetModel,
                contents: contents,
                config: config
              });

              for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) controller.enqueue(encoder.encode(text));
              }

            } else {
              // OTHER PROVIDERS STREAMING
              let iterator;
              const userPrompt = typeof contents === 'string' ? contents : contents.parts?.[0]?.text || JSON.stringify(contents);
              const messages = [
                { role: "system", content: config?.systemInstruction || "You are a helpful assistant." },
                { role: "user", content: userPrompt }
              ];

              if (provider === 'GROQ') {
                 iterator = streamOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, 'llama-3.1-70b-versatile', messages);
              } else if (provider === 'OPENROUTER') {
                 iterator = streamOpenAICompatible('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, 'mistralai/mistral-7b-instruct:free', messages);
              } else if (provider === 'TOGETHER') {
                 iterator = streamOpenAICompatible('https://api.together.xyz/v1/chat/completions', process.env.TOGETHER_API_KEY, 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', messages);
              } else if (provider === 'OLLAMA') {
                 const baseUrl = process.env.OLLAMA_BASE_URL;
                 const response = await fetch(`${baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'llama3', messages, stream: true })
                 });
                 if (!response.ok) throw new Error("Ollama Error");
                 
                 // Fallback block for Ollama complexity
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
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // --- BLOCKING HANDLER (Old Logic for Tables/Chapters) ---
    let resultText = "";
    
    if (provider === 'GOOGLE' || provider === 'GOOGLE_EXP') {
      // UPDATED: Check for both standard API_KEY and Vercel Integration GOOGLE_GENERATIVE_AI_API_KEY
      const apiKey = process.env.API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      
      const ai = new GoogleGenAI({ apiKey });
      const targetModel = provider === 'GOOGLE_EXP' ? 'gemini-2.0-flash-exp' : 'gemini-1.5-flash';
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: contents,
        config: config
      });
      resultText = response.text;
    } else {
      // Logic for Block requests (Chapters/Tables) using OpenAI format
      const userPrompt = typeof contents === 'string' ? contents : contents.parts?.[0]?.text || JSON.stringify(contents);
      const messages = [
        { role: "system", content: config?.systemInstruction || "You are a helpful assistant." },
        { role: "user", content: userPrompt }
      ];

      if (provider === 'GROQ') {
        resultText = await fetchOpenAICompatibleBlock('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, 'llama-3.1-70b-versatile', messages);
      } else if (provider === 'OPENROUTER') {
        resultText = await fetchOpenAICompatibleBlock('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, 'mistralai/mistral-7b-instruct:free', messages);
      } else if (provider === 'TOGETHER') {
        resultText = await fetchOpenAICompatibleBlock('https://api.together.xyz/v1/chat/completions', process.env.TOGETHER_API_KEY, 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', messages);
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
    const status = msg.includes("Limit") ? 429 : 500;
    return new Response(JSON.stringify({ error: msg }), { 
      status, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
}