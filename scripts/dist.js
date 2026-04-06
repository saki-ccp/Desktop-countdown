/**
 * 分发打包脚本
 * 功能：构建安装包 -> 打成 ZIP -> 生成 SHA256 校验文件
 * 用法：npm run dist
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const pkg = require(path.join(ROOT, 'package.json'));
const version = pkg.version;

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function sha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// 1. 构建 NSIS 安装包（x64 + ia32 双架构）
console.log('\n=== 步骤 1/3：构建安装包 ===\n');
run('npx electron-builder --win nsis --x64 --ia32');

// 2. 查找生成的安装包
const installerName = `zhongkao-countdown-setup-${version}.exe`;
const installerPath = path.join(DIST, installerName);

if (!fs.existsSync(installerPath)) {
  console.error(`错误：找不到安装包 ${installerPath}`);
  process.exit(1);
}

const stats = fs.statSync(installerPath);
console.log(`\n安装包已生成：${installerName} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

// 3. 生成 SHA256 校验文件
console.log('\n=== 步骤 2/3：生成校验文件 ===\n');
const hash = sha256(installerPath);
const checksumFile = path.join(DIST, `${installerName}.sha256`);
fs.writeFileSync(checksumFile, `${hash}  ${installerName}\n`, 'utf8');
console.log(`SHA256: ${hash}`);
console.log(`校验文件：${installerName}.sha256`);

// 4. 打成 ZIP（用于 U 盘分发）
console.log('\n=== 步骤 3/3：打包 ZIP 分发包 ===\n');
const zipName = `zhongkao-countdown-${version}.zip`;
const zipPath = path.join(DIST, zipName);

// 删除旧的 zip
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

// 使用 PowerShell 的 Compress-Archive 打 ZIP
const psCmd = `powershell -Command "Compress-Archive -Path '${installerPath.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}'  -Force"`;
run(psCmd);

if (fs.existsSync(zipPath)) {
  const zipStats = fs.statSync(zipPath);
  console.log(`\nZIP 分发包：${zipName} (${(zipStats.size / 1024 / 1024).toFixed(1)} MB)`);
} else {
  console.warn('警告：ZIP 打包失败，请手动压缩');
}

// 5. 输出总结
console.log('\n========================================');
console.log('  打包完成！分发文件清单：');
console.log('========================================');
console.log(`  1. ${installerName}`);
console.log(`     安装包（给学生直接运行）`);
console.log(`  2. ${zipName}`);
console.log(`     ZIP 压缩包（推荐用 U 盘分发时使用）`);
console.log(`  3. ${installerName}.sha256`);
console.log(`     校验文件（验证文件完整性）`);
console.log('========================================');
console.log('\n分发建议：');
console.log('  - 微信/QQ 传输：直接发送 .exe 安装包');
console.log('  - U 盘拷贝：请使用 .zip 压缩包，学生解压后再安装');
console.log('  - 验证完整性：certutil -hashfile 文件名 SHA256');
console.log('');
