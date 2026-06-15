import sharp from "sharp";

type GfaResult = {
  gfa: string;
  width: number;
  height: number;
};

export async function pngToGFA(
  imagePath: string,
  maxWidth: number,
  maxHeight: number
): Promise<GfaResult> {
  const meta = await sharp(imagePath).metadata();

  if (!meta.width || !meta.height) {
    throw new Error("Não foi possível ler dimensões da imagem.");
  }

  // Redimensiona proporcionalmente, remove transparência em fundo branco
  const resized = await sharp(imagePath)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .grayscale()
    .threshold(180)
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();

  const finalWidth = maxWidth;
  const finalHeight = maxHeight;

  const left = Math.floor((finalWidth - (resizedMeta.width || 0)) / 2);
  const top = Math.floor((finalHeight - (resizedMeta.height || 0)) / 2);

  const { data: finalImage, info } = await sharp({
    create: {
      width: finalWidth,
      height: finalHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: resized,
        left,
        top,
      },
    ])
    .grayscale()
    .threshold(180)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const bytesPerRow = Math.ceil(finalWidth / 8);
  const totalBytes = bytesPerRow * finalHeight;

  const hexRows: string[] = [];

  for (let y = 0; y < finalHeight; y++) {
    let rowHex = "";

    for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex++) {
      let byte = 0;

      for (let bit = 0; bit < 8; bit++) {
        const x = byteIndex * 8 + bit;

        byte <<= 1;

        if (x < finalWidth) {
          const idx = (y * finalWidth + x) * channels;
          const pixel = finalImage[idx]; // pega o primeiro canal

          // preto imprime, branco não imprime
          if (pixel < 128) {
            byte |= 1;
          }
        }
      }

      rowHex += byte.toString(16).toUpperCase().padStart(2, "0");
    }

    hexRows.push(rowHex);
  }

  const data = hexRows.join("");
  const gfa = `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${data}`;

  return {
    gfa,
    width: finalWidth,
    height: finalHeight,
  };
}