import fs from "fs";

async function download() {
  const cpsUrl = "https://colegioprogressosantista.com.br/wp-content/uploads/2025/11/logo-vinho-1024x1022.webp";
  const cocUrl = "https://colegioprogressosantista.com.br/wp-content/uploads/2025/11/Logo-COC-novo-1024x473.png";

  if (!fs.existsSync("public")) {
    fs.mkdirSync("public");
  }

  const resCps = await fetch(cpsUrl);
  const bufCps = await resCps.arrayBuffer();
  fs.writeFileSync("public/cps_logo.webp", Buffer.from(bufCps));

  const resCoc = await fetch(cocUrl);
  const bufCoc = await resCoc.arrayBuffer();
  fs.writeFileSync("public/coc_logo.png", Buffer.from(bufCoc));

  console.log("Downloaded successfully");
}

download();
