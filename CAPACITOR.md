# Android / Capacitor

Android 版加载 APK 内置的 `dist-native`，不会把线上首页作为 WebView 的 `server.url`。房间、阿砚、CSS、JavaScript 和本地图片会随安装包分发；微信读书仍通过现有 HTTPS 服务端同步，密钥不会进入 APK。

## Debug APK

需要 Android Studio（JDK 17、Android SDK 34）：

```bash
npm install
npm run android:build
```

APK 输出在 `android/app/build/outputs/apk/debug/app-debug.apk`。也可以运行 `npm run android:open`，从 Android Studio 安装到真机。

每次网页代码变化后，`npm run android:sync` 会重新生成本地 Web bundle 并同步 Android 工程。`npm run native:verify` 会确认配置里没有远程首页，并检查 Room 与 Pet 的关键离线资源。

## 真机离线验收

1. 有网安装并打开一次，让微信读书数据成功同步。
2. 完全关闭 App，开启飞行模式。
3. 冷启动 App，检查小屋背景、阿砚动画与气泡、小屋目录和本地记录。
4. 微信读书区域应显示离线状态，并在有缓存时读取上次同步内容。

## Release 签名（真机 Debug 验收后再做）

不要提交 keystore、密码或 `android/keystore.properties`。本地创建 keystore 后，将路径与密码保存在本机环境变量或未跟踪的 Gradle 配置中，再执行 `npm run android:release`。仓库已忽略 `*.jks`、`*.keystore` 和 `android/keystore.properties`。
