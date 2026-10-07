# 颗秒日事 iOS 客户端

## 远程闹钟与位置

服务端协议不绑死 Android。iPhone 若以后接入，定位走 Core Location，闹钟必须用系统闹钟，不能用普通通知冒充。

当前状态：`NOT_VERIFIED`。没有在 iPhone 上验证远程系统闹钟，产品界面不得写成已经支持。

## 当前方案

iOS 客户端采用 Capacitor 8，将现有 React/Vite 产品作为本地 Web 资源打包进原生 iOS 壳，App ID 为 `com.yydsxwh.kemiao.days`，名称为「颗秒日事」。现有日历、待办、课程表、考试时间表、倒数日和便签功能继续复用同一套前端代码。

本地数据仍使用 `localStorage`，不新增账号或后端依赖；课程/考试提醒继续使用 Capacitor Local Notifications，因此 iOS 端可以使用系统本地通知。

## CI

GitHub Actions 的 `Deploy Days` 工作流会在 `macos-latest` 上：

1. 安装依赖；
2. 生成/同步 `ios/` Capacitor 工程；
3. 编译 iOS Simulator Debug App（关闭代码签名，仅用于构建验证）；
4. 同时上传 `days-ios-project` 和 `days-ios-simulator` 两个 Actions artifact。

这一步用于确认 iOS 工程本身能正常生成和编译。

## 真机 / TestFlight / App Store

要把客户端装到真实 iPhone 或通过 TestFlight、App Store 分发，还需要 Apple Developer Program 的签名、Bundle ID、证书/Provisioning Profile，以及 App Store Connect 中的 App 记录。ICP 备案用于中国大陆网站业务，与 Apple 的签名和 App Store 发布资质是两套体系。

正式发布前还需要准备：

- App 图标和启动图；
- App Store 截图、描述、关键词和隐私信息；
- Apple Developer Program 团队/账号；
- 真机测试，尤其是本地通知、照片/文件导入、课程表 OCR 和离线数据；
- App Store Review 所需的隐私与功能说明。

## 本地命令

```bash
npm run build:ios
npm run ios:simulator
```

其中第二条需要 macOS + Xcode，用于构建 iOS Simulator 版本。
