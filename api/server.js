const API_URL = "http://localhost:5174";

// api/server.js
import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import Database from "better-sqlite3";
import sharp from "sharp";

// --- конфиг ---
const PORT = process.env.PORT || 5174;
const app = express();


app.use(cors()); // для локальной разработки
app.use(express.json({ limit: "10mb" })); // принимаем base64 логотип

// --- база (SQLite) ---
const db = new Database("qr-history.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    color TEXT NOT NULL,
    size INTEGER NOT NULL,
    bg TEXT NOT NULL,
    format TEXT NOT NULL,      -- "png"|"svg"
    with_logo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL   -- ISO
  );
`);

// утилита: снять dataURL-префикс → Buffer
function dataUrlToBuffer(dataUrl) {
  const m = /^data:.+;base64,(.*)$/.exec(dataUrl || "");
  if (!m) return null;
  return Buffer.from(m[1], "base64");
}

app.post("/generate", async (req, res) => {
  try {
    const {
      text,
      color = "#000000",
      size = 300,
      format = "png",           // "png" | "svg"
      bg = "transparent",       // "transparent" | "#ffffff"
      logoDataUrl = null        // необязательный dataURL (png/jpg)
    } = req.body || {};

    // валидация
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text_required" });
    }
    const s = Math.max(128, Math.min(parseInt(size, 10) || 300, 1024));
    const fmt = (format === "svg") ? "svg" : "png";
    const dark = color;
    const light = bg === "transparent" ? "#00000000" : bg;

    // 1) Генерация QR
    let outBuffer;
    if (fmt === "svg") {
      const svgStr = await QRCode.toString(text, {
        type: "svg",
        color: { dark, light },
        width: s,
        errorCorrectionLevel: "H"
      });
      // SVG с логотипом не встраиваем на сервере (сложно масштабировать корректно).
      // Вернём как dataURL:
      const svgBase64 = Buffer.from(svgStr).toString("base64");
      const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;

      // запись в историю
      db.prepare(`
        INSERT INTO history (text, color, size, bg, format, with_logo, created_at)
        VALUES (@text, @color, @size, @bg, @format, @with_logo, @created_at)
      `).run({
        text, color: dark, size: s, bg: light,
        format: "svg", with_logo: 0, created_at: new Date().toISOString()
      });

      return res.json({ dataUrl });
    }
    const v = validateTextOrUrl(text);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const normalizedText = v.value;
    // PNG:
    const pngDataUrl = await QRCode.toDataURL(text, {
      color: { dark, light },
      width: s,
      errorCorrectionLevel: "H"
    });
    const qrPngBuffer = dataUrlToBuffer(pngDataUrl);

    // 2) Если есть логотип — компонуем через sharp
    let finalPngBuffer = qrPngBuffer;
    if (logoDataUrl) {
      const logoBuf = dataUrlToBuffer(logoDataUrl);
      if (!logoBuf) {
        return res.status(400).json({ error: "bad_logo_dataurl" });
      }
      // масштаб лого ≈ 25% от стороны QR
      const logoSide = Math.round(s * 0.25);
      const resizedLogo = await sharp(logoBuf)
        .resize({
          width: logoSide,
          height: logoSide,
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 0 } // прозрачный фон
        })
        .png()
        .toBuffer();

      // позиция центра
      const left = Math.round((s - logoSide) / 2);
      const top  = Math.round((s - logoSide) / 2);

      finalPngBuffer = await sharp(qrPngBuffer)
        .composite([
          // подложка-бейдж для контраста (мягкая белая плашка)
          {
            input: await sharp({
              create: {
                width: logoSide + 12,
                height: logoSide + 12,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 0.9 }
              }
            }).png().toBuffer(),
            left: left - 6,
            top: top - 6
          },
          // само лого поверх
          { input: resizedLogo, left, top }
        ])
        .png()
        .toBuffer();
    }

    // dataURL результата
    const dataUrl = `data:image/png;base64,${finalPngBuffer.toString("base64")}`;

    // запись в историю
    db.prepare(`
      INSERT INTO history (text, color, size, bg, format, with_logo, created_at)
      VALUES (@text, @color, @size, @bg, @format, @with_logo, @created_at)
    `).run({
      text, color: dark, size: s, bg: light,
      format: "png", with_logo: logoDataUrl ? 1 : 0, created_at: new Date().toISOString()
    });

    res.json({ dataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "generation_failed" });
  }
});
function normalizeUrl(value){
  try {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return new URL("https://" + value).href;
    return new URL(value).href;
  } catch { return null; }
}
function validateTextOrUrl(text){
  const v = (text || "").trim();
  if (!v) return { ok:false, error:"text_required" };
  if (v.length > 10000) return { ok:false, error:"text_too_long" }; // жёстный серв. лимит
  const looksUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || (!/\s/.test(v) && v.includes("."));
  if (looksUrl) {
    const n = normalizeUrl(v);
    if (!n) return { ok:false, error:"bad_url" };
    return { ok:true, value:n, mode:"url" };
  }
  return { ok:true, value:v, mode:"text" };
}
app.get("/history", (req, res) => {
  const rows = db.prepare(`
    SELECT id, text, color, size, bg, format, with_logo, created_at
    FROM history
    ORDER BY id DESC
    LIMIT 50
  `).all();
  res.json({ items: rows });
});

app.listen(PORT, () => {
  console.log("API listening on http://localhost:" + PORT);
});
