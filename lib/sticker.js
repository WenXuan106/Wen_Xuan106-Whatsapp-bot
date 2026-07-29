const crypto = require("crypto");
const webp = require("node-webpmux");

// WhatsApp reads the sticker pack name/author/emojis from a specific EXIF
// block embedded in the webp file. This writes that block so stickers show
// up properly instead of as a blank pack.
async function addStickerExif(webpBuffer, { packname = "My WhatsApp Bot", author = "" } = {}) {
  const img = new webp.Image();
  await img.load(webpBuffer);

  const stickerMeta = {
    "sticker-pack-id": crypto.randomBytes(32).toString("hex"),
    "sticker-pack-name": packname,
    "sticker-pack-publisher": author,
    emojis: ["🎌"],
  };

  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16,
    0x00, 0x00, 0x00,
  ]);
  const jsonBuffer = Buffer.from(JSON.stringify(stickerMeta), "utf8");
  const exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);
  img.exif = exif;

  return img.save(null);
}

module.exports = { addStickerExif };
