# Invio MVP — Voice to Invoice Accuracy Test

**Date:** 2026-03-27
**Goal:** Validate that voice → transcript → field extraction works accurately in Hindi, Marathi, and English before building the full product.

---

## What We're Building

A single-page web app that lets you speak an invoice in Hindi/Marathi/English and instantly see the extracted invoice fields. No auth, no PDF, no storage — pure accuracy validation.

---

## User Flow

1. User opens the app in a browser
2. Selects language: Hindi / Marathi / English
3. Taps **Record** and speaks the invoice details naturally
4. App shows a live transcript as they speak (Web Speech API)
5. On stop, audio is sent to **Groq Whisper large-v3** for an accurate final transcript
6. Final transcript is sent to **Claude Haiku 4.5** to extract structured invoice fields
7. Extracted fields are displayed in an editable form
8. User can see what was right, what was wrong — accuracy validated

---

## Speech Input Examples

```
Hindi:   "Ramesh bhai ko 5 kilo aata, 40 rupaye kilo, GST 5 percent lagao"
Marathi: "Suresh la 3 meter kapda, 150 rupaye meter, GST 12 percent"
English: "Invoice for Raj Traders, 10 boxes of soap, 200 rupees each, 18% GST"
```

---

## Extracted Fields (Invoice Schema)

```json
{
  "buyer_name": "Ramesh",
  "items": [
    {
      "name": "Aata",
      "quantity": 5,
      "unit": "kg",
      "rate": 40,
      "gst_percent": 5,
      "amount": 200
    }
  ],
  "subtotal": 200,
  "gst_amount": 10,
  "total": 210,
  "notes": ""
}
```

---

## Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Framework | Next.js 15 (App Router) | Free |
| UI | shadcn/ui + Tailwind CSS | Free |
| Live transcript | Web Speech API (`hi-IN`, `mr-IN`, `en-IN`) | Free forever |
| Accurate transcript | Groq Whisper large-v3 | Free (7,200 req/day) |
| Field extraction | Groq Llama 3.3 70B | Free (14,400 req/day) |
| Deployment | Vercel (free tier) | Free |

> **Upgrade path:** When accuracy is validated and ready for production, swap Groq Llama → Claude Haiku 4.5 (one line change). Same API structure, better accuracy.

---

## API Routes

### `POST /api/transcribe`
- Accepts: audio blob (webm/wav)
- Sends to Groq Whisper large-v3 with language hint
- Returns: `{ transcript: string }`

### `POST /api/parse-invoice`
- Accepts: `{ transcript: string, language: "hi" | "mr" | "en" }`
- Sends to Groq Llama 3.3 70B with a structured extraction prompt
- Returns: invoice fields JSON

---

## Llama 3.3 70B Prompt (Field Extraction)

```
You are an invoice field extractor for an Indian billing app.
Extract structured invoice data from the following voice transcript.
The transcript may be in Hindi, Marathi, English, or a mix.

Return ONLY a valid JSON object with these fields:
- buyer_name (string)
- items (array of: name, quantity, unit, rate, gst_percent, amount)
- subtotal (number)
- gst_amount (number)
- total (number)
- notes (string, optional)

If a field is not mentioned, use null. Do not guess.

Transcript: "{transcript}"
```

---

## UI Screens

### Screen 1 — Record
- Language selector (3 buttons: हिंदी / मराठी / English)
- Large mic button (tap to start, tap to stop)
- Live transcript text area (updates in real time via Web Speech API)
- Status indicator: Listening → Processing → Done

### Screen 2 — Result
- Extracted fields shown as an editable form
- Fields: Buyer Name, Items table (name, qty, unit, rate, GST%), Subtotal, GST, Total
- "Try Again" button to re-record
- Accuracy feedback: thumbs up / thumbs down per field (for internal testing)

---

## Environment Variables

```
GROQ_API_KEY=your_groq_api_key_here
```

> Only one API key needed for the entire MVP.

---

## Out of Scope (MVP)

- User authentication
- PDF generation
- Invoice storage / history
- Business profile / logo
- Print functionality
- PWA / Capacitor / mobile app
- Multilingual UI (app UI stays in English for now)
- GST reports

---

## Success Criteria

- 85%+ fields extracted correctly across 20 test invoices
- Works for Hindi, Marathi, and English
- End-to-end latency under 5 seconds (record stop → fields appear)
- No crashes on ambiguous or incomplete voice input

---

## Full Product Vision (Post-MVP)

Once accuracy is validated:
- Add auth (Supabase)
- PDF generation (jsPDF + server Chromium)
- Invoice storage + history
- Cloud sync + local cache
- PWA + Capacitor (Android)
- Multilingual UI (next-intl)
- Pricing: 7-day trial → ₹299/month or ₹2,499/year
