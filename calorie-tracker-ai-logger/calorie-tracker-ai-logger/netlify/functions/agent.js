export default async (request) => {
  try{
    if(request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const apiKey = process.env.OPENAI_API_KEY;
    if(!apiKey) return new Response("Missing OPENAI_API_KEY", { status: 500 });

    const body = await request.json();
    const message = String(body.message || "").slice(0, 500);
    const date = String(body.date || "");
    const goals = body.goals || {};
    const templates = Array.isArray(body.templates) ? body.templates : [];
    const recent = Array.isArray(body.recent) ? body.recent : [];

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        notes: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              cals: { type: "integer", minimum: 0 },
              protein: { type: "integer", minimum: 0 },
              carbs: { type: "integer", minimum: 0 },
              fat: { type: "integer", minimum: 0 }
            },
            required: ["name","cals","protein","carbs","fat"]
          }
        }
      },
      required: ["notes","items"]
    };

    const developer = [
      "You are a strict food logger for a calorie tracker app.",
      "Turn the user's message into one or more concrete food entries with estimated nutrition.",
      "Be conservative and reasonable. If portion size is missing, assume a common portion and say so in notes.",
      "Prefer matching against provided templates when an obvious match exists.",
      "Do not chat. Do not give advice. Only produce the JSON output.",
      "If nothing to log, return items: [] and notes explaining why."
    ].join("\n");

    const userContext = { date, goals, templates: templates.slice(0,50), recent: recent.slice(-10) };

    const payload = {
      model,
      input: [
        { role: "developer", content: developer },
        { role: "user", content: [
          { type: "text", text: "User message: " + message },
          { type: "text", text: "Context JSON: " + JSON.stringify(userContext) }
        ]}
      ],
      response_format: { type: "json_schema", json_schema: { name: "log_items", schema } }
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if(!resp.ok){
      const t = await resp.text();
      return new Response(t || "OpenAI error", { status: 500 });
    }

    const data = await resp.json();
    let text = data.output_text;

    if(!text){
      const out = Array.isArray(data.output) ? data.output : [];
      for(const item of out){
        if(item.type === "message" && item.role === "assistant"){
          const content = item.content || [];
          for(const part of content){
            if(part.type === "output_text" && part.text){ text = part.text; break; }
          }
        }
        if(text) break;
      }
    }

    if(!text) return new Response(JSON.stringify({ items: [], notes: "No output from model." }), { status: 200, headers: { "Content-Type":"application/json" } });

    let parsed;
    try{ parsed = JSON.parse(text); }
    catch{ return new Response(JSON.stringify({ items: [], notes: "Model returned non-JSON output." }), { status: 200, headers: { "Content-Type":"application/json" } }); }

    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const cleaned = items.slice(0,10).map(it => ({
      name: String(it.name || "Food").slice(0, 80),
      cals: Math.max(0, Math.floor(Number(it.cals || 0))),
      protein: Math.max(0, Math.floor(Number(it.protein || 0))),
      carbs: Math.max(0, Math.floor(Number(it.carbs || 0))),
      fat: Math.max(0, Math.floor(Number(it.fat || 0)))
    }));

    return new Response(JSON.stringify({ notes: String(parsed.notes||"").slice(0,240), items: cleaned }), { status: 200, headers: { "Content-Type":"application/json" } });
  }catch{
    return new Response("Server error", { status: 500 });
  }
};
