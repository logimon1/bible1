const fs = require("fs/promises");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.resolve(projectRoot, "public");
const expectedOutputRoot = path.join(projectRoot, "public");

if (outputRoot !== expectedOutputRoot || path.dirname(outputRoot) !== projectRoot) {
  throw new Error("정적 출력 폴더 경로가 안전하지 않습니다.");
}

async function buildStatic() {
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });

  for (const fileName of ["index.html", "app.js", "styles.css"]) {
    await fs.copyFile(path.join(projectRoot, fileName), path.join(outputRoot, fileName));
  }

  await fs.cp(path.join(projectRoot, "assets"), path.join(outputRoot, "assets"), {
    recursive: true
  });

  console.log("Vercel 정적 앱 출력 준비 완료: public/");
}

buildStatic().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
