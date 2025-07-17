/**
 * Bu, Cloudflare Pages Function'dır.
 * Gelen istekleri işler, API anahtarını güvenli bir şekilde ortam değişkenlerinden alır,
 * Google Gemini API'sine bir istek gönderir ve sonucu kullanıcıya geri döndürür.
 * Bu yapı, API anahtarının asla kullanıcıya ifşa edilmemesini sağlar.
 */
export async function onRequest(context) {
  // Sadece POST isteklerine izin ver
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // API Anahtarını Cloudflare ortam değişkenlerinden (environment variables) güvenli bir şekilde al
    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('API anahtarı bulunamadı. Lütfen Cloudflare ayarlarını kontrol edin.');
    }

    // Frontend'den (index.html'den) gelen JSON verisini al
    const { prompt, imageBase64Data, isChat = false } = await context.request.json();
    
    const modelName = "gemini-2.5-flash";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // Gemini API'sine gönderilecek veri paketini (payload) oluştur
    let parts = [{ text: prompt }];
    if (imageBase64Data) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64Data } });
    }

    const payload = {
      contents: [{ role: "user", parts: parts }],
    };
    
    // Eğer istek bir sohbet değilse (yani ana soru çözümü ise), yapısal JSON formatında cevap iste
    if (!isChat) {
      payload.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "simplified_question": { "type": "STRING" },
            "solution_steps": { "type": "STRING" },
            "final_answer": { "type": "STRING" },
            "recommendations": { "type": "STRING" }
          },
          required: ["simplified_question", "solution_steps", "final_answer", "recommendations"]
        }
      };
    }

    // Cloudflare'in kendi fetch API'sini kullanarak Google Gemini'ye isteği gönder
    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Gemini API'sinden gelen cevabı kontrol et
    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.json();
      console.error('Gemini API Error:', errorBody);
      // Hata mesajını JSON formatında frontend'e geri gönder
      return new Response(JSON.stringify({ message: 'Gemini API tarafından bir hata döndürüldü.', error: errorBody.error }), {
        status: geminiResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await geminiResponse.json();

    // Başarılı cevabı JSON formatında frontend'e geri gönder
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cloudflare Function Error:', error);
    // Fonksiyonun kendisinde bir hata olursa, bunu da JSON formatında bildir
    return new Response(JSON.stringify({ message: 'Sunucu fonksiyonunda kritik bir hata oluştu.', error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
